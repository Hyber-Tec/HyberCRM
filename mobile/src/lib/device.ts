import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "hybercrm.deviceId";

let deviceId: Promise<string> | null = null;

/**
 * A random id kept in the phone's secure storage for as long as the app is installed: this install's device doc
 * (users/{uid}/devices/{id}) is named by it, so a new push token replaces the old one in place.
 */
export function getDeviceId(): Promise<string> {
  deviceId ??= (async () => {
    try {
      const saved = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (saved) return saved;
      const id = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
      return id;
    } catch {
      return `install-${Crypto.randomUUID()}`;
    }
  })();
  return deviceId;
}

const osName = (): string => (Platform.OS === "android" ? "Android" : Device.osName === "iPadOS" ? "iPadOS" : "iOS");

/** "1.0.0 (12)": the app's version and build. */
export const appVersion = (): string => `${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"})`;

const modelName = (): string => [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || "Unknown device";

/** "Apple iPhone 17 Pro, iOS 27.0": this phone in the person's list of devices. */
export const deviceLabel = (): string => `${modelName()}, ${osName()} ${Device.osVersion ?? ""}`.trim();
