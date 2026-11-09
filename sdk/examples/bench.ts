import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { AgentTrace } from "../src/index";

const N = 20000;
const WARMUP = 2000;

let received = 0;
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    try {
      received += JSON.parse(Buffer.concat(chunks).toString()).spans.length;
    } catch {
      // ignore
    }
    res.statusCode = 200;
    res.end("{}");
  });
});

async function measure(run: () => Promise<unknown>) {
  const times: number[] = [];
  for (let i = 0; i < WARMUP + N; i++) {
    const t0 = performance.now();
    await run();
    const dt = performance.now() - t0;
    if (i >= WARMUP) times.push(dt);
    if (i % 200 === 0) await new Promise((r) => setImmediate(r));
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    mean: mean * 1000,
    p50: times[Math.floor(times.length * 0.5)] * 1000,
    p99: times[Math.floor(times.length * 0.99)] * 1000,
  };
}

async function main() {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const tracer = new AgentTrace({
    apiKey: "bench",
    baseUrl: url,
    maxQueueSize: 100000,
    flushIntervalMs: 500,
  });

  const work = async () => 1;

  const bare = await measure(() => work());
  const traced = await measure(() => tracer.trace("bench", work));
  await tracer.shutdown();

  const us = (n: number) => n.toFixed(1).padStart(8);
  console.log(`\nCalls measured per case: ${N}\n`);
  console.log("             mean (us)   p50 (us)   p99 (us)");
  console.log(`bare       ${us(bare.mean)}  ${us(bare.p50)}  ${us(bare.p99)}`);
  console.log(`traced     ${us(traced.mean)}  ${us(traced.p50)}  ${us(traced.p99)}`);
  console.log(`\nOverhead per call: ${(traced.mean - bare.mean).toFixed(1)} us (mean)`);
  console.log(`Spans sent: ${WARMUP + N}, spans received by server: ${received}`);

  server.closeAllConnections?.();
  server.close();
}

main();