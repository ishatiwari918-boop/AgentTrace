export interface AgentTraceOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface TraceOptions {
  kind?: "chain" | "llm" | "retrieval" | "tool";
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export class AgentTrace {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: AgentTraceOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "http://localhost:4000").replace(/\/$/, "");
  }

  async trace<T>(name: string, fn: () => Promise<T>, options: TraceOptions = {}): Promise<T> {
    const traceId = `t_${globalThis.crypto.randomUUID()}`;
    const spanId = `s_${globalThis.crypto.randomUUID()}`;
    const start = new Date();

    let output: unknown = null;
    let status: "ok" | "error" = "ok";
    let errorMessage: string | null = null;

    try {
      const result = await fn();
      output = result;
      return result;
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      await this.send({
        trace_id: traceId,
        span_id: spanId,
        parent_id: null,
        name,
        kind: options.kind ?? "chain",
        start_time: start.toISOString(),
        end_time: new Date().toISOString(),
        input: options.input ?? null,
        output,
        status,
        error: errorMessage,
        metadata: options.metadata ?? {},
      });
    }
  }

  private async send(span: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ spans: [span] }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        console.warn(`[agenttrace] ingest failed with status ${res.status}`);
      }
    } catch {
      // Monitoring must never break the app it monitors.
    }
  }
}