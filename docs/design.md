# AgentTrace design (v1)

## Problem
Developers building LLM apps (chatbots, RAG systems, agents) cannot easily see
what happens inside a request. When an answer is slow, wrong, or expensive,
they have to guess which step caused it. They also cannot tell whether a prompt
or code change made answers better or worse before shipping it.

## Solution
AgentTrace is an observability and evaluation platform for LLM apps:
- SDK: records each step of a request as a span and sends it to the server
- Ingestion API + queue + worker: receives and stores spans reliably
- Dashboard: shows each request as a trace waterfall, plus latency, cost and errors
- Eval system: scores answers against saved test questions
- GitHub Action: fails a pull request if quality drops

## Architecture
```
App + SDK  ->  Ingestion API  ->  Queue  ->  Worker  ->  PostgreSQL
                                                            |
                                  Dashboard  <-  Query API <-+
                                  GitHub Action  <-  Eval engine <-+
```

## In scope (v1)
- Nested spans (traces as trees)
- Batched, non-blocking SDK that never breaks the host app
- Reliable ingestion with retries and a dead-letter table
- Trace list, trace waterfall, latency/cost/error charts
- Datasets, scorers (exact match, retrieval hit, LLM-as-judge), run comparison
- GitHub Action that blocks PRs on regressions

## Out of scope (v1)
- Billing and payments
- Teams, organizations and roles
- Replaying traces with a different model
- SDKs for languages other than TypeScript/JavaScript

## Key decisions
| Decision | Why | Alternative considered |
|---|---|---|
| PostgreSQL for storage | Familiar, reliable, fast enough for 1M+ spans with indexes and partitioning | ClickHouse (faster analytics, but more setup) |
| Queue between API and database | Absorbs traffic bursts and keeps the API fast | Writing directly to the database |
| SDK batches in memory | Fewer network calls, lower overhead | One request per span |
| SDK swallows its own errors | Monitoring must never crash the app it monitors | Throwing errors to the caller |

## Success metrics (fill in with real numbers later)
- SDK overhead per call: ___ ms
- Ingestion throughput: ___ spans/sec
- Dashboard query time at ___ spans: ___ ms
- Chaos test: ___ spans lost out of ___
- Regressions caught by the GitHub Action on CodeMind: ___