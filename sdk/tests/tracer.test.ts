import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentTrace } from "../src/index";
import { deliveredSpans, withServer } from "./helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("trace returns the function result unchanged", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({ apiKey: "k", baseUrl: server.url });
    const result = await tracer.trace("add", async () => 2 + 3);
    assert.equal(result, 5);
    await tracer.shutdown();
  });
});

test("nested spans link to the right parents, even in parallel", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({ apiKey: "k", baseUrl: server.url });
    await tracer.trace("root", async () => {
      await tracer.trace("a", async () => {
        await sleep(5);
      });
      await Promise.all([
        tracer.trace("b1", async () => sleep(10)),
        tracer.trace("b2", async () => sleep(5)),
      ]);
    });
    await tracer.shutdown();

    const spans = deliveredSpans(server);
    const by = Object.fromEntries(spans.map((s) => [s.name, s]));
    assert.equal(spans.length, 4);
    assert.equal(by.root.parent_id, null);
    assert.equal(by.a.parent_id, by.root.span_id);
    assert.equal(by.b1.parent_id, by.root.span_id);
    assert.equal(by.b2.parent_id, by.root.span_id);
    assert.equal(new Set(spans.map((s) => s.trace_id)).size, 1);
  });
});

test("errors are recorded and re-thrown to the caller", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({ apiKey: "k", baseUrl: server.url });
    await assert.rejects(
      () =>
        tracer.trace("boom", async () => {
          throw new Error("LLM timeout");
        }),
      /LLM timeout/
    );
    await tracer.shutdown();

    const span = deliveredSpans(server)[0];
    assert.equal(span.status, "error");
    assert.equal(span.error, "LLM timeout");
  });
});

test("llm() records model, tokens, cost and the reply text", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({ apiKey: "k", baseUrl: server.url });
    await tracer.llm("answer", async () => ({
      model: "llama-3.3-70b-versatile",
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 820, completion_tokens: 140 },
    }));
    await tracer.shutdown();

    const span = deliveredSpans(server)[0];
    assert.equal(span.kind, "llm");
    assert.equal(span.model, "llama-3.3-70b-versatile");
    assert.equal(span.tokens_in, 820);
    assert.equal(span.tokens_out, 140);
    assert.equal(span.cost_usd, 0.000594);
    assert.equal(span.output, "hi");
  });
});

test("llm() leaves cost empty for an unknown model", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({ apiKey: "k", baseUrl: server.url });
    await tracer.llm("answer", async () => ({
      model: "mystery-model",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    await tracer.shutdown();

    const span = deliveredSpans(server)[0];
    assert.equal(span.model, "mystery-model");
    assert.equal(span.cost_usd, null);
  });
});

test("spans are sent in batches, not one request each", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({
      apiKey: "k",
      baseUrl: server.url,
      maxBatchSize: 50,
      flushIntervalMs: 60000,
    });
    for (let i = 0; i < 120; i++) {
      await tracer.trace(`s${i}`, async () => i);
    }
    await tracer.shutdown();

    const ok = server.requests.filter((r) => r.status === 200);
    assert.equal(deliveredSpans(server).length, 120);
    assert.ok(ok.every((r) => r.spans.length <= 50));
    assert.ok(ok.length < 10);
  });
});

test("the API key is sent as a Bearer token", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({ apiKey: "at_secret", baseUrl: server.url });
    await tracer.trace("x", async () => 1);
    await tracer.shutdown();
    assert.equal(server.requests[0].auth, "Bearer at_secret");
  });
});

test("a failed send is retried and the span arrives exactly once", async () => {
  await withServer([503, 503], async (server) => {
    const tracer = new AgentTrace({
      apiKey: "k",
      baseUrl: server.url,
      maxRetries: 5,
      shutdownTimeoutMs: 15000,
    });
    await tracer.trace("retry-me", async () => 1);
    await tracer.shutdown();

    assert.deepEqual(
      server.requests.map((r) => r.status),
      [503, 503, 200]
    );
    assert.equal(deliveredSpans(server).length, 1);
  });
});

test("a 401 is dropped immediately without retrying", async () => {
  await withServer([401], async (server) => {
    const tracer = new AgentTrace({ apiKey: "bad", baseUrl: server.url });
    await tracer.trace("x", async () => 1);
    await tracer.shutdown();
    assert.equal(server.requests.length, 1);
  });
});

test("the app keeps working when the server is unreachable", async () => {
  const tracer = new AgentTrace({
    apiKey: "k",
    baseUrl: "http://127.0.0.1:1",
    maxRetries: 2,
    shutdownTimeoutMs: 800,
  });
  const result = await tracer.trace("x", async () => "fine");
  assert.equal(result, "fine");

  const started = Date.now();
  await tracer.shutdown();
  assert.ok(Date.now() - started < 3000);
});

test("a full queue drops the oldest spans, keeps the newest", async () => {
  await withServer([], async (server) => {
    const tracer = new AgentTrace({
      apiKey: "k",
      baseUrl: server.url,
      maxQueueSize: 10,
      maxBatchSize: 50,
      flushIntervalMs: 60000,
    });
    for (let i = 0; i < 25; i++) {
      await tracer.trace(`s${i}`, async () => i);
    }
    await tracer.shutdown();

    const names = deliveredSpans(server).map((s) => s.name);
    assert.equal(names.length, 10);
    assert.ok(names.includes("s24"));
    assert.ok(!names.includes("s0"));
  });
});