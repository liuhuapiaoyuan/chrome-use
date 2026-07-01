import {
  type AutomationMode,
  validateAutomationMode,
} from "@aipexstudio/aipex-core";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_AUTOMATION_PREFERENCE,
  getAutomationPreference,
  setAutomationPreference,
  BROWSER_CLI_STORAGE_KEYS,
} from "../lib/automation-preference";

export function useAutomationMode(): [
  AutomationMode,
  (mode: AutomationMode) => Promise<void>,
  boolean,
] {
  const [mode, setMode] = useState<AutomationMode>(
    DEFAULT_AUTOMATION_PREFERENCE,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getAutomationPreference().then((preference) => {
      setMode(preference);
      setLoading(false);
    });

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      const change = changes[BROWSER_CLI_STORAGE_KEYS.AUTOMATION_PREFERENCE];
      if (change) {
        setMode(validateAutomationMode(change.newValue));
      }
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const setAutomationMode = useCallback(async (next: AutomationMode) => {
    await setAutomationPreference(next);
    setMode(next);
  }, []);

  return [mode, setAutomationMode, loading];
}
