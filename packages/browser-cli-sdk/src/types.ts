// 协议与错误类型 — 与扩展端 packages/browser-cli-ext/src/types.ts 必须保持一致。

export const PROTOCOL_NS = "browser-cli" as const;
export const PROTOCOL_VERSION = 1 as const;

export interface BrowserCliRequest {
  ns: typeof PROTOCOL_NS;
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  command: string;
  args: Record<string, unknown>;
  raw?: string;
}

export interface BrowserCliResponse {
  ns: typeof PROTOCOL_NS;
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  meta?: { tookMs: number; tool: string };
}

export type TransportKind = "external" | "content" | "auto";

export interface BrowserCliOptions {
  /** 扩展 ID。若提供，优先用 chrome.runtime.sendMessage(id, ...) 直连。 */
  extensionId?: string;
  /** 传输方式选择，默认 auto（先 external 后 content 桥接）。 */
  transport?: TransportKind;
  /** 单次调用超时（毫秒），默认 30000。 */
  timeoutMs?: number;
  /** 协商阶段等待 content-bridge 应答的窗口（毫秒），默认 500。 */
  handshakeTimeoutMs?: number;
}

export class BrowserCliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BrowserCliError";
  }
}

export class BrowserCliTimeoutError extends BrowserCliError {
  constructor(message: string) {
    super("TIMEOUT", message);
    this.name = "BrowserCliTimeoutError";
  }
}

export class BrowserCliNotAvailableError extends BrowserCliError {
  constructor(message: string) {
    super("NOT_AVAILABLE", message);
    this.name = "BrowserCliNotAvailableError";
  }
}

/** -h 元命令返回结构。 */
export interface HelpOverview {
  name: "browser-cli";
  version: string;
  toolCount: number;
  usage: string[];
  examples: string[];
  meta: { list: string; help: string };
}

/** --list 元命令返回结构。 */
export interface ToolListEntry {
  name: string;
  description: string;
}

/** --help <tool> 元命令返回结构。 */
export interface ToolHelp {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
    enum?: string[];
  }>;
}
