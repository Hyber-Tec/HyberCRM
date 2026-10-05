import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/**
 * A "Done" bar above the iPhone's keyboard, for fields whose keyboard has no return key (the phone pad): tapping it
 * closes the keyboard, which saves the field. Give the field `inputAccessoryViewID={id}`. Android's keyboards have
 * their own Done key, so nothing is drawn there.
 */
export function DoneBar({ id }: { id: string }) {
  const colors = useColors();
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={id} backgroundColor={colors.card}>
      <View style={[styles.bar, { borderTopColor: colors.border }]}>
        <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} hitSlop={8} testID={`${id}-done`}>
          <T variant="label">Done</T>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
