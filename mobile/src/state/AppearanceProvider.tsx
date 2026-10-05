import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";

export type AppearancePref = "system" | "light" | "dark";

const KEY = "hybercrm.appearance";
const AppearanceContext = createContext<{ pref: AppearancePref; setPref: (p: AppearancePref) => void } | null>(null);

function apply(pref: AppearancePref) {
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

/**
 * Light, dark, or the phone's own setting (Profile → Settings → Appearance), remembered on this phone. Applied to the
 * whole app, the native tab bar, headers and pickers included.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<AppearancePref>("system");
  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((v) => {
      if (v === "light" || v === "dark") {
        setPrefState(v);
        apply(v);
      }
    });
  }, []);
  const setPref = useCallback((p: AppearancePref) => {
    setPrefState(p);
    apply(p);
    void AsyncStorage.setItem(KEY, p).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance outside AppearanceProvider");
  return ctx;
}
