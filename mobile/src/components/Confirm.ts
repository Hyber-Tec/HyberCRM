import { Alert } from "react-native";

/**
 * Asks before something that can't be undone or needs a second thought, in the phone's own alert (as the website's
 * confirm dialogs). Resolves true when the person chose the action, false when they canceled or closed it.
 */
export function confirmAsync({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
