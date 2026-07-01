import {
  type AutomationMode,
  STORAGE_KEYS,
  validateAutomationMode,
} from "@aipexstudio/aipex-core";
import { useCallback, useEffect, useState } from "react";

export function useAutomationMode(): [
  AutomationMode,
  (mode: AutomationMode) => Promise<void>,
  boolean,
] {
  const [mode, setMode] = useState<AutomationMode>("focus");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void chrome.storage.local
      .get(STORAGE_KEYS.AUTOMATION_MODE)
      .then((result) => {
        setMode(validateAutomationMode(result[STORAGE_KEYS.AUTOMATION_MODE]));
        setLoading(false);
      });

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      const change = changes[STORAGE_KEYS.AUTOMATION_MODE];
      if (change) {
        setMode(validateAutomationMode(change.newValue));
      }
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const setAutomationMode = useCallback(async (next: AutomationMode) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTOMATION_MODE]: next });
    setMode(next);
  }, []);

  return [mode, setAutomationMode, loading];
}
