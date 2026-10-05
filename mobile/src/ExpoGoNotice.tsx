import { registerRootComponent } from "expo";
import { StyleSheet, Text, View } from "react-native";

/**
 * What Expo Go shows in place of the app (see ../index.ts). Expo Go has none of the app's native parts (Firebase,
 * Google sign-in, push), so the app runs only in its own build: this says which to open, where the app would
 * otherwise stop at its first import with a screen of errors.
 */
function ExpoGoNotice() {
  return (
    <View style={styles.wrap} testID="expo-go-notice">
      <Text style={styles.title}>Open Hyber CRM, not Expo Go</Text>
      <Text style={styles.body}>Expo Go can&apos;t run Hyber CRM: it has no Firebase, no Google sign-in and no notifications. Open the Hyber CRM app on this phone instead.</Text>
      <Text style={styles.small}>Not on this phone yet? Run npm run iphone (or npm run android) from the HyberCRM folder once to install it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 15, color: "#737373", textAlign: "center" },
  small: { fontSize: 13, color: "#737373", textAlign: "center" },
});

registerRootComponent(ExpoGoNotice);
