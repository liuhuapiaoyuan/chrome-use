// Content script 桥接（通道 B 兜底）。
// 监听网页的 window.postMessage({ ns:'browser-cli', dir:'req', ... }) 请求，
// 转发到 background，再把响应通过 postMessage 回吐给网页。
//
// 设计意图：当 externally_connectable 不允许或网页未配置 extensionId 时，
// SDK 仍可透明工作。
//
// 后台自动化模式下，search_elements / click 等工具通过 tabs.sendMessage
// 请求 DOM 快照；须在此响应 aipex:collect-dom-snapshot。

import { collectDomSnapshot } from "@aipexstudio/dom-snapshot";
import { PROTOCOL_NS, PROTOCOL_VERSION } from "./types";

const DOM_SNAPSHOT_MESSAGE = "aipex:collect-dom-snapshot";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== DOM_SNAPSHOT_MESSAGE &&
    message?.request !== "collect-dom-snapshot"
  ) {
    return false;
  }

  void (async () => {
    try {
      const snapshot = collectDomSnapshot(document, message.options);
      sendResponse({ success: true, data: snapshot });
    } catch (error) {
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to collect DOM snapshot",
      });
    }
  })();

  return true;
});

interface IncomingEnvelope {
  ns: typeof PROTOCOL_NS;
  v: typeof PROTOCOL_VERSION;
  dir: "req";
  requestId: string;
  command: string;
  args: Record<string, unknown>;
  raw?: string;
}

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const data = ev.data as unknown;
  if (data === null || typeof data !== "object") return;
  const env = data as Partial<IncomingEnvelope>;
  if (env.ns !== PROTOCOL_NS || env.v !== PROTOCOL_VERSION || env.dir !== "req") {
    return;
  }
  if (typeof env.requestId !== "string" || typeof env.command !== "string") {
    return;
  }

  // 转发给 background
  const payload: Record<string, unknown> = {
    ns: PROTOCOL_NS,
    v: PROTOCOL_VERSION,
    requestId: env.requestId,
    command: env.command,
    args: env.args ?? {},
  };
  if (typeof env.raw === "string") payload["raw"] = env.raw;

  chrome.runtime
    .sendMessage(payload)
    .then((response: unknown) => {
      window.postMessage(
        {
          ns: PROTOCOL_NS,
          v: PROTOCOL_VERSION,
          dir: "res",
          ...((response as Record<string, unknown>) ?? {}),
        },
        ev.origin || "*",
      );
    })
    .catch((reason: unknown) => {
      window.postMessage(
        {
          ns: PROTOCOL_NS,
          v: PROTOCOL_VERSION,
          dir: "res",
          requestId: env.requestId,
          ok: false,
          error: {
            code: "BRIDGE_ERROR",
            message: reason instanceof Error ? reason.message : String(reason),
          },
        },
        ev.origin || "*",
      );
    });
});
