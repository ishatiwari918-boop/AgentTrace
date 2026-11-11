# Benchmarks

All numbers come from my laptop, with PostgreSQL running in Docker on the same machine. They are only meaningful for comparing before and after, not as absolute figures.

## Ingest throughput

Load test: `npm run loadtest` in `server/`. It sends 20,000 fake spans (10 per trace, with parent links) in requests of 50 spans, with 10 requests in flight at once. 500 spans of warmup are not timed. The server runs with `LOG_INGEST=off`. After every run the number of rows in the database was checked against the number of spans sent, and they matched each time.

| Date | Version | Spans per request | Parallel requests | Spans/s | p50 ms | p99 ms | Errors |
|---|---|---|---|---|---|---|---|
| 2026-11-11 | Baseline: one INSERT per span | 50 | 10 | 2911 | 166.4 | 228.4 | 0 |
| 2026-11-11 | Bulk insert: one INSERT per request | 50 | 10 | 21552 | 21.6 | 42.3 | 0 |

Each row shows the middle of three runs.

- Baseline runs: 2827, 2990 and 2911 spans/s.
- Bulk insert runs: 19905, 21552 and 23931 spans/s.

Bulk insert was about 7x the baseline throughput (about 6.7x to 8.5x across individual runs). Per-request p50 latency fell from 166.4 ms to 21.6 ms, and p99 from 228.4 ms to 42.3 ms.

Caveat: each bulk run takes under one second, so a small hiccup moves the result, and the load generator (one Node process building and sending JSON) may now be part of the limit. Later rows use a longer test.

## SDK overhead

Benchmark: `npm run bench` in `sdk/`. It times 20,000 calls of an empty function, once bare and once wrapped in `trace()`. Spans are sent in the background to a local server that discards them.

| Case | Mean | p50 | p99 |
|---|---|---|---|
| Bare function | 0.3 us | 0.2 us | 1.6 us |
| Wrapped in `trace()` | 4.1 us | 3.1 us | 17.3 us |

Overhead per call: about 3.9 us on average. All 22,000 spans sent (including warmup) were received by the server. This measures the cost of `trace()` itself. Real LLM calls take hundreds of milliseconds, so this overhead is a tiny fraction of them.

## How to reproduce the ingest benchmark

1. `docker compose up -d`
2. In `server/`, run `npm run create-project -- "loadtest"` and save the key it prints.
3. Start the server without the file watcher and with quiet logging: `$env:LOG_INGEST = "off"`, then `npx tsx src/index.ts`.
4. In another terminal in `server/`: `$env:AGENTTRACE_KEY = "<loadtest key>"`, then `npm run loadtest`.
5. Delete the test data between runs: `DELETE FROM spans WHERE project_id = (SELECT id FROM projects WHERE name = 'loadtest');`
6. Repeat three times and report the middle run.