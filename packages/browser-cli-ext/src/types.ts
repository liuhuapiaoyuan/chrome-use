// Browser-CLI 通讯协议定义。SDK 与扩展共用此协议；两个包各自持有一份镜像，
// 避免跨包依赖，便于独立发版。如有变更，需同步两侧。

export const PROTOCOL_NS = "browser-cli" as const;
export const PROTOCOL_VERSION = 1 as const;

export interface BrowserCliRequest {
  ns: typeof PROTOCOL_NS;
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  /** 工具名，或 "-h" / "--list" / "--help" 元命令；当 raw 提供时此字段被覆盖。 */
  command: string;
  /** 已解析的参数对象。 */
  args: Record<string, unknown>;
  /** 原始 CLI 字符串。若存在则由扩展端解析。 */
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

/** content-script 桥接信封（仅用于通道 B）。 */
export interface BridgeEnvelope {
  ns: typeof PROTOCOL_NS;
  v: typeof PROTOCOL_VERSION;
  dir: "req" | "res";
  /** 透传 BrowserCliRequest / BrowserCliResponse 全部字段。 */
  [key: string]: unknown;
}
