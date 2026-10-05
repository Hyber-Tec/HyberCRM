import { authErrorMessage } from "@shared/auth";
import { TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { Dialog } from "@/components/Dialog";
import { PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { T } from "@/components/Text";
import { confirmIdentity, deleteMyAccount } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

/**
 * Delete my account (Apple guideline 5.1.1(v), DECISIONS §8): what goes and what a center keeps, then the person
 * confirms who they are (their password, or Google) and the server's `deleteMyAccount` removes the sign-in and the
 * personal profile; the app then signs out. Used in Profile → Settings and on every screen an account can be stuck on
 * (no center yet, email not confirmed, a portal not in the app yet, paused access), so any account can be deleted.
 */
export function DeleteAccountForm({ centerName, onDone }: { centerName?: string | null; onDone?: () => void }) {
  const colors = useColors();
  const { methods, email, signOut } = useAuth();
  const withPassword = methods.password;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setError(null);
    if (withPassword && !password) return setError("Enter your password to confirm it’s you.");
    const sure = await confirmAsync({
      title: "Delete your account?",
      message: "Your sign-in and personal profile are removed for good. You can’t undo this.",
      confirmLabel: "Delete account",
      destructive: true,
    });
    if (!sure) return;
    setBusy(true);
    try {
      if (!(await confirmIdentity(withPassword ? { password } : "google"))) return;
      await deleteMyAccount({});
      onDone?.();
      await signOut().catch(() => undefined);
      toast.success("Your account was deleted");
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      if (/wrong-password|invalid-credential|invalid-login-credentials/.test(code)) setError("That password isn’t right.");
      else if (code.startsWith("auth/")) setError(authErrorMessage(code, "sign-in"));
      else setError(errorMessage(e, "Couldn’t delete your account. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form} testID="delete-account-form">
      <View style={[styles.warning, { backgroundColor: colors.destructiveTint }]}>
        <TriangleAlert size={20} color={colors.destructive} />
        <T style={[styles.grow, { color: colors.destructive, fontWeight: "600" }]}>This can’t be undone.</T>
      </View>
      <View style={styles.text}>
        <T variant="label">What is deleted</T>
        <T tone="muted">Your sign-in ({email}) and your personal profile, including this phone and any other phone getting your notifications.</T>
        <T variant="label" style={styles.next}>
          {centerName ? `What ${centerName} keeps` : "What a center keeps"}
        </T>
        <T tone="muted">
          {centerName
            ? `Its own records of your work there: your employee record, sessions, session logs and pay. Your access to ${centerName} stays with your email; ask an admin if you want it removed too.`
            : "A center that added you keeps its own records (such as sessions and session logs). Your access stays with your email; ask the center if you want it removed too."}
        </T>
      </View>
      {withPassword ? (
        <PasswordField label="Your password" value={password} onChangeText={setPassword} autoComplete="current-password" textContentType="password" returnKeyType="done" testID="delete-password" />
      ) : (
        <T tone="muted">You’ll confirm with Google that it’s you.</T>
      )}
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <Button size="lg" variant="destructive" busy={busy} icon={withPassword ? undefined : <GoogleMark size={18} />} onPress={() => void remove()} testID="delete-account-confirm">
        {withPassword ? "Delete my account" : "Confirm with Google and delete"}
      </Button>
    </View>
  );
}

/** A quiet "Delete my account" link that opens the form in a dialog (screens outside the portal). */
export function DeleteAccountLink({ centerName }: { centerName?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="link" onPress={() => setOpen(true)} testID="delete-account-link">
        Delete my account
      </Button>
      <Dialog
        open={open}
        onRequestClose={() => setOpen(false)}
        testID="delete-account-dialog"
        footer={
          <Button variant="ghost" onPress={() => setOpen(false)}>
            Cancel
          </Button>
        }
      >
        <T variant="heading">Delete my account</T>
        <DeleteAccountForm centerName={centerName} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  warning: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, padding: space.lg },
  grow: { flex: 1 },
  text: { gap: space.xs },
  next: { marginTop: space.md },
});
