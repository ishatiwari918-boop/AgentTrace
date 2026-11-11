const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const KEY = process.env.AGENTTRACE_KEY;
const TOTAL = Number(process.env.TOTAL ?? 20000);
const BATCH = Number(process.env.BATCH ?? 50);
const CONC = Number(process.env.CONC ?? 10);
const WARMUP_BATCHES = 10;
const SPANS_PER_TRACE = 10;

if (!KEY) {
  console.error("Set AGENTTRACE_KEY to the key of the 'loadtest' project first");
  process.exit(1);
}

const runId = Date.now().toString(36);

function makeSpan(i: number) {
  const trace = Math.floor(i / SPANS_PER_TRACE);
  const pos = i % SPANS_PER_TRACE;
  const start = Date.now() - 1000;
  const isLlm = pos === SPANS_PER_TRACE - 1;
  return {
    trace_id: `t_load_${runId}_${trace}`,
    span_id: `s_load_${runId}_${trace}_${pos}`,
    parent_id: pos === 0 ? null : `s_load_${runId}_${trace}_0`,
    name: pos === 0 ? "loadtest-root" : isLlm ? "loadtest-llm" : "loadtest-step",
    kind: pos === 0 ? "chain" : isLlm ? "llm" : "tool",
    start_time: new Date(start).toISOString(),
    end_time: new Date(start + 20 + pos * 15).toISOString(),
    input: { question: "How does the corrective filter work?", step: pos },
    output: { answer: "It drops low-relevance and stale chunks before generation." },
    model: isLlm ? "test-model" : null,
    tokens_in: isLlm ? 820 : null,
    tokens_out: isLlm ? 140 : null,
    cost_usd: isLlm ? 0.000594 : null,
    status: "ok",
    error: null,
    metadata: { loadtest: true },
  };
}

function makeBatch(b: number) {
  const spans = [];
  for (let j = 0; j < BATCH; j++) spans.push(makeSpan(b * BATCH + j));
  return spans;
}

interface Result {
  ms: number;
  ok: boolean;
  saved: number;
}

async function send(b: number): Promise<Result> {
  const body = JSON.stringify({ spans: makeBatch(b) });
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body,
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      return { ms: performance.now() - t0, ok: false, saved: 0 };
    }
    const data = (await res.json()) as { saved?: number };
    return { ms: performance.now() - t0, ok: true, saved: data.saved ?? 0 };
  } catch {
    return { ms: performance.now() - t0, ok: false, saved: 0 };
  }
}

async function runBatches(from: number, count: number): Promise<Result[]> {
  const end = from + count;
  let next = from;
  const results: Result[] = [];
  async function worker() {
    while (true) {
      const b = next++;
      if (b >= end) return;
      results.push(await send(b));
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  return results;
}

async function main() {
  const nBatches = Math.ceil(TOTAL / BATCH);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Config: ${TOTAL} spans, ${BATCH} per request, ${CONC} parallel requests`);

  const warm = await runBatches(0, WARMUP_BATCHES);
  const warmSaved = warm.reduce((sum, r) => sum + r.saved, 0);

  const t0 = performance.now();
  const results = await runBatches(WARMUP_BATCHES, nBatches);
  const seconds = (performance.now() - t0) / 1000;

  const good = results.filter((r) => r.ok);
  const errors = results.length - good.length;
  const saved = good.reduce((sum, r) => sum + r.saved, 0);
  const lat = good.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) =>
    lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : NaN;
  const mean = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : NaN;

  console.log("");
  console.log(`Time:        ${seconds.toFixed(2)} s`);
  console.log(`Requests:    ${results.length} (errors: ${errors})`);
  console.log(`Spans saved: ${saved} (plus ${warmSaved} during warmup)`);
  console.log(`Database should now hold: ${saved + warmSaved} loadtest spans`);
  console.log(
    `Throughput:  ${(saved / seconds).toFixed(0)} spans/s (${(results.length / seconds).toFixed(1)} requests/s)`
  );
  console.log(
    `Latency per request (ms): mean ${mean.toFixed(1)} | p50 ${pct(0.5).toFixed(1)} | p95 ${pct(0.95).toFixed(1)} | p99 ${pct(0.99).toFixed(1)} | max ${lat[lat.length - 1]?.toFixed(1)}`
  );
}

main();