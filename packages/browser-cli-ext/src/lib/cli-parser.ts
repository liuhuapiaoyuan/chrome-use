// CLI 字符串解析器：把 "create_new_tab --url https://x.com --flag true" 转成
// { command: "create_new_tab", args: { url: "https://x.com", flag: true } }。
// 同时支持 "-h" / "--list" / "--help <tool>" 元命令。
//
// 类型推断依据 toolSchemas 的 inputSchema.properties[key].type：number/boolean/array/object
// 会被自动转换；其他类型保留为字符串。逻辑移植自 mcp-bridge/src/cli.ts。

import { toolSchemas, type ToolSchema } from "./tool-schemas";

export interface ParsedCli {
  command: string;
  args: Record<string, unknown>;
}

const TOKEN_PATTERN =
  /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;

/** 按空白拆分，支持单/双引号包裹的整段值。 */
export function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;
  while ((m = TOKEN_PATTERN.exec(raw)) !== null) {
    const token = m[1] ?? m[2] ?? m[3] ?? "";
    tokens.push(token);
  }
  return tokens;
}

export function parseCli(raw: string): ParsedCli {
  const tokens = tokenize(raw.trim());
  if (tokens.length === 0) {
    return { command: "-h", args: {} };
  }
  const command = tokens[0]!;

  // 元命令：-h / --list / --help [name]
  if (command === "-h" || command === "--help") {
    const tool = tokens[1];
    return {
      command: tool ? "--help" : "-h",
      args: tool ? { tool } : {},
    };
  }
  if (command === "--list") {
    return { command: "--list", args: {} };
  }

  const args = parseToolArgs(tokens.slice(1), command);
  return { command, args };
}

/** 把 ["--url", "https://...", "--flag", "true"] 解析为 {url, flag} 并按 schema 强制类型。 */
export function parseToolArgs(
  rawArgs: string[],
  toolName: string,
): Record<string, unknown> {
  const tool = toolSchemas.find((t) => t.name === toolName);
  const props = (tool?.inputSchema.properties ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const result: Record<string, unknown> = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]!;
    if (!arg.startsWith("--")) {
      throw new BrowserCliParseError(
        "UNEXPECTED_ARG",
        `Unexpected argument: ${arg}`,
      );
    }
    const key = arg.slice(2);
    const next = rawArgs[++i];
    if (next === undefined) {
      throw new BrowserCliParseError(
        "MISSING_VALUE",
        `Missing value for --${key}`,
      );
    }
    result[key] = coerceValue(next, key, props);
  }
  return result;
}

function coerceValue(
  value: string,
  key: string,
  props: Record<string, Record<string, unknown> | undefined>,
): unknown {
  const schema = props[key];
  const type = schema?.["type"] as string | undefined;

  switch (type) {
    case "number": {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new BrowserCliParseError(
          "INVALID_NUMBER",
          `--${key} expects a number, got: ${value}`,
        );
      }
      return n;
    }
    case "boolean":
      return value === "true" || value === "1";
    case "array":
    case "object":
      try {
        return JSON.parse(value);
      } catch {
        throw new BrowserCliParseError(
          "INVALID_JSON",
          `--${key} expects JSON (${type}), got: ${value}`,
        );
      }
    default:
      return value;
  }
}

export class BrowserCliParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BrowserCliParseError";
  }
}

export type { ToolSchema };
