import {
  type AutomationMode,
  STORAGE_KEYS,
  validateAutomationMode,
} from "@aipexstudio/aipex-core";
import { setAutomationModeOverride } from "@aipexstudio/browser-runtime/runtime/automation-mode";

/** Popup 偏好：仅表示 API 调用时是否使用后台行为，不持久影响全局。 */
export const BROWSER_CLI_STORAGE_KEYS = {
  AUTOMATION_PREFERENCE: "browser_cli_automation_preference",
} as const;

export const DEFAULT_AUTOMATION_PREFERENCE: AutomationMode = "background";

const TAB_GUARD_GRACE_MS = 1000;

let activeApiCalls = 0;
let tabGuardGraceTimer: ReturnType<typeof setTimeout> | undefined;

export async function getAutomationPreference(): Promise<AutomationMode> {
  const result = await chrome.storage.local.get(
    BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE,
  );
  const value = result[BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE];
  if (value === undefined || value === null) {
    return DEFAULT_AUTOMATION_PREFERENCE;
  }
  return validateAutomationMode(value);
}

export async function setAutomationPreference(
  mode: AutomationMode,
): Promise<void> {
  await chrome.storage.local.set({
    [BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE]: mode,
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTOMATION_MODE]: "focus" });
  setAutomationModeOverride(null);
}

export function isTabGuardActive(): boolean {
  return activeApiCalls > 0 || tabGuardGraceTimer != null;
}

/**
 * 若偏好为 background：在 fn 执行期间通过内存 override 启用后台模式，
 * 工具可读 getAutomationMode()===background；结束后立即清除 override。
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

  setAutomationModeOverride("background");

  try {
    return await fn();
  } finally {
    activeApiCalls--;
    setAutomationModeOverride(null);
    if (activeApiCalls === 0) {
      tabGuardGraceTimer = setTimeout(() => {
        tabGuardGraceTimer = undefined;
      }, TAB_GUARD_GRACE_MS);
    }
  }
}
