import { useCallback, useEffect, useState } from "react";

interface CallEntry {
  ts: number;
  tool: string;
  ok: boolean;
  tookMs: number;
  error?: string;
  origin?: string;
  channel: "external" | "content-bridge";
}

interface OriginEntry {
  origin: string;
  count: number;
  lastTs: number;
}

interface PopupState {
  version: string;
  toolCount: number;
  recentCalls: CallEntry[];
  origins: OriginEntry[];
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function App() {
  const [state, setState] = useState<PopupState | null>(null);

  const refresh = useCallback(() => {
    chrome.runtime.sendMessage({ type: "popup:get-state" }, (resp: unknown) => {
      if (chrome.runtime.lastError) return;
      setState(resp as PopupState);
    });
  }, []);

  const clearLog = useCallback(() => {
    chrome.runtime.sendMessage({ type: "popup:clear-log" }, () => refresh());
  }, [refresh]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 1500);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!state) {
    return <div className="muted">Loading…</div>;
  }

  return (
    <>
      <div className="header">
        <h1>Browser CLI</h1>
        <span className="muted">v{state.version}</span>
      </div>
      <div className="muted">
        Command channel for web pages. Available tools:{" "}
        <strong>{state.toolCount}</strong>.
      </div>

      <section className="card">
        <h2 className="card-title">Connected origins ({state.origins.length})</h2>
        {state.origins.length === 0 ? (
          <div className="empty">No web page has called yet.</div>
        ) : (
          state.origins.map((o) => (
            <div className="row" key={o.origin}>
              <span className="name" title={o.origin}>
                {o.origin}
              </span>
              <span className="meta">
                {o.count} call{o.count > 1 ? "s" : ""} · {formatRelative(o.lastTs)}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Recent calls ({state.recentCalls.length})</h2>
        {state.recentCalls.length === 0 ? (
          <div className="empty">No invocations yet.</div>
        ) : (
          state.recentCalls.map((c, i) => (
            <div className="row" key={`${c.ts}-${i}`}>
              <span className="name" title={c.error ?? c.tool}>
                {c.tool}
                {c.error ? ` · ${c.error.slice(0, 32)}` : ""}
              </span>
              <span className="meta">
                <span className={`badge ${c.ok ? "ok" : "fail"}`}>
                  {c.ok ? "ok" : "err"}
                </span>{" "}
                {c.tookMs}ms · {formatRelative(c.ts)}
              </span>
            </div>
          ))
        )}
      </section>

      <div className="actions">
        <button type="button" onClick={refresh}>
          Refresh
        </button>
        <button type="button" onClick={clearLog}>
          Clear log
        </button>
      </div>
    </>
  );
}
