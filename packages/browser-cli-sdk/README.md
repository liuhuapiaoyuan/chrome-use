# @qzsy/browser-cli-sdk

A thin TypeScript client for the **Browser-CLI** Chrome extension. Lets any web page
invoke browser-automation tools (tabs, navigation, downloads, screenshots, etc.) via
a single message channel — no Agent, no LLM, no UI overlay.

The SDK auto-negotiates transport:

1. **External Connect** — `chrome.runtime.sendMessage(extensionId, …)` (fast, requires
   the page origin to match the extension's `externally_connectable.matches`).
2. **Content-Bridge** — `window.postMessage` ↔ injected content script (works on any
   page where the extension's content script can attach).

If neither channel responds during the handshake, `create()` throws
`BrowserCliNotAvailableError`.

---

## Install

```bash
pnpm add @qzsy/browser-cli-sdk
# or: npm i / yarn add
```

You also need the companion extension installed in Chrome:

- Source: `packages/browser-cli-ext` in this repo
- Build: `pnpm --filter @aipexstudio/browser-cli-ext build`
- Load `packages/browser-cli-ext/build/` as an **unpacked extension** at
  `chrome://extensions/` (developer mode on)

---

## Quick start

```ts
import { createBrowserCli } from "@qzsy/browser-cli-sdk";

const cli = await createBrowserCli({
  // Optional. If omitted, only the content-bridge channel will be tried.
  extensionId: "abcdefghijklmnopabcdefghijklmnop",
});

// 1) String / CLI style
await cli.exec("-h");                         // help overview
await cli.exec("--list");                     // list of 29 tools
await cli.exec("--help create_new_tab");      // single-tool help
await cli.exec("create_new_tab --url https://example.com");
await cli.exec("take_snapshot --tabId 123");

// 2) Object / typed style
const tabs = await cli.call("get_all_tabs", {});
const created = await cli.call("create_new_tab", { url: "https://example.com" });
const snapshot = await cli.takeSnapshot({ tabId: 123 });
const matches = await cli.searchElements({
  tabId: 123,
  query: "{button,input}*",
});

// 3) Meta APIs
const overview = await cli.help();
const toolHelp = await cli.help("create_new_tab");
const { tools, count } = await cli.list();

cli.dispose();
```

---

## API

### `createBrowserCli(options?) → Promise<BrowserCli>`

| option               | type                              | default | meaning                                                        |
|----------------------|-----------------------------------|---------|----------------------------------------------------------------|
| `extensionId`        | `string`                          | —       | Required to use the External Connect channel.                  |
| `transport`          | `"auto" \| "external" \| "content"` | `"auto"` | Force a specific channel; otherwise probe in order.          |
| `timeoutMs`          | `number`                          | `30000` | Per-request timeout.                                           |
| `handshakeTimeoutMs` | `number`                          | `500`   | Per-channel ping timeout during transport negotiation.         |

### `BrowserCli` instance

| method                              | returns                                         |
|-------------------------------------|-------------------------------------------------|
| `exec(raw: string)`                 | `Promise<unknown>` — runs a raw CLI string.     |
| `call(name, args = {})`             | `Promise<unknown>` — invokes a tool by name.    |
| `takeSnapshot({ tabId })`           | `Promise<TakeSnapshotResult>` — full page DOM snapshot. |
| `searchElements({ tabId, query, … })` | `Promise<SearchElementsResult>` — search snapshot. |
| `list()`                            | `Promise<{ tools: ToolListEntry[]; count }>`    |
| `help(name?)`                       | `Promise<HelpOverview \| ToolHelp>`             |
| `channel`                           | `"external" \| "content"` — negotiated channel. |
| `dispose()`                         | `void` — removes listeners, cancels pending.    |

### Typed tool helpers

```ts
import type {
  TakeSnapshotArgs,
  TakeSnapshotResult,
  SearchElementsArgs,
  SearchElementsResult,
} from "@qzsy/browser-cli-sdk";

const { snapshot, title, url } = await cli.takeSnapshot({ tabId: 123 });
const { data } = await cli.searchElements({
  tabId: 123,
  query: "*登录*",
  contextLevels: 2,
});
```

`TakeSnapshotResult.snapshot` is the full formatted accessibility-style DOM tree text.
Use `searchElements` when you only need matching lines (lower token cost).

### Errors

```ts
import {
  BrowserCliError,
  BrowserCliTimeoutError,
  BrowserCliNotAvailableError,
} from "@qzsy/browser-cli-sdk";
```

| class                          | `code`           | meaning                                                  |
|--------------------------------|------------------|----------------------------------------------------------|
| `BrowserCliError`              | various          | Base class. `.code` is a string tag.                     |
| `BrowserCliTimeoutError`       | `TIMEOUT`        | Request exceeded `timeoutMs`.                            |
| `BrowserCliNotAvailableError`  | `NOT_AVAILABLE`  | No channel responded during handshake (extension off?). |

Common `.code` values returned by the extension:

- `TOOL_NOT_FOUND` — unknown command
- `EMPTY_INPUT` / `EMPTY_TOOL` — empty `exec`/`call` argument
- `EXEC_FAILED` — tool threw (often Zod validation)
- `INVALID_RESPONSE` — extension returned an unexpected shape
- `RUNTIME_ERROR` — `chrome.runtime.lastError`

---

## Wire protocol

Both transports share the same envelope. You don't need this for normal use — it's
documented for debugging.

```ts
// Request (page → extension)
{
  ns: "browser-cli",
  v: 1,
  requestId: "<nanoid>",
  command: "create_new_tab",           // tool name, or "-h" / "--list" / "--help"
  args: { url: "https://example.com" },
  raw?: "create_new_tab --url ..."     // only set when exec(raw) is used
}

// Response (extension → page)
{
  ns: "browser-cli",
  v: 1,
  requestId: "<same nanoid>",
  ok: true,
  data?: <tool output>,
  error?: { code: "...", message: "..." },
  meta?: { tookMs: 12, tool: "create_new_tab" }
}
```

For the content-bridge channel each frame carries an extra `dir: "req" | "res"`
field on the `window.postMessage` payload.

---

## Build

```bash
pnpm --filter @qzsy/browser-cli-sdk build
```

Produces `dist/index.js` (ESM), `dist/index.cjs` (CJS) and `dist/index.d.ts`.

---

## Design rules

- **KISS** — one channel, one envelope, two API styles (string + object).
- **YAGNI** — no batching, no streaming, no auth tokens. Add when needed.
- **DRY** — schemas and parser live in the extension; the SDK is intentionally
  schema-free so the extension is the single source of truth.
