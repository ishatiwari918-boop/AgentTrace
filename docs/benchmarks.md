# Benchmarks

All numbers come from my laptop, with PostgreSQL running in Docker on the same machine. They are only meaningful for comparing before and after, not as absolute figures.

## Ingest throughput

Load test: `npm run loadtest` in `server/`. It sends 20,000 fake spans (10 per trace, with parent links) in requests of 50 spans, with 10 requests in flight at once. 500 spans of warmup are not timed. The server runs with `LOG_INGEST=off`.

| Date | Version | Spans per request | Parallel requests | Spans/s | p50 ms | p99 ms | Errors |
|---|---|---|---|---|---|---|---|
| 2026-11-11 | Baseline: one INSERT per span | 50 | 10 | 2911 | 166.4 | 228.4 | 0 |

Three runs gave 2827, 2990 and 2911 spans/s. The row above is the middle run. In every run the database count matched the number of spans sent.

## SDK overhead

Benchmark: `npm run bench` in `sdk/`. It times 20,000 calls of an empty function, once bare and once wrapped in `trace()`. Spans are sent in the background to a local server that discards them.

| Case | Mean | p50 | p99 |
|---|---|---|---|
| Bare function | 0.3 us | 0.2 us | 1.6 us |
| Wrapped in `trace()` | 4.1 us | 3.1 us | 17.3 us |

Overhead per call: about 3.9 us on average. All 22,000 spans sent (including warmup) were received by the server. This measures the cost of `trace()` itself. Real LLM calls take hundreds of milliseconds, so this overhead is a tiny fraction of them.

## How to reproduce

1. `docker compose up -d`
2. In `server/`, run `npm run create-project -- "loadtest"` and save the key it prints.
3. Start the server without the file watcher and with quiet logging: `$env:LOG_INGEST = "off"`, then `npx tsx src/index.ts`.
4. In another terminal in `server/`: `$env:AGENTTRACE_KEY = "<loadtest key>"`, then `npm run loadtest`.
5. Delete the test data between runs: `DELETE FROM spans WHERE project_id = (SELECT id FROM projects WHERE name = 'loadtest');`
6. Repeat three times and report the middle run.