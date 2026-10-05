import { authErrorMessage, looksLikeEmail } from "@shared/auth";
import { router, useLocalSearchParams } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthHeader, ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { Field } from "@/components/Field";
import { T } from "@/components/Text";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

/** "Forgot password?": emails a link to choose a new one. It never says whether the address has an account. */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset } = useAuth();
  const colors = useColors();
  const [email, setEmail] = useState(params.email ?? "");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/sign-in"));

  async function submit() {
    setError(null);
    if (!looksLikeEmail(email)) return setError(authErrorMessage("invalid-email"));
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code, "reset"));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo)
    return (
      <CenteredCard testID="reset-sent">
        <View style={styles.icon}>
          <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
            <MailCheck size={28} color={colors.foreground} />
          </View>
        </View>
        <T variant="title" style={styles.center}>
          Check your email
        </T>
        <T tone="muted" style={styles.center}>
          If there&apos;s a Hyber CRM account for {sentTo}, we sent it a link to choose a new password. The link works once, for an hour. Then come back and sign in.
        </T>
        <Button size="lg" onPress={back}>
          Back to sign in
        </Button>
        <T variant="small" tone="muted" style={styles.center}>
          Signed up with Google? Then you don&apos;t need a password: use “Continue with Google”.
        </T>
      </CenteredCard>
    );

  return (
    <CenteredCard testID="forgot-password">
      <AuthHeader title="Reset your password" subtitle="Enter the email you sign in with. We'll email you a link to choose a new password." />
      <View style={styles.form}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          placeholder="you@example.com"
          autoFocus
          testID="email"
        />
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy} testID="send-reset">
          Send reset link
        </Button>
        <Button variant="ghost" onPress={back}>
          Back to sign in
        </Button>
      </View>
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
});
