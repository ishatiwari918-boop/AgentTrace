import { AgentTrace } from "../src/index";

const apiKey = process.env.AGENTTRACE_KEY;
if (!apiKey) {
  console.error("Set AGENTTRACE_KEY first");
  process.exit(1);
}

const tracer = new AgentTrace({ apiKey });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retrieve() {
  return tracer.trace(
    "retrieve-chunks",
    async () => {
      const [a, b] = await Promise.all([
        tracer.trace("vector-search", async () => { await sleep(120); return 5; }, { kind: "retrieval" }),
        tracer.trace("keyword-search", async () => { await sleep(150); return 3; }, { kind: "retrieval" }),
      ]);
      return a + b;
    },
    { kind: "retrieval" }
  );
}

async function main() {
  const answer = await tracer.trace(
    "answer-question",
    async () => {
      const chunks = await retrieve();
      await tracer.trace("rerank", async () => { await sleep(100); });
      await tracer.trace("llm-answer", async () => { await sleep(400); return "Auth is in auth.ts"; }, { kind: "llm" });
      return `used ${chunks} chunks`;
    },
    { input: { question: "Where is auth handled?" } }
  );
  console.log("returned:", answer);
}

main().finally(() => tracer.shutdown());