import { AgentTrace } from "../src/index";

const apiKey = process.env.AGENTTRACE_KEY;
if (!apiKey) {
  console.error("Set AGENTTRACE_KEY first");
  process.exit(1);
}
const tracer = new AgentTrace({ apiKey, debug: true, maxRetries: 20, shutdownTimeoutMs: 90000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const result = await tracer.trace(
    "retry-demo",
    async () => {
      await sleep(100);
      return "done";
    },
    { metadata: { demo: "retry" } }
  );
  console.log("returned:", result);
  console.log("now sending... (start the server if it is stopped)");
}

main().finally(() => tracer.shutdown().then(() => console.log("finished")));