# Browser-CLI SDK 示例

## 前置条件

1. 安装并加载 `@aipexstudio/browser-cli-ext` 扩展（`chrome://extensions/` → 开发者模式 → 加载已解压扩展 → 选 `packages/browser-cli-ext/build/`）。
2. 完成 SDK 构建：`pnpm --filter @qzsy/browser-cli-sdk build`（产物落在 `dist/`）。

## 1. Vanilla HTML — `vanilla/index.html`

直接 file:// 打开不行（ESM + externally_connectable 匹配 http/https），启一个静态服务器即可：

```bash
# 任选其一
npx serve packages/browser-cli-sdk        # http://localhost:3000/examples/vanilla/
python -m http.server -d packages/browser-cli-sdk 3000
```

打开 <http://localhost:3000/examples/vanilla/> 点按钮即可看到各 API 的返回结果。

## 2. React + Vite — `react-vite.tsx`

把 `react-vite.tsx` 拷入你的 Vite 项目组件树，安装依赖：

```bash
pnpm add @qzsy/browser-cli-sdk
```

如果希望优先走 `externallyConnectable` 直连（更快、无需 content-script 注入），把扩展 ID 写入 `.env`：

```
VITE_BROWSER_CLI_EXT_ID=abcdefghijklmnop...
```

无扩展 ID 时 SDK 会自动回退到 content-bridge 通道，网页也能正常工作。

## API 速览

```ts
const cli = await createBrowserCli({ transport: 'auto', timeoutMs: 15_000 });

// 元命令
await cli.help();                       // 总览
await cli.help('create_new_tab');       // 单工具签名
await cli.list();                       // { tools, count }

// 两种调用风格
await cli.call('get_all_tabs', {});
await cli.exec('create_new_tab --url https://example.com --active true');

// 错误处理
try { await cli.exec('not_a_tool'); }
catch (e) {
  if (e instanceof BrowserCliError) console.error(e.code, e.message);
}

cli.dispose(); // 释放监听器
```
