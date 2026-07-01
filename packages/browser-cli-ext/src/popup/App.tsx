import type { AutomationMode } from "@aipexstudio/aipex-core";
import { useCallback, useEffect, useState } from "react";
import { useAutomationMode } from "./use-automation-mode";

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

const MODE_LABELS: Record<
  AutomationMode,
  { title: string; description: string }
> = {
  focus: {
    title: "聚焦模式",
    description: "启用视觉反馈、窗口聚焦；支持截图与坐标操作",
  },
  background: {
    title: "后台模式",
    description: "静默执行，不切换窗口焦点；禁用截图与坐标工具",
  },
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return `${Math.floor(diff / 3_600_000)} 小时前`;
}

function formatCallCount(count: number): string {
  return `${count} 次调用`;
}

export function App() {
  const [state, setState] = useState<PopupState | null>(null);
  const [automationMode, setAutomationMode, isModeLoading] =
    useAutomationMode();

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
    return <div className="muted">加载中…</div>;
  }

  const currentMode = MODE_LABELS[automationMode];

  return (
    <>
      <div className="header">
        <h1>Browser CLI</h1>
        <span className="muted">v{state.version}</span>
      </div>
      <div className="muted intro">
        网页自动化命令通道，可用工具 <strong>{state.toolCount}</strong> 个。
      </div>

      <section className="card">
        <h2 className="card-title">自动化模式</h2>
        <div className="mode-toggle" role="group" aria-label="自动化模式">
          {(["focus", "background"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`mode-btn ${automationMode === mode ? "active" : ""}`}
              disabled={isModeLoading}
              aria-pressed={automationMode === mode}
              onClick={() => void setAutomationMode(mode)}
            >
              {MODE_LABELS[mode].title}
            </button>
          ))}
        </div>
        <p className="mode-hint">{currentMode.description}</p>
      </section>

      <section className="card">
        <h2 className="card-title">已连接来源（{state.origins.length}）</h2>
        {state.origins.length === 0 ? (
          <div className="empty">尚无网页调用记录。</div>
        ) : (
          state.origins.map((o) => (
            <div className="row" key={o.origin}>
              <span className="name" title={o.origin}>
                {o.origin}
              </span>
              <span className="meta">
                {formatCallCount(o.count)} · {formatRelative(o.lastTs)}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <h2 className="card-title">最近调用（{state.recentCalls.length}）</h2>
        {state.recentCalls.length === 0 ? (
          <div className="empty">尚无调用记录。</div>
        ) : (
          state.recentCalls.map((c, i) => (
            <div className="row" key={`${c.ts}-${i}`}>
              <span className="name" title={c.error ?? c.tool}>
                {c.tool}
                {c.error ? ` · ${c.error.slice(0, 32)}` : ""}
              </span>
              <span className="meta">
                <span className={`badge ${c.ok ? "ok" : "fail"}`}>
                  {c.ok ? "成功" : "失败"}
                </span>{" "}
                {c.tookMs}ms · {formatRelative(c.ts)}
              </span>
            </div>
          ))
        )}
      </section>

      <div className="actions">
        <button type="button" onClick={refresh}>
          刷新
        </button>
        <button type="button" onClick={clearLog}>
          清空日志
        </button>
      </div>
    </>
  );
}
