import { AsyncLocalStorage } from "node:async_hooks";

export interface SpanContext {
  traceId: string;
  spanId: string;
}

export const storage = new AsyncLocalStorage<SpanContext>();

export function currentContext(): SpanContext | undefined {
  return storage.getStore();
}