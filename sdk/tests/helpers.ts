import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  auth: string | undefined;
  status: number;
  spans: any[];
}

export interface FakeServer {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export async function startFakeServer(statuses: number[] = []): Promise<FakeServer> {
  const requests: RecordedRequest[] = [];
  const queue = [...statuses];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const status = queue.length > 0 ? queue.shift()! : 200;
      let spans: any[] = [];
      try {
        spans = JSON.parse(Buffer.concat(chunks).toString()).spans ?? [];
      } catch {
        // ignore bad bodies
      }
      requests.push({ auth: req.headers.authorization, status, spans });
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

export async function withServer(
  statuses: number[],
  fn: (server: FakeServer) => Promise<void>
): Promise<void> {
  const server = await startFakeServer(statuses);
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

export function deliveredSpans(server: FakeServer): any[] {
  return server.requests.filter((r) => r.status === 200).flatMap((r) => r.spans);
}