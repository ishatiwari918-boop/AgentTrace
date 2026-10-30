# Span format (v1)

One span = one recorded step. A trace = all spans sharing a trace_id.

```json
{
  "trace_id": "t_9f2c",
  "span_id": "s_01",
  "parent_id": null,
  "name": "answer-question",
  "kind": "chain",
  "start_time": "2026-10-30T11:00:00.000Z",
  "end_time": "2026-10-30T11:00:02.100Z",
  "input": { "question": "Where is auth handled?" },
  "output": { "answer": "..." },
  "model": "llama-3.3-70b",
  "tokens_in": 820,
  "tokens_out": 140,
  "cost_usd": 0.0021,
  "status": "ok",
  "error": null,
  "metadata": {}
}
```

## Fields

| Field | Meaning |
|---|---|
| trace_id | Groups all spans from one request |
| span_id | Unique id of this span |
| parent_id | span_id of the parent, or null for the root span |
| name | Human-readable step name |
| kind | chain, llm, retrieval, or tool |
| start_time / end_time | When the step began and ended (UTC, ISO 8601) |
| input / output | What went in and came out (JSON) |
| model | Model name, only for llm spans |
| tokens_in / tokens_out | Token counts, only for llm spans |
| cost_usd | Estimated cost of this span |
| status | ok or error |
| error | Error message if status is error, else null |
| metadata | Free-form extra data (user id, prompt version, etc.) |