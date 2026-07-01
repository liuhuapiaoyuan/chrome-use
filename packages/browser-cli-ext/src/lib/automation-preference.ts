import {
  type AutomationMode,
  STORAGE_KEYS,
  validateAutomationMode,
} from "@aipexstudio/aipex-core";

/** Popup 偏好：仅表示 API 调用时是否使用后台行为，不持久影响全局。 */
export const BROWSER_CLI_STORAGE_KEYS = {
  AUTOMATION_PREFERENCE: "browser_cli_automation_preference",
} as const;

const TAB_GUARD_GRACE_MS = 1000;

let activeApiCalls = 0;
let tabGuardGraceTimer: ReturnType<typeof setTimeout> | undefined;

export async function getAutomationPreference(): Promise<AutomationMode> {
  const result = await chrome.storage.local.get(
    BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE,
  );
  return validateAutomationMode(
    result[BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE],
  );
}

export async function setAutomationPreference(
  mode: AutomationMode,
): Promise<void> {
  await chrome.storage.local.set({
    [BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE]: mode,
  });
  // 偏好切换不持久写入全局 automation_mode，避免影响用户日常浏览。
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTOMATION_MODE]: "focus" });
}

export function isTabGuardActive(): boolean {
  return activeApiCalls > 0 || tabGuardGraceTimer != null;
}

/**
 * 若偏好为 background：在 fn 执行期间临时写入 automation_mode=background，
 * 结束后立即恢复 focus；tab guard 额外保留短 grace 以捕获异步新开 tab。
 */
export async function runWithAutomationContext<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const preference = await getAutomationPreference();
  if (preference !== "background") {
    return fn();
  }

  clearTimeout(tabGuardGraceTimer);
  tabGuardGraceTimer = undefined;
  activeApiCalls++;

  await chrome.storage.local.set({
    [STORAGE_KEYS.AUTOMATION_MODE]: "background",
  });

  try {
    return await fn();
  } finally {
    activeApiCalls--;
    if (activeApiCalls === 0) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.AUTOMATION_MODE]: "focus",
      });
      tabGuardGraceTimer = setTimeout(() => {
        tabGuardGraceTimer = undefined;
      }, TAB_GUARD_GRACE_MS);
    }
  }
}
