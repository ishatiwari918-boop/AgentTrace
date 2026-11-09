import { storage, currentContext } from "./context";
import { DEFAULT_PRICES, PriceTable, estimateCost, extractText, extractUsage } from "./pricing";

export interface AgentTraceOptions {
  apiKey: string;
  baseUrl?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  maxRetries?: number;
  shutdownTimeoutMs?: number;
  debug?: boolean;
  pricing?: PriceTable;
}

type SpanKind = "chain" | "llm" | "retrieval" | "tool";

export interface TraceOptions {
  kind?: SpanKind;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface LlmOptions {
  input?: unknown;
  metadata?: Record<string, unknown>;
  model?: string;
}

type SpanPayload = Record<string, unknown>;
type SendResult = "ok" | "retry" | "drop";

export class AgentTrace {
  private apiKey: string;
  private baseUrl: string;
  private maxBatchSize: number;
  private maxQueueSize: number;
  private maxRetries: number;
  private shutdownTimeoutMs: number;
  private debug: boolean;
  private prices: PriceTable;
  private queue: SpanPayload[] = [];
  private timer: ReturnType<typeof setInterval>;
  private inFlight: Promise<void> = Promise.resolve();
  private draining = false;
  private deadline = Infinity;
  private overflowWarned = false;
  private onBeforeExit = () => {
    void this.flushNow();
  };

  constructor(options: AgentTraceOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "http://localhost:4000").replace(/\/$/, "");
    this.maxBatchSize = Math.min(options.maxBatchSize ?? 50, 500);
    this.maxQueueSize = options.maxQueueSize ?? 10000;
    this.maxRetries = options.maxRetries ?? 5;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10000;
    this.debug = options.debug ?? false;
    this.prices = { ...DEFAULT_PRICES, ...(options.pricing ?? {}) };

    this.timer = setInterval(() => {
      void this.flushNow();
    }, options.flushIntervalMs ?? 2000);
    this.timer.unref();

    process.once("beforeExit", this.onBeforeExit);
  }

  trace<T>(name: string, fn: () => Promise<T>, options: TraceOptions = {}): Promise<T> {
    return this.run(name, fn, options, options.kind ?? "chain", null);
  }

  llm<T>(name: string, fn: () => Promise<T>, options: LlmOptions = {}): Promise<T> {
    return this.run(
      name,
      fn,
      { input: options.input, metadata: options.metadata },
      "llm",
      options.model ?? null,
      (result) => {
        const usage = extractUsage(result);
        const model = usage.model ?? options.model ?? null;
        const tokensIn = usage.tokensIn ?? null;
        const tokensOut = usage.tokensOut ?? null;
        const cost =
          model !== null && tokensIn !== null && tokensOut !== null
            ? estimateCost(model, tokensIn, tokensOut, this.prices)
            : null;
        return {
          output: extractText(result) ?? result,
          model,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: cost,
        };
      }
    );
  }

  flush(): Promise<void> {
    return this.keepAlive(() => this.flushNow());
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    process.removeListener("beforeExit", this.onBeforeExit);
    this.deadline = Date.now() + this.shutdownTimeoutMs;
    await this.keepAlive(async () => {
      await this.flushNow();
      await this.flushNow();
    });
  }

  private async run<T>(
    name: string,
    fn: () => Promise<T>,
    options: TraceOptions,
    kind: SpanKind,
    model: string | null,
    describe?: (result: T) => SpanPayload
  ): Promise<T> {
    const parent = currentContext();
    const traceId = parent?.traceId ?? `t_${globalThis.crypto.randomUUID()}`;
    const parentId = parent?.spanId ?? null;
    const spanId = `s_${globalThis.crypto.randomUUID()}`;
    const start = new Date();

    let output: unknown = null;
    let extra: SpanPayload = {};
    let status: "ok" | "error" = "ok";
    let errorMessage: string | null = null;

    try {
      const result = await storage.run({ traceId, spanId }, fn);
      output = result;
      if (describe) {
        try {
          extra = describe(result);
        } catch {
          // Reading usage details must never break the app.
        }
      }
      return result;
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const span: SpanPayload = {
        trace_id: traceId,
        span_id: spanId,
        parent_id: parentId,
        name,
        kind,
        start_time: start.toISOString(),
        end_time: new Date().toISOString(),
        input: options.input ?? null,
        output,
        model,
        status,
        error: errorMessage,
        metadata: options.metadata ?? {},
      };
      Object.assign(span, extra);
      this.enqueue(span);
    }
  }

  private enqueue(span: SpanPayload): void {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      if (!this.overflowWarned) {
        this.overflowWarned = true;
        console.warn(
          `[agenttrace] queue is full (${this.maxQueueSize} spans); dropping the oldest spans`
        );
      }
    }
    this.queue.push(span);
    if (this.queue.length >= this.maxBatchSize) {
      void this.flushNow();
    }
  }

  private flushNow(): Promise<void> {
    if (this.draining || this.queue.length === 0) return this.inFlight;
    this.draining = true;
    this.inFlight = this.drain().finally(() => {
      this.draining = false;
    });
    return this.inFlight;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxBatchSize);
      await this.deliver(batch);
    }
  }

  private async deliver(batch: SpanPayload[]): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const result = await this.send(batch);
      if (result === "ok" || result === "drop") return;

      const delay = Math.min(500 * 2 ** attempt, 8000) * (0.5 + Math.random() / 2);
      if (attempt >= this.maxRetries || Date.now() + delay >= this.deadline) {
        console.warn(`[agenttrace] gave up on ${batch.length} spans after ${attempt + 1} attempts`);
        return;
      }
      if (this.debug) {
        console.warn(
          `[agenttrace] send failed (attempt ${attempt + 1}), retrying in ${Math.round(delay)} ms`
        );
      }
      await this.sleep(delay);
    }
  }

  private async send(spans: SpanPayload[]): Promise<SendResult> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ spans }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return "ok";
      if (res.status === 429 || res.status >= 500) return "retry";
      console.warn(`[agenttrace] dropped ${spans.length} spans: server answered ${res.status}`);
      return "drop";
    } catch {
      return "retry";
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms).unref();
    });
  }

  private async keepAlive(fn: () => Promise<void>): Promise<void> {
    const keep = setInterval(() => {}, 1000);
    try {
      await fn();
    } finally {
      clearInterval(keep);
    }
  }
}