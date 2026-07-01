// 内存环形缓冲，记录最近 N 条调用日志。Popup 通过 runtime.sendMessage 读取。
// Service Worker 重启会清空（可接受：仅用于显示，非持久化诉求）。

export interface CallLogEntry {
  ts: number;
  tool: string;
  ok: boolean;
  tookMs: number;
  args?: Record<string, unknown>;
  error?: string;
  origin?: string;
  channel: "external" | "content-bridge";
}

const MAX_ENTRIES = 50;
const ring: CallLogEntry[] = [];
const originCounts = new Map<string, { count: number; lastTs: number }>();

export function logCall(entry: CallLogEntry): void {
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.shift();

  if (entry.origin) {
    const prev = originCounts.get(entry.origin) ?? { count: 0, lastTs: 0 };
    originCounts.set(entry.origin, {
      count: prev.count + 1,
      lastTs: entry.ts,
    });
  }
}

export function getRecentCalls(limit = MAX_ENTRIES): CallLogEntry[] {
  const start = Math.max(0, ring.length - limit);
  return ring.slice(start).reverse();
}

export function getOriginSummary(): Array<{
  origin: string;
  count: number;
  lastTs: number;
}> {
  return Array.from(originCounts.entries())
    .map(([origin, info]) => ({ origin, ...info }))
    .sort((a, b) => b.lastTs - a.lastTs);
}

export function clearLog(): void {
  ring.length = 0;
  originCounts.clear();
}
