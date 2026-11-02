import { AgentTrace } from "../src/index";

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

const apiKey = process.env.AGENTTRACE_KEY;
if (!apiKey) {
  console.error("Set AGENTTRACE_KEY first");
  process.exit(1);
}

const tracer = new AgentTrace({ apiKey });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const answer = await tracer.trace(
    "answer-question",
    async () => {
      await sleep(400);
      return { answer: "Auth is handled in auth.ts" };
    },
    { input: { question: "Where is auth handled?" }, metadata: { app: "demo" } }
  );
  console.log("1. returned:", answer);

  try {
    await tracer.trace("failing-step", async () => {
      await sleep(100);
      throw new Error("LLM timeout");
    });
  } catch (err) {
    console.log("2. error passed through:", (err as Error).message);
  }

  const n = await tracer.trace("add-numbers", async () => 2 + 3);
  console.log("3. returned:", n);
}

main();