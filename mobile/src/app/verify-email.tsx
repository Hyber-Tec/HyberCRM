import { authErrorMessage } from "@shared/auth";
import { SENDER_EMAIL } from "@shared/brand";
import { MailCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { T } from "@/components/Text";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

/**
 * "Confirm your email": a new password account waits here until its address is confirmed. It checks by itself every
 * few seconds and whenever the app comes back to the front, so opening the link in the mail app is enough.
 */
export default function VerifyEmailScreen() {
  const { user, sendVerification, checkVerified, signOut } = useAuth();
  const colors = useColors();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  const check = useCallback(
    async (quiet: boolean) => {
      if (busy.current) return;
      busy.current = true;
      if (!quiet) setChecking(true);
      try {
        const ok = await checkVerified();
        if (!ok && !quiet) toast.info("Not confirmed yet", { description: "Open the link in the email, then try again." });
      } catch (e) {
        if (!quiet) toast.error(authErrorMessage((e as { code?: string }).code, "verify"));
      } finally {
        busy.current = false;
        if (!quiet) setChecking(false);
      }
    },
    [checkVerified],
  );

  useEffect(() => {
    const t = setInterval(() => void check(true), 5000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && void check(true));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [check]);

  useEffect(() => {
    if (cooldownUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil, now]);
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function resend() {
    setSending(true);
    try {
      const r = await sendVerification();
      if (r === "verified") return void check(false);
      if (r === "throttled") toast.info("Already sent", { description: "Give it a minute, and check your spam folder too." });
      else toast.success("Email sent", { description: `Check ${user?.email}.` });
      setNow(Date.now());
      setCooldownUntil(Date.now() + 60_000);
    } catch (e) {
      toast.error(authErrorMessage((e as { code?: string }).code, "verify"));
    } finally {
      setSending(false);
    }
  }

  return (
    <CenteredCard testID="verify-email">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <MailCheck size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        Confirm your email
      </T>
      <T tone="muted" style={styles.center}>
        We sent a link to {user?.email}. Open it to confirm the address; this screen moves on by itself once you have.
      </T>
      <View style={styles.buttons}>
        {Platform.OS === "ios" ? (
          <Button size="lg" onPress={() => void Linking.openURL("message://").catch(() => undefined)} testID="open-mail">
            Open Mail
          </Button>
        ) : null}
        <Button size="lg" variant={Platform.OS === "ios" ? "outline" : "default"} onPress={() => void check(false)} busy={checking} testID="check-verified">
          I&apos;ve confirmed it
        </Button>
        <Button variant="outline" onPress={() => void resend()} busy={sending} disabled={cooldown > 0} testID="resend">
          {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the email again"}
        </Button>
      </View>
      <T variant="small" tone="muted" style={styles.center}>
        The email comes from Hyber CRM ({SENDER_EMAIL}). Not there after a minute? Check your spam folder.
      </T>
      <Button variant="link" onPress={() => void signOut()} testID="use-another">
        Use another account
      </Button>
      <DeleteAccountLink />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
