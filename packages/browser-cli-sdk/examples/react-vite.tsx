// React + Vite 场景下的最小用法示例（片段）。
// 复制到你的项目里即可；确保浏览器已安装 Browser-CLI 扩展。

import {
  type BrowserCli,
  BrowserCliError,
  createBrowserCli,
} from "@qzsy/browser-cli-sdk";
import { useEffect, useRef, useState } from "react";

export function CliDemo() {
  const cliRef = useRef<BrowserCli | null>(null);
  const [channel, setChannel] = useState<"external" | "content" | null>(null);
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const cli = await createBrowserCli({
          // 可选：显式指定扩展 ID 走 externallyConnectable 直连
          extensionId: import.meta.env["VITE_BROWSER_CLI_EXT_ID"],
          transport: "auto",
          timeoutMs: 15_000,
        });
        if (disposed) {
          cli.dispose();
          return;
        }
        cliRef.current = cli;
        setChannel(cli.channel);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      disposed = true;
      cliRef.current?.dispose();
    };
  }, []);

  const run = async (fn: (cli: BrowserCli) => Promise<unknown>) => {
    const cli = cliRef.current;
    if (!cli) return;
    setError(null);
    try {
      setOutput(await fn(cli));
    } catch (e) {
      if (e instanceof BrowserCliError) setError(`[${e.code}] ${e.message}`);
      else setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) return <pre style={{ color: "crimson" }}>{error}</pre>;
  if (!channel) return <p>连接中…</p>;

  return (
    <div>
      <p>
        通道: <b>{channel}</b>
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => run((c) => c.list())}>list()</button>
        <button onClick={() => run((c) => c.help("create_new_tab"))}>
          help(&apos;create_new_tab&apos;)
        </button>
        <button onClick={() => run((c) => c.call("get_all_tabs", {}))}>
          get_all_tabs
        </button>
        <button
          onClick={() =>
            run(async (c) => {
              const tabs = (await c.call("get_all_tabs", {})) as {
                tabs: Array<{ id: number }>;
              };
              const tabId = tabs.tabs[0]?.id;
              if (!tabId) return { error: "no tabs" };
              return c.takeSnapshot({ tabId });
            })
          }
        >
          take_snapshot
        </button>
        <button
          onClick={() =>
            run((c) =>
              c.exec("create_new_tab --url https://example.com --active true"),
            )
          }
        >
          create_new_tab (exec)
        </button>
      </div>
      <pre style={{ background: "#0b1021", color: "#e6edf3", padding: 12 }}>
        {output ? JSON.stringify(output, null, 2) : "(无输出)"}
      </pre>
    </div>
  );
}
