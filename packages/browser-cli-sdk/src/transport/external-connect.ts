// 通道 A：chrome.runtime.sendMessage(extensionId, msg) 直连 background。
// 仅在网页满足扩展 manifest 的 externally_connectable.matches 时可用。

import {
  BrowserCliError,
  type BrowserCliRequest,
  type BrowserCliResponse,
  BrowserCliTimeoutError,
  PROTOCOL_NS,
  PROTOCOL_VERSION,
} from "../types";
import type { Transport } from "./types";

type ChromeRuntimeSendMessage = (
  extensionId: string,
  message: unknown,
  responseCallback?: (response: unknown) => void,
) => void;

interface ChromeRuntimeLike {
  sendMessage: ChromeRuntimeSendMessage;
  lastError?: { message?: string } | null;
}

function getRuntime(): ChromeRuntimeLike | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome;
  return c?.runtime ?? null;
}

export class ExternalConnectTransport implements Transport {
  readonly kind = "external" as const;

  constructor(private readonly extensionId: string) {}

  send(
    request: BrowserCliRequest,
    timeoutMs: number,
  ): Promise<BrowserCliResponse> {
    return new Promise((resolve, reject) => {
      const runtime = getRuntime();
      if (!runtime) {
        reject(
          new BrowserCliError(
            "NO_CHROME_RUNTIME",
            "chrome.runtime is not available in this context",
          ),
        );
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new BrowserCliTimeoutError(
            `Request '${request.command}' timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      try {
        runtime.sendMessage(this.extensionId, request, (resp: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const lastError = runtime.lastError;
          if (lastError) {
            reject(
              new BrowserCliError(
                "RUNTIME_ERROR",
                lastError.message ?? "Unknown runtime error",
              ),
            );
            return;
          }
          if (!isCliResponse(resp)) {
            reject(
              new BrowserCliError(
                "INVALID_RESPONSE",
                "Extension returned an unexpected response shape",
              ),
            );
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new BrowserCliError(
            "SEND_FAILED",
            e instanceof Error ? e.message : String(e),
          ),
        );
      }
    });
  }

  async ping(timeoutMs: number): Promise<boolean> {
    try {
      const resp = await this.send(
        {
          ns: PROTOCOL_NS,
          v: PROTOCOL_VERSION,
          requestId: `ping-${Date.now()}`,
          command: "-h",
          args: {},
        },
        timeoutMs,
      );
      return resp.ok;
    } catch {
      return false;
    }
  }

  dispose(): void {
    /* no-op */
  }
}

function isCliResponse(value: unknown): value is BrowserCliResponse {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v["ns"] === PROTOCOL_NS &&
    v["v"] === PROTOCOL_VERSION &&
    typeof v["requestId"] === "string" &&
    typeof v["ok"] === "boolean"
  );
}
