// 工具路由：直接从 browser-runtime 各分组按需导入 29 个非-skill 工具。
// 故意不 import `allBrowserTools`，因为它静态引用 skillTools -> QuickJS/emscripten VM，
// 会把扩展 bundle 从 ~150KB 拉到 ~5MB（含 wasm）。skill 属于 Agent 系统，不属于本插件职责。
import type { FunctionTool } from "@aipexstudio/aipex-core";
import { computerTool } from "@aipexstudio/browser-runtime/tools/computer";
import {
  clickTool,
  fillElementByUidTool,
  fillFormTool,
  getEditorValueTool,
  hoverElementByUidTool,
} from "@aipexstudio/browser-runtime/tools/element";
import { interventionTools } from "@aipexstudio/browser-runtime/tools/interventions/index";
import {
  getPageMetadataTool,
  highlightElementTool,
  highlightTextInlineTool,
  scrollToElementTool,
} from "@aipexstudio/browser-runtime/tools/page";
import {
  captureScreenshotTool,
  captureScreenshotWithHighlightTool,
  captureTabScreenshotTool,
} from "@aipexstudio/browser-runtime/tools/screenshot";
import {
  searchElementsTool,
  takeSnapshotTool,
} from "@aipexstudio/browser-runtime/tools/snapshot";
import {
  closeTabTool,
  createNewTabTool,
  getAllTabsTool,
  getCurrentTabTool,
  getTabInfoTool,
  switchToTabTool,
  ungroupTabsTool,
} from "@aipexstudio/browser-runtime/tools/tab";
import {
  downloadChatImagesTool,
  downloadImageTool,
} from "@aipexstudio/browser-runtime/tools/tools/downloads";
import { uploadFileToInputTool } from "@aipexstudio/browser-runtime/tools/tools/upload-file";

// 29 个工具（7 tab + 9 UI + 4 page + 3 screenshot + 2 download + 4 intervention）。
// Skill (6) 因引入 VM 已被剔除。
// 用 `as unknown as FunctionTool` 双转换消除 zod schema 泛型不匹配，与
// packages/browser-runtime/src/tools/index.ts 中 allBrowserTools 的做法保持一致。
const nonSkillBrowserTools: FunctionTool[] = [
  // Tab (7)
  getAllTabsTool as unknown as FunctionTool,
  getCurrentTabTool as unknown as FunctionTool,
  switchToTabTool as unknown as FunctionTool,
  createNewTabTool as unknown as FunctionTool,
  getTabInfoTool as unknown as FunctionTool,
  closeTabTool as unknown as FunctionTool,
  ungroupTabsTool as unknown as FunctionTool,
  // UI (9)
  takeSnapshotTool as unknown as FunctionTool,
  searchElementsTool as unknown as FunctionTool,
  clickTool as unknown as FunctionTool,
  fillElementByUidTool as unknown as FunctionTool,
  getEditorValueTool as unknown as FunctionTool,
  fillFormTool as unknown as FunctionTool,
  hoverElementByUidTool as unknown as FunctionTool,
  uploadFileToInputTool as unknown as FunctionTool,
  computerTool as unknown as FunctionTool,
  // Page (4)
  getPageMetadataTool as unknown as FunctionTool,
  scrollToElementTool as unknown as FunctionTool,
  highlightElementTool as unknown as FunctionTool,
  highlightTextInlineTool as unknown as FunctionTool,
  // Screenshot (3)
  captureScreenshotTool as unknown as FunctionTool,
  captureScreenshotWithHighlightTool as unknown as FunctionTool,
  captureTabScreenshotTool as unknown as FunctionTool,
  // Download (2)
  downloadImageTool as unknown as FunctionTool,
  downloadChatImagesTool as unknown as FunctionTool,
  // Intervention (4)
  ...(interventionTools as unknown as FunctionTool[]),
];

const toolIndex = new Map<string, FunctionTool>();
for (const tool of nonSkillBrowserTools) {
  toolIndex.set(tool.name, tool);
}

// ── Dev-time 一致性校验 ──────────────────────────────────────────────
// tool-router 提供实现，tool-schemas 提供 --list / --help / 参数类型转换。
// 二者是"实现-描述"关系，若漂移会出现"能调用但看不到"或"能看到但调用报错"。
// 这里只在启动时 warn，成本极低但能及时暴露维护错误。
export function assertRouterSchemaConsistency(schemaNames: readonly string[]): {
  missingSchemas: string[];
  missingImpls: string[];
} {
  const schemas = new Set(schemaNames);
  const impls = new Set(toolIndex.keys());
  const missingSchemas = [...impls].filter((n) => !schemas.has(n));
  const missingImpls = [...schemas].filter((n) => !impls.has(n));
  if (missingSchemas.length || missingImpls.length) {
    // eslint-disable-next-line no-console
    console.warn(
      "[browser-cli] tool-router/tool-schemas drift:",
      { missingSchemas, missingImpls },
    );
  }
  return { missingSchemas, missingImpls };
}

export class ToolNotFoundError extends Error {
  readonly code = "TOOL_NOT_FOUND";
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export interface RouteResult {
  tool: string;
  data: unknown;
}

export async function routeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<RouteResult> {
  const tool = toolIndex.get(name);
  if (!tool) throw new ToolNotFoundError(name);
  // FunctionTool.invoke(runContext, inputJsonString) — 与 ws-mcp-server 完全一致的调用方式。
  const data = await (
    tool as unknown as {
      invoke: (ctx: unknown, input: string) => Promise<unknown>;
    }
  ).invoke({}, JSON.stringify(args));
  return { tool: name, data };
}

export function getToolNames(): string[] {
  return Array.from(toolIndex.keys());
}
