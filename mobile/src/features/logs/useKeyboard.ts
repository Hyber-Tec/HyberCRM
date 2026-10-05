import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Whether the keyboard is up, as it moves (iPhone: as it starts to slide; Android: once it's shown), and a way to run
 * something once it's fully up (to scroll a field into the space left above it).
 */
export function useKeyboard(): { visible: boolean; whenShown: (fn: () => void) => void } {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  const shown = useRef(Keyboard.isVisible());
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setVisible(false));
    const didShow = Keyboard.addListener("keyboardDidShow", () => {
      shown.current = true;
      const fn = pending.current;
      pending.current = null;
      fn?.();
    });
    const didHide = Keyboard.addListener("keyboardDidHide", () => {
      shown.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
      didShow.remove();
      didHide.remove();
    };
  }, []);
  const whenShown = useCallback((fn: () => void) => {
    if (shown.current) {
      // Moving between fields: the space above the keyboard is already there.
      setTimeout(fn, 30);
      return;
    }
    pending.current = fn;
    // A hardware keyboard never shows the software one: run it anyway.
    setTimeout(() => {
      if (pending.current === fn) {
        pending.current = null;
        fn();
      }
    }, 700);
  }, []);
  return { visible, whenShown };
}
