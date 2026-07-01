import { isTabGuardActive } from "./automation-preference";

let lastFocusedWindowId: number | undefined;

async function initLastFocusedWindow(): Promise<void> {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (win.id != null) {
      lastFocusedWindowId = win.id;
    }
  } catch {
    // ignore — service worker may start before any window exists
  }
}

async function defocusNewTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.active || tab.id == null || tab.openerTabId == null) return;
  if (!isTabGuardActive()) return;

  try {
    await chrome.tabs.update(tab.id, { active: false });
    await chrome.tabs.update(tab.openerTabId, { active: true });
  } catch (error) {
    console.warn("[browser-cli] background tab guard failed:", error);
  }
}

async function defocusNewWindow(win: chrome.windows.Window): Promise<void> {
  if (!win.focused || win.id == null) return;
  if (!isTabGuardActive()) return;

  const restoreWindowId = lastFocusedWindowId;
  if (restoreWindowId == null || restoreWindowId === win.id) return;

  try {
    await chrome.windows.update(win.id, { focused: false });
    await chrome.windows.update(restoreWindowId, { focused: true });
  } catch (error) {
    console.warn("[browser-cli] background window guard failed:", error);
  }
}

export function installBackgroundTabGuard(): void {
  void initLastFocusedWindow();

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      lastFocusedWindowId = windowId;
    }
  });

  chrome.tabs.onCreated.addListener((tab) => {
    void defocusNewTab(tab);
  });

  chrome.windows.onCreated.addListener((win) => {
    void defocusNewWindow(win);
  });
}
