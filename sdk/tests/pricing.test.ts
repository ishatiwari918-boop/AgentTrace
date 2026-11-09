import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRICES, estimateCost, extractText, extractUsage } from "../src/pricing";

test("estimateCost matches the hand calculation", () => {
  assert.equal(estimateCost("llama-3.3-70b-versatile", 820, 140, DEFAULT_PRICES), 0.000594);
});

test("estimateCost returns null for an unknown model", () => {
  assert.equal(estimateCost("mystery-model", 100, 100, DEFAULT_PRICES), null);
});

test("estimateCost matches a model name by prefix", () => {
  const cost = estimateCost("llama-3.1-8b-instant-0125", 1_000_000, 1_000_000, DEFAULT_PRICES);
  assert.ok(cost !== null && Math.abs(cost - 0.13) < 1e-9);
});

test("extractUsage reads an OpenAI/Groq style response", () => {
  const usage = extractUsage({
    model: "m",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
  assert.deepEqual(usage, { model: "m", tokensIn: 10, tokensOut: 5 });
});

test("extractUsage reads an Anthropic style response", () => {
  const usage = extractUsage({ model: "m", usage: { input_tokens: 7, output_tokens: 3 } });
  assert.deepEqual(usage, { model: "m", tokensIn: 7, tokensOut: 3 });
});

test("extractUsage and extractText cope with junk", () => {
  assert.deepEqual(extractUsage(null), {});
  assert.deepEqual(extractUsage("hello"), {});
  assert.equal(extractText(42), undefined);
});

test("extractText reads both response shapes", () => {
  assert.equal(extractText({ choices: [{ message: { content: "hi" } }] }), "hi");
  assert.equal(extractText({ content: [{ text: "hello" }] }), "hello");
});