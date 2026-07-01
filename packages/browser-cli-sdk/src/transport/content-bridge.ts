// 通道 B：window.postMessage ↔ content-script 桥接。
// 任意网页都能用，无需扩展 ID。需要插件 content script 已注入到当前 origin。

import {
  BrowserCliError,
  type BrowserCliRequest,
  type BrowserCliResponse,
  BrowserCliTimeoutError,
  PROTOCOL_NS,
  PROTOCOL_VERSION,
} from "../types";
import type { Transport } from "./types";

interface ResponseEnvelope extends BrowserCliResponse {
  dir: "res";
}

export class ContentBridgeTransport implements Transport {
  readonly kind = "content" as const;

  private readonly pending = new Map<
    string,
    {
      resolve: (resp: BrowserCliResponse) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listener: ((ev: MessageEvent) => void) | null = null;

  constructor() {
    this.ensureListener();
  }

  private ensureListener(): void {
    if (this.listener) return;
    this.listener = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data as unknown;
      if (data === null || typeof data !== "object") return;
      const env = data as Partial<ResponseEnvelope>;
      if (
        env.ns !== PROTOCOL_NS ||
        env.v !== PROTOCOL_VERSION ||
        env.dir !== "res" ||
        typeof env.requestId !== "string"
      ) {
        return;
      }
      const entry = this.pending.get(env.requestId);
      if (!entry) return;
      this.pending.delete(env.requestId);
      clearTimeout(entry.timer);
      entry.resolve(env as BrowserCliResponse);
    };
    window.addEventListener("message", this.listener);
  }

  send(
    request: BrowserCliRequest,
    timeoutMs: number,
  ): Promise<BrowserCliResponse> {
    this.ensureListener();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(request.requestId)) return;
        this.pending.delete(request.requestId);
        reject(
          new BrowserCliTimeoutError(
            `Request '${request.command}' timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      this.pending.set(request.requestId, { resolve, reject, timer });

      try {
        window.postMessage(
          {
            ...request,
            dir: "req",
          },
          "*",
        );
      } catch (e) {
        this.pending.delete(request.requestId);
        clearTimeout(timer);
        reject(
          new BrowserCliError(
            "POSTMESSAGE_FAILED",
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
          requestId: `ping-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
    if (this.listener) {
      window.removeEventListener("message", this.listener);
      this.listener = null;
    }
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new BrowserCliError("DISPOSED", "Transport disposed"));
    }
    this.pending.clear();
  }
}
