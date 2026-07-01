// 传输抽象：两种通道实现共用同一接口。
import type {
  BrowserCliRequest,
  BrowserCliResponse,
} from "../types";

export interface Transport {
  readonly kind: "external" | "content";
  /** 发送请求并等待响应。超时由各实现自行处理。 */
  send(request: BrowserCliRequest, timeoutMs: number): Promise<BrowserCliResponse>;
  /** 探活；成功返回 true，否则 false。 */
  ping(timeoutMs: number): Promise<boolean>;
  /** 关闭并释放资源（若有）。 */
  dispose(): void;
}
