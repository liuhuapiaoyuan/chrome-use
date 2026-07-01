// Background service worker：browser-cli 指令的中央路由器。
// 同时监听通道 A（onMessageExternal，来自外部网页直接调用）和通道 B（onMessage，
// 由 content.ts 桥接 postMessage 转发）。所有调用统一走 dispatch()。

import { STORAGE_KEYS } from "@aipexstudio/aipex-core";
import { setAutomationModeOverride } from "@aipexstudio/browser-runtime/runtime/automation-mode";
import {
  clearLog,
  getOriginSummary,
  getRecentCalls,
  logCall,
} from "./lib/activity-log";
import { runWithAutomationContext } from "./lib/automation-preference";
import { installBackgroundTabGuard } from "./lib/background-tab-guard";
import { BrowserCliParseError, parseCli } from "./lib/cli-parser";
import { renderHelp, renderList, renderToolHelp } from "./lib/help";
import {
  assertRouterSchemaConsistency,
  routeTool,
  ToolNotFoundError,
} from "./lib/tool-router";
import { toolSchemas } from "./lib/tool-schemas";
import {
  type BrowserCliRequest,
  type BrowserCliResponse,
  PROTOCOL_NS,
  PROTOCOL_VERSION,
} from "./types";

// 版本号直接来自 manifest.json，避免与 vite 的编译时 define 耦合。
const EXT_VERSION = chrome.runtime.getManifest().version;

// 启动时做一次 tool-router/tool-schemas 的名字漂移检查；仅 warn，不阻断。
assertRouterSchemaConsistency(toolSchemas.map((s) => s.name));

// Background 模式下，页面发起的 window.open / target=_blank 等打开行为改为背后打开。
installBackgroundTabGuard();

// SW 唤醒时清除可能残留的 override，并确保全局 storage 为 focus。
setAutomationModeOverride(null);
void chrome.storage.local.set({ [STORAGE_KEYS.AUTOMATION_MODE]: "focus" });

// ── 内部信封校验 ─────────────────────────────────────────────────────────
function isCliRequest(msg: unknown): msg is BrowserCliRequest {
  if (msg === null || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return (
    m["ns"] === PROTOCOL_NS &&
    m["v"] === PROTOCOL_VERSION &&
    typeof m["requestId"] === "string" &&
    typeof m["command"] === "string"
  );
}

function ok(
  req: BrowserCliRequest,
  data: unknown,
  tool: string,
  start: number,
): BrowserCliResponse {
  return {
    ns: PROTOCOL_NS,
    v: PROTOCOL_VERSION,
    requestId: req.requestId,
    ok: true,
    data,
    meta: { tookMs: Date.now() - start, tool },
  };
}

function err(
  req: BrowserCliRequest,
  code: string,
  message: string,
): BrowserCliResponse {
  return {
    ns: PROTOCOL_NS,
    v: PROTOCOL_VERSION,
    requestId: req.requestId,
    ok: false,
    error: { code, message },
  };
}

// ── 主分发逻辑 ───────────────────────────────────────────────────────────
async function dispatch(
  req: BrowserCliRequest,
  meta: { channel: "external" | "content-bridge"; origin?: string },
): Promise<BrowserCliResponse> {
  const start = Date.now();
  let cmd = req.command;
  let args = req.args ?? {};

  // 若提供 raw 字符串则在扩展端解析；否则使用对象。
  if (typeof req.raw === "string" && req.raw.trim() !== "") {
    try {
      const parsed = parseCli(req.raw);
      cmd = parsed.command;
      args = parsed.args;
    } catch (e) {
      const code = e instanceof BrowserCliParseError ? e.code : "PARSE_FAILED";
      const message = e instanceof Error ? e.message : String(e);
      logCall({
        ts: Date.now(),
        tool: req.command || "<raw>",
        ok: false,
        tookMs: Date.now() - start,
        error: message,
        channel: meta.channel,
        ...(meta.origin !== undefined ? { origin: meta.origin } : {}),
      });
      return err(req, code, message);
    }
  }

  // 元命令
  if (cmd === "-h") {
    return ok(req, renderHelp(EXT_VERSION), cmd, start);
  }
  if (cmd === "--list") {
    return ok(req, renderList(), cmd, start);
  }
  if (cmd === "--help") {
    const toolName = String(args["tool"] ?? "");
    if (!toolName) {
      return err(req, "MISSING_TOOL", "Usage: --help <tool_name>");
    }
    const help = renderToolHelp(toolName);
    if (!help) return err(req, "TOOL_NOT_FOUND", `Unknown tool: ${toolName}`);
    return ok(req, help, cmd, start);
  }

  // 工具调用：后台偏好仅在单次 API 调用期间临时生效
  try {
    const { tool, data } = await runWithAutomationContext(() =>
      routeTool(cmd, args),
    );
    logCall({
      ts: Date.now(),
      tool,
      ok: true,
      tookMs: Date.now() - start,
      args,
      channel: meta.channel,
      ...(meta.origin !== undefined ? { origin: meta.origin } : {}),
    });
    return ok(req, data, tool, start);
  } catch (e) {
    const code = e instanceof ToolNotFoundError ? e.code : "EXEC_FAILED";
    const message = e instanceof Error ? e.message : String(e);
    logCall({
      ts: Date.now(),
      tool: cmd,
      ok: false,
      tookMs: Date.now() - start,
      args,
      error: message,
      channel: meta.channel,
      ...(meta.origin !== undefined ? { origin: meta.origin } : {}),
    });
    return err(req, code, message);
  }
}

// ── 通道 A：外部网页直连 ─────────────────────────────────────────────────
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (!isCliRequest(message)) return false;
    const origin = sender.origin ?? sender.url ?? undefined;
    dispatch(message, {
      channel: "external",
      ...(origin !== undefined ? { origin } : {}),
    }).then(sendResponse);
    return true; // 异步响应
  },
);

// ── 通道 B：content-script 桥接 ────────────────────────────────────────
// Popup 与 content-bridge 共用 chrome.runtime.onMessage。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 协议消息：来自 content-bridge 转发的网页请求
  if (isCliRequest(message)) {
    const origin = sender.origin ?? sender.tab?.url ?? undefined;
    dispatch(message, {
      channel: "content-bridge",
      ...(origin !== undefined ? { origin } : {}),
    }).then(sendResponse);
    return true;
  }
  // Popup 查询状态
  if (
    message &&
    typeof message === "object" &&
    (message as { type?: string }).type === "popup:get-state"
  ) {
    sendResponse({
      version: EXT_VERSION,
      toolCount: renderList().count,
      recentCalls: getRecentCalls(20),
      origins: getOriginSummary().slice(0, 10),
    });
    return false;
  }
  if (
    message &&
    typeof message === "object" &&
    (message as { type?: string }).type === "popup:clear-log"
  ) {
    clearLog();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

// 安装/更新事件用于诊断
chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `[browser-cli] installed (${details.reason}) — ${renderList().count} tools available.`,
  );
});
