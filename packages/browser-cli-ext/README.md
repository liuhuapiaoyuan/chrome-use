# @aipexstudio/browser-cli-ext

A **lightweight** Chrome extension (MV3) that exposes browser-automation tools to
any web page through a single command channel — no Agent, no LLM, no chat UI.

It is the runtime counterpart of [`@qzsy/browser-cli-sdk`](../browser-cli-sdk/README.md).
Web pages send `browser-cli` envelopes; this extension parses them, calls one of
the 29 tools from `@aipexstudio/browser-runtime`, and returns a structured result.

```
+-------------+   external-connect    +----------------------+
| Web page    | <-------------------> | Browser-CLI ext       |
| (SDK)       |   content-bridge      |  • parses raw CLI     |
|             | <-------------------> |  • routes to tool      |
+-------------+   window.postMessage   |  • logs activity      |
                                       +----------------------+
                                                |
                                                v
                                       browser-runtime tools (29)
                                       @aipexstudio/browser-runtime
```

---

## Features

- **29 tools** — tabs, DOM interaction, page inspection, screenshots, downloads,
  human intervention. Sourced verbatim from `@aipexstudio/browser-runtime` via
  per-group deep imports (Skill tools are intentionally excluded because they
  pull in a QuickJS/emscripten VM and violate the "lightweight channel" goal —
  see [Skill tools & bundle size](#skill-tools--bundle-size)).
  Full reference: **[TOOLS.md](./TOOLS.md)** (capabilities, parameters, CLI conventions).
- **Two channels**
  - `chrome.runtime.onMessageExternal` — fastest, requires
    `externally_connectable.matches` to include the page origin.
  - Content-script `window.postMessage` bridge — universal fallback on
    `<all_urls>`.
- **CLI parser** — `--key value`, `--flag`, quoted strings, repeated `--key`
  (arrays), `key=value` (objects), boolean / number coercion driven by tool
  schemas.
- **Meta commands** — `-h`, `--list`, `--help <tool>`.
- **Popup status panel** — version, tool count, connected origins, last 20 calls,
  refresh / clear log.
- **Activity log** — in-memory ring buffer (50 entries), used by the popup.

Out of scope (YAGNI): Agent, chat, AI providers, Skill VM, recording, omnibox,
options page, side-panel, sandboxing.

---

## Install / Develop

```bash
# from repo root
pnpm install
pnpm --filter @aipexstudio/browser-cli-ext build
```

Then in Chrome:

1. Open `chrome://extensions/`
2. Toggle **Developer mode** on
3. Click **Load unpacked**
4. Select `packages/browser-cli-ext/build/`

Pin the extension's icon and click it to open the **status popup**.

For live development:

```bash
pnpm --filter @aipexstudio/browser-cli-ext dev
```

This produces a watched `build/` you can keep loaded; reload the extension after
each rebuild.

---

## Using it from a web page

Install the SDK in your page project:

```bash
pnpm add @qzsy/browser-cli-sdk
```

```ts
import { createBrowserCli } from "@qzsy/browser-cli-sdk";

const cli = await createBrowserCli({
  // Optional. If omitted only the content-bridge channel will be probed.
  extensionId: "<your extension id from chrome://extensions/>",
});

await cli.exec("-h");
await cli.exec("get_all_tabs");
await cli.exec('create_new_tab --url "https://example.com"');
await cli.call("create_new_tab", { url: "https://example.com" });
```

See the [SDK README](../browser-cli-sdk/README.md) for the full API.

---

## Wire protocol

The same envelope flows over both channels.

```ts
// Request
{
  ns: "browser-cli",
  v: 1,
  requestId: string,
  command: string,                    // tool name or meta: "-h" | "--list" | "--help"
  args: Record<string, unknown>,
  raw?: string                        // exec(raw) sets this; ext re-parses
}

// Response
{
  ns: "browser-cli",
  v: 1,
  requestId: string,                  // echoes the request
  ok: boolean,
  data?: unknown,                     // tool output (JSON-safe)
  error?: { code: string; message: string },
  meta?: { tookMs: number; tool: string }
}
```

The content-bridge channel adds `dir: "req" | "res"` on the `postMessage` body so
the bridge can ignore unrelated traffic.

### Error codes

| code              | meaning                                              |
|-------------------|------------------------------------------------------|
| `EMPTY_INPUT`     | `exec("")` / blank raw string                        |
| `EMPTY_TOOL`      | `call("", ...)`                                      |
| `TOOL_NOT_FOUND`  | unknown command name                                 |
| `PARSE_ERROR`     | malformed CLI string (missing value, unclosed quote) |
| `EXEC_FAILED`     | tool threw (often Zod validation)                    |
| `INVALID_ENVELOPE`| request didn't pass the envelope check               |

---

## Architecture

```
src/
├── background.ts            # MV3 service worker — central dispatch
├── content.ts               # window.postMessage ↔ runtime.sendMessage bridge
├── popup/                   # React 19 status panel (plain CSS)
│   ├── index.html
│   ├── index.tsx
│   ├── App.tsx
│   └── styles.css
└── lib/
    ├── tool-router.ts       # invokes allBrowserTools by name
    ├── tool-schemas.ts      # JSON Schema for help / type coercion
    ├── cli-parser.ts        # raw → { command, args } with coercion
    ├── help.ts              # -h / --list / --help renderers
    └── activity-log.ts      # in-memory ring buffer (50 entries)
```

### Dispatch flow

1. Page sends an envelope on Channel A or Channel B.
2. `background.ts` validates the envelope, then either:
   - parses `raw` via `cli-parser` if present, or
   - uses the supplied `command` / `args` directly.
3. Meta commands (`-h`, `--list`, `--help`) are answered locally.
4. Anything else is looked up in the `allBrowserTools` index and invoked.
5. The result (or error) is recorded in `activity-log` and returned.

---

## Permissions

The manifest declares the union of permissions needed by the 29 tools:

```
tabs, windows, tabGroups, activeTab, bookmarks, history, scripting, storage,
downloads, debugger, cookies, webNavigation
```

and `host_permissions: ["<all_urls>"]` because most tools (navigation,
screenshots, page intervention) operate cross-origin.

`externally_connectable.matches` defaults to:

```
http://localhost:*/*
https://*/*
```

Tighten this in `manifest.json` before publishing if you only need specific
origins.

---

## Design rules

- **KISS** — one envelope, one dispatcher, one popup.
- **YAGNI** — no auth, no batching, no streaming, no options page.
- **DRY** — `nonSkillBrowserTools` is composed from the same per-group modules
  the main `packages/browser-ext` uses; `tool-schemas` is the single source of
  parameter shapes for `--list` / `--help`.
- **SOLID/SRP** — each file does one thing: parsing, routing, help, logging, UI.

---

## Skill tools & bundle size

The 6 `skill_*` tools in `@aipexstudio/browser-runtime` are **not** exposed by
this extension. They statically pull in the QuickJS/emscripten VM
(`@jitl/quickjs-ng-wasmfile-release-sync`, `quickjs-emscripten`,
`@zenfs/core`, `@zenfs/dom`) — roughly **4.7 MB of `.wasm`** plus **~800 KB**
of JS glue — which contradicts the "lightweight command channel" goal.

Concretely, `src/lib/tool-router.ts` deep-imports each non-skill group from
`@aipexstudio/browser-runtime/tools/<group>` instead of importing
`allBrowserTools`, so tree-shaking can drop the skill subsystem entirely.

If you need skills, use the full `packages/browser-ext` instead — that
extension is designed for the Agent workload.
