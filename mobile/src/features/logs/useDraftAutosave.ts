import type { LogContent } from "@shared/sessions/logs";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type SaveState = { state: "idle" | "saving" | "waiting" | "saved" | "error"; at?: number };

/**
 * Draft saving, as the website does it (before the first submit only): about 2 s after typing stops, on Next and
 * when a note loses focus (the form calls `saveNow`), when the app goes to the background, and at least every
 * `autosaveSeconds` while something is unsaved. Each save writes the whole log, so the newest one always wins; a
 * failed save stays unsaved and is tried again.
 */
export function useDraftAutosave({ enabled, content, intervalSeconds, write }: { enabled: boolean; content: LogContent; intervalSeconds: number; write: (c: LogContent) => Promise<void> }) {
  const dirty = useRef(false);
  const latest = useRef(content);
  const writeRef = useRef(write);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    latest.current = content;
    writeRef.current = write;
    enabledRef.current = enabled;
  });
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const seq = useRef(0);

  /** Saves now if anything changed; true once the draft is saved (or there was nothing to save). */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current || !dirty.current) return true;
    dirty.current = false;
    const id = ++seq.current;
    setSave({ state: "saving" });
    // Offline, Firestore keeps the write on the phone and sends it once it can: say we're waiting rather than spin.
    const slow = setTimeout(() => seq.current === id && setSave((s) => (s.state === "saving" ? { state: "waiting" } : s)), 6000);
    try {
      await writeRef.current(latest.current);
      if (seq.current === id) setSave({ state: "saved", at: Date.now() });
      return true;
    } catch {
      dirty.current = true;
      if (seq.current === id) setSave({ state: "error" });
      return false;
    } finally {
      clearTimeout(slow);
    }
  }, []);

  // ~2 s after the last change.
  useEffect(() => {
    if (!enabled || !dirty.current) return;
    const t = setTimeout(() => void saveNow(), 2000);
    return () => clearTimeout(t);
  }, [content, enabled, saveNow]);

  // At least every `autosaveSeconds`, and whenever the app leaves the screen (background, app switcher, a call).
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => void saveNow(), Math.max(5, intervalSeconds) * 1000);
    const sub = AppState.addEventListener("change", (s) => (s === "background" || s === "inactive") && void saveNow());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [enabled, intervalSeconds, saveNow]);

  return {
    save,
    saveNow,
    markDirty: () => {
      dirty.current = true;
    },
    isDirty: () => dirty.current,
    /** Stops pending saves (a submit carries the content itself); returns whether anything was unsaved. */
    take: () => {
      const was = dirty.current;
      dirty.current = false;
      return was;
    },
    restore: (was: boolean) => {
      if (was) dirty.current = true;
    },
  };
}
