import { AgentTrace } from "../src/index";

const apiKey = process.env.AGENTTRACE_KEY;
if (!apiKey) {
  console.error("Set AGENTTRACE_KEY first");
  process.exit(1);
}

const tracer = new AgentTrace({ apiKey });
const groqKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fakeLlm(): Promise<any> {
  await sleep(300);
  return {
    model: "llama-3.3-70b-versatile",
    choices: [{ message: { role: "assistant", content: "Auth is handled in auth.ts" } }],
    usage: { prompt_tokens: 820, completion_tokens: 140 },
  };
}

async function groqLlm(question: string): Promise<any> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: groqModel,
      messages: [{ role: "user", content: question }],
      max_tokens: 100,
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  return res.json();
}

async function main() {
  await tracer.trace("answer-question", async () => {
    const fake = await tracer.llm("fake-llm", fakeLlm, {
      input: { question: "Where is auth handled?" },
    });
    console.log("fake:", fake.choices[0].message.content);

    if (groqKey) {
      const question = "In one sentence, what is observability?";
      const real = await tracer.llm("groq-llm", () => groqLlm(question), {
        input: { question },
        model: groqModel,
      });
      console.log("groq:", real.choices[0].message.content);
    } else {
      console.log("GROQ_API_KEY not set, skipping the real call");
    }
  });
}

main().finally(() => tracer.shutdown());