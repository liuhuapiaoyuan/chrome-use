import path from "node:path";
import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

// 浏览器扩展构建配置。复用 @aipexstudio/browser-runtime 的 32 个工具，
// 通过别名直接指向源文件，与 packages/browser-ext 保持一致的开发体验。
export default defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest as unknown as ManifestV3Export }),
  ],
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: [
      { find: "~", replacement: path.resolve(__dirname, "./src") },
      {
        find: "@aipexstudio/aipex-core",
        replacement: path.resolve(__dirname, "../core/src/index.ts"),
      },
      {
        find: /^@aipexstudio\/browser-runtime\/(.*)$/,
        replacement: path.resolve(__dirname, "../browser-runtime/src/$1"),
      },
      {
        find: "@aipexstudio/browser-runtime",
        replacement: path.resolve(__dirname, "../browser-runtime/src/index.ts"),
      },
      {
        find: /^@aipexstudio\/dom-snapshot\/(.*)$/,
        replacement: path.resolve(__dirname, "../dom-snapshot/src/$1"),
      },
      {
        find: "@aipexstudio/dom-snapshot",
        replacement: path.resolve(__dirname, "../dom-snapshot/src/index.ts"),
      },
    ],
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    sourcemap: false,
  },
});
