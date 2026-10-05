import { authErrorMessage, looksLikeEmail } from "@shared/auth";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { AuthHeader, ErrorBox, OrDivider } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { Field, PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { T } from "@/components/Text";
import { env } from "@/lib/env";
import { googleSignInConfigured } from "@/lib/googleSignIn";
import { useAuth } from "@/state/AuthProvider";
import { space } from "@/theme";

/** Sign in: Google (the recommended way) or the email and password the person created (web/src/pages/public/Login.tsx). */
export default function SignInScreen() {
  const { signInWithGoogle, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function google() {
    setError(null);
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code, "google"));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setError(null);
    if (!looksLikeEmail(email)) return setError(authErrorMessage("invalid-email"));
    if (!password) return setError(authErrorMessage("missing-password"));
    setBusy("password");
    try {
      await signInWithPassword(email, password);
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code, "sign-in"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <CenteredCard testID="sign-in">
      <AuthHeader title="Sign in" subtitle="Use the email your center has for you." />
      {googleSignInConfigured && (
        <>
          <Button variant="outline" size="lg" icon={<GoogleMark />} onPress={() => void google()} busy={busy === "google"} disabled={busy !== null} testID="google-sign-in">
            Continue with Google
          </Button>
          <OrDivider label="or sign in with your email" />
        </>
      )}
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="you@example.com"
          testID="email"
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="password"
        />
        <Button variant="link" style={styles.forgot} onPress={() => router.push({ pathname: "/forgot-password", params: email ? { email } : {} })} testID="forgot-password">
          Forgot password?
        </Button>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy === "password"} disabled={busy !== null} testID="sign-in-submit">
          Sign in
        </Button>
      </View>
      <View style={styles.footer}>
        <T variant="small" tone="muted">
          New to Hyber CRM?
        </T>
        <Button variant="link" onPress={() => router.push({ pathname: "/sign-up", params: email ? { email } : {} })} testID="go-sign-up">
          Create an account
        </Button>
      </View>
      <T variant="small" tone="muted" style={styles.center}>
        Your center gives you access. If you can&apos;t sign in, ask them which email they added.
        {env.useEmulators ? "\n\nPractice copy: the local emulators on this Mac." : ""}
      </T>
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  forgot: { alignSelf: "flex-end", marginTop: -space.xs },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },
  center: { textAlign: "center" },
});
