import { ScrollView, StyleSheet } from "react-native";
import { DeleteAccountForm } from "@/features/account/DeleteAccount";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/** Profile → Settings → Delete my account (the form is shared with the screens outside the portal). */
export default function DeleteAccountScreen() {
  const colors = useColors();
  const { name } = useBranch();
  return (
    <ScrollView
      style={{ backgroundColor: colors.grouped }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      testID="delete-account-screen"
    >
      <DeleteAccountForm centerName={name} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
});
