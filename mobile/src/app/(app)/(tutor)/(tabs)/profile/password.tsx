import { authErrorMessage, passwordProblem } from "@shared/auth";
import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, type TextInput, View } from "react-native";
import { ErrorBox, StrengthMeter } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/Field";
import { T } from "@/components/Text";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { space, useColors } from "@/theme";

/**
 * Change the password, or add one to a Google account (the website's password dialog, same words and rules):
 * the current password first, then the new one twice, with the strength meter.
 */
export default function PasswordScreen() {
  const colors = useColors();
  const { methods, email, changePassword, sendPasswordReset } = useAuth();
  const adding = !methods.password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const submit = async () => {
    setError(null);
    if (!adding && !current) return setError("Enter your current password.");
    const problem = passwordProblem(next, email);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("The two new passwords don’t match.");
    setBusy(true);
    try {
      await changePassword(adding ? null : current, next);
      toast.success(adding ? "Password added" : "Password changed", { description: adding ? "You can now sign in with your email and password too." : undefined });
      router.back();
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code, "change-password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.grouped }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      testID="password-screen"
    >
      <Stack.Screen options={{ title: adding ? "Add a password" : "Change password" }} />
      <T tone="muted">{adding ? `Then you can also sign in with ${email} and this password.` : `For ${email}.`}</T>
      {!adding ? (
        <View style={styles.field}>
          <PasswordField
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
            testID="password-current"
          />
          <Button
            variant="link"
            size="sm"
            style={styles.forgot}
            onPress={async () => {
              if (!email) return;
              await sendPasswordReset(email).catch(() => undefined);
              toast.success("Reset link sent", { description: `Check ${email}.` });
            }}
          >
            Forgot it?
          </Button>
        </View>
      ) : null}
      <View style={styles.field}>
        <PasswordField
          ref={nextRef}
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          testID="password-new"
        />
        <StrengthMeter password={next} />
      </View>
      <PasswordField
        ref={confirmRef}
        label="Type it again"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        testID="password-confirm"
      />
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <Button size="lg" busy={busy} onPress={() => void submit()} testID="password-save">
        {adding ? "Add password" : "Change password"}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  field: { gap: space.sm },
  forgot: { alignSelf: "flex-start" },
});
