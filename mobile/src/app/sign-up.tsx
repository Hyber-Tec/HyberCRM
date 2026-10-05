import { authErrorMessage, isGoogleMailbox, looksLikeEmail, passwordProblem } from "@shared/auth";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { AuthHeader, ErrorBox, OrDivider, StrengthMeter } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { Field, PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { T } from "@/components/Text";
import { googleSignInConfigured } from "@/lib/googleSignIn";
import { useAuth } from "@/state/AuthProvider";
import { space } from "@/theme";

/**
 * A new account with an email and a password (web/src/pages/public/SignUp.tsx). Google is offered first: quicker
 * when the email is a Google account. Access still comes from the center, matched by the confirmed email.
 */
export default function SignUpScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { signInWithGoogle, signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
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
    if (!name.trim()) return setError("Enter your name.");
    if (!looksLikeEmail(email)) return setError(authErrorMessage("invalid-email"));
    const problem = passwordProblem(password, email);
    if (problem) return setError(problem);
    setBusy("password");
    try {
      await signUp({ name, email, password });
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code, "sign-up"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <CenteredCard testID="sign-up">
      <AuthHeader title="Create your account" subtitle="Use the email your center has for you." />
      {googleSignInConfigured && (
        <>
          <Button variant="outline" size="lg" icon={<GoogleMark />} onPress={() => void google()} busy={busy === "google"} disabled={busy !== null}>
            Continue with Google
          </Button>
          <T variant="small" tone="muted" style={styles.center}>
            Quickest if your email is a Google account: no password to remember.
          </T>
          <OrDivider label="or create a password" />
        </>
      )}
      <View style={styles.form}>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" autoComplete="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} testID="name" />
        <Field
          ref={emailRef}
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
          hint={isGoogleMailbox(email) && googleSignInConfigured ? "A Gmail address: “Continue with Google” works without a password." : undefined}
          testID="email"
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="password"
        />
        <StrengthMeter password={password} />
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy === "password"} disabled={busy !== null} testID="sign-up-submit">
          Create account
        </Button>
        <T variant="small" tone="muted">
          We&apos;ll email you a link to confirm the address before you can open your center.
        </T>
      </View>
      <View style={styles.footer}>
        <T variant="small" tone="muted">
          Already have an account?
        </T>
        <Button variant="link" onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))}>
          Sign in
        </Button>
      </View>
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },
  center: { textAlign: "center" },
});
