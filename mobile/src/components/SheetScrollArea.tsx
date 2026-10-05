import type { ReactNode } from "react";
import { Platform, ScrollView, type StyleProp, View, type ViewStyle } from "react-native";

/**
 * A part of a sheet whose own controls scroll, such as the time wheels. Android's sheets (Material's bottom sheet)
 * follow only the first scrollable view inside them: a drag on any other one moves the sheet instead, so the second
 * wheel pulled the day sheet closed. On Android this area is that first scrollable view (it never scrolls itself), so
 * the sheet leaves drags inside it to the wheels; elsewhere it is a plain View.
 */
export function SheetScrollArea({ style, children, testID }: { style?: StyleProp<ViewStyle>; children: ReactNode; testID?: string }) {
  if (Platform.OS !== "android") {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView scrollEnabled={false} nestedScrollEnabled style={{ flexGrow: 0 }} contentContainerStyle={style} testID={testID}>
      {children}
    </ScrollView>
  );
}
