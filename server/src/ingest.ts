import { Router } from "express";
import { pool } from "./db";
import { apiKeyAuth } from "./auth";

const router = Router();
const MAX_BATCH = 500;

const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

router.post("/v1/ingest", apiKeyAuth, async (req, res) => {
  const spans = req.body?.spans;

  if (!Array.isArray(spans) || spans.length === 0) {
    res.status(400).json({ error: "Body must be { spans: [ ... ] }" });
    return;
  }
  if (spans.length > MAX_BATCH) {
    res.status(413).json({ error: `Max ${MAX_BATCH} spans per request` });
    return;
  }

  for (const [i, s] of spans.entries()) {
    const missing = ["trace_id", "span_id", "name", "start_time", "end_time"].filter(
      (f) => typeof s?.[f] !== "string" || s[f] === ""
    );
    if (missing.length > 0) {
      res.status(400).json({ error: `Span ${i}: missing or invalid ${missing.join(", ")}` });
      return;
    }
    if (Number.isNaN(Date.parse(s.start_time)) || Number.isNaN(Date.parse(s.end_time))) {
      res.status(400).json({ error: `Span ${i}: start_time/end_time must be ISO dates` });
      return;
    }
  }

  const projectId = res.locals.projectId;
      if (process.env.LOG_INGEST !== "off") {
    console.log(`ingest: received ${spans.length} spans`);
  }
  let saved = 0;

  for (const s of spans) {
    const result = await pool.query(
      `INSERT INTO spans
         (project_id, trace_id, span_id, parent_id, name, kind, start_time, end_time,
          input, output, model, tokens_in, tokens_out, cost_usd, status, error, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (project_id, span_id) DO NOTHING`,
      [
        projectId,
        s.trace_id,
        s.span_id,
        s.parent_id ?? null,
        s.name,
        s.kind ?? "chain",
        s.start_time,
        s.end_time,
        json(s.input),
        json(s.output),
        s.model ?? null,
        s.tokens_in ?? null,
        s.tokens_out ?? null,
        s.cost_usd ?? null,
        s.status ?? "ok",
        s.error ?? null,
        json(s.metadata ?? {}),
      ]
    );
    saved += result.rowCount ?? 0;
  }

  res.status(202).json({ received: spans.length, saved });
});

export default router;