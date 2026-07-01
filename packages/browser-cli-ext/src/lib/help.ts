// 帮助文本与工具列表的统一渲染。所有元命令返回结构化 JSON，避免依赖终端格式化。
import { type ToolSchema, toolSchemas } from "./tool-schemas";

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

export interface HelpOverview {
  name: "browser-cli";
  version: string;
  toolCount: number;
  usage: string[];
  examples: string[];
  meta: {
    list: string;
    help: string;
  };
}

export function renderHelp(version: string): HelpOverview {
  return {
    name: "browser-cli",
    version,
    toolCount: toolSchemas.length,
    usage: [
      "browser-cli <tool> [--param value ...]",
      "browser-cli --list",
      "browser-cli --help <tool>",
    ],
    examples: [
      "browser-cli get_all_tabs",
      "browser-cli create_new_tab --url https://example.com",
      'browser-cli search_elements --tabId 123 --query "{button,input}*"',
      "browser-cli take_snapshot --tabId 123",
      "browser-cli capture_screenshot",
    ],
    meta: {
      list: "Run --list to view all available tools.",
      help: "Run --help <tool> to view a tool's parameters.",
    },
  };
}

export interface ListEntry {
  name: string;
  description: string;
}

export function renderList(): { tools: ListEntry[]; count: number } {
  const tools = toolSchemas.map<ListEntry>((t) => ({
    name: t.name,
    description: t.description.split("\n")[0] ?? "",
  }));
  return { tools, count: tools.length };
}

export function renderToolHelp(name: string): ToolHelp | null {
  const tool = toolSchemas.find((t) => t.name === name);
  if (!tool) return null;
  return toToolHelp(tool);
}

function toToolHelp(tool: ToolSchema): ToolHelp {
  const required = new Set(tool.inputSchema.required ?? []);
  const parameters = Object.entries(tool.inputSchema.properties ?? {}).map(
    ([key, raw]) => {
      const schema = (raw ?? {}) as Record<string, unknown>;
      const type = (schema["type"] as string | undefined) ?? "any";
      const description = schema["description"] as string | undefined;
      const enumVals = schema["enum"] as string[] | undefined;
      const entry: ToolHelp["parameters"][number] = {
        name: key,
        type,
        required: required.has(key),
      };
      if (description !== undefined) entry.description = description;
      if (enumVals !== undefined) entry.enum = enumVals;
      return entry;
    },
  );
  return {
    name: tool.name,
    description: tool.description,
    parameters,
  };
}
