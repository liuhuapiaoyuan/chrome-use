// BrowserCli 主类：协商传输通道、提供 exec / call / list / help 等 API。
import { nanoid } from "nanoid";

import {
  type BrowserCliOptions,
  type BrowserCliRequest,
  type BrowserCliResponse,
  BrowserCliError,
  BrowserCliNotAvailableError,
  type HelpOverview,
  PROTOCOL_NS,
  PROTOCOL_VERSION,
  type ToolHelp,
  type ToolListEntry,
} from "./types";
import { ContentBridgeTransport } from "./transport/content-bridge";
import { ExternalConnectTransport } from "./transport/external-connect";
import type { Transport } from "./transport/types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 500;

export class BrowserCli {
  private constructor(
    private readonly transport: Transport,
    private readonly timeoutMs: number,
  ) {}

  /** 探测可用通道，构造一个就绪的 BrowserCli 实例。 */
  static async create(options: BrowserCliOptions = {}): Promise<BrowserCli> {
    const transport = options.transport ?? "auto";
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const handshakeMs =
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

    const candidates: Array<() => Transport | null> = [];

    if (transport === "external" || transport === "auto") {
      if (options.extensionId) {
        candidates.push(() => new ExternalConnectTransport(options.extensionId!));
      }
    }
    if (transport === "content" || transport === "auto") {
      candidates.push(() => {
        if (typeof window === "undefined") return null;
        return new ContentBridgeTransport();
      });
    }

    let lastError: Error | null = null;
    for (const factory of candidates) {
      const t = factory();
      if (!t) continue;
      try {
        const ok = await t.ping(handshakeMs);
        if (ok) return new BrowserCli(t, timeoutMs);
        t.dispose();
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        t.dispose();
      }
    }

    throw new BrowserCliNotAvailableError(
      lastError
        ? `Browser-CLI extension not reachable: ${lastError.message}`
        : "Browser-CLI extension not detected. Make sure it is installed and the page is allowed by externally_connectable, or that the content-bridge is active.",
    );
  }

  /** 执行一条 CLI 风格命令字符串。扩展端会解析 raw 字段。 */
  async exec(raw: string): Promise<unknown> {
    const trimmed = raw.trim();
    if (!trimmed) throw new BrowserCliError("EMPTY_INPUT", "Command is empty");
    return this.invoke({
      ns: PROTOCOL_NS,
      v: PROTOCOL_VERSION,
      requestId: nanoid(),
      command: "<raw>",
      args: {},
      raw: trimmed,
    });
  }

  /** 直接以对象参数调用一个工具。 */
  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!name) throw new BrowserCliError("EMPTY_TOOL", "Tool name is empty");
    return this.invoke({
      ns: PROTOCOL_NS,
      v: PROTOCOL_VERSION,
      requestId: nanoid(),
      command: name,
      args,
    });
  }

  /** 列出可用工具与简要说明。 */
  async list(): Promise<{ tools: ToolListEntry[]; count: number }> {
    return (await this.invoke({
      ns: PROTOCOL_NS,
      v: PROTOCOL_VERSION,
      requestId: nanoid(),
      command: "--list",
      args: {},
    })) as { tools: ToolListEntry[]; count: number };
  }

  /** 查询单个工具的帮助；name 不传则返回总览（HelpOverview）。 */
  async help(name?: string): Promise<HelpOverview | ToolHelp> {
    if (!name) {
      return (await this.invoke({
        ns: PROTOCOL_NS,
        v: PROTOCOL_VERSION,
        requestId: nanoid(),
        command: "-h",
        args: {},
      })) as HelpOverview;
    }
    return (await this.invoke({
      ns: PROTOCOL_NS,
      v: PROTOCOL_VERSION,
      requestId: nanoid(),
      command: "--help",
      args: { tool: name },
    })) as ToolHelp;
  }

  /** 释放底层资源（移除 message 监听器等）。 */
  dispose(): void {
    this.transport.dispose();
  }

  /** 当前协商到的通道。 */
  get channel(): "external" | "content" {
    return this.transport.kind;
  }

  private async invoke(request: BrowserCliRequest): Promise<unknown> {
    const resp = await this.transport.send(request, this.timeoutMs);
    if (!resp.ok) {
      const err = resp.error ?? { code: "UNKNOWN", message: "Unknown error" };
      throw new BrowserCliError(err.code, err.message);
    }
    return resp.data;
  }
}

/** 便捷函数：等价于 BrowserCli.create(options)。 */
export function createBrowserCli(
  options: BrowserCliOptions = {},
): Promise<BrowserCli> {
  return BrowserCli.create(options);
}

export type { BrowserCliResponse };
