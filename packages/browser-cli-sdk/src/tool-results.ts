/** take_snapshot 工具参数与返回值。 */
export interface TakeSnapshotArgs {
  tabId: number;
}

export interface TakeSnapshotResult {
  success: boolean;
  message: string;
  tabId: number;
  title: string;
  url: string;
  /** 格式化的无障碍风格 DOM 快照文本，含 uid / role / name。 */
  snapshot: string;
}

/** search_elements 工具参数与返回值。 */
export interface SearchElementsArgs {
  tabId: number;
  query: string;
  contextLevels?: number;
}

export interface SearchElementsResult {
  success: boolean;
  message: string;
  data: string;
}
