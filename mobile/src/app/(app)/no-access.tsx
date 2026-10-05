import { ROLE_LABELS } from "@shared/roles";
import { Clock, Link2, Mail, UserRound } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { ListRow, ListSection } from "@/components/List";
import { Logo } from "@/components/Logo";
import { T } from "@/components/Text";
import { openWebsite } from "@/lib/links";
import { useAccess } from "@/state/AccessProvider";
import { useAuth } from "@/state/AuthProvider";
import { space, useColors } from "@/theme";

/** Signed in, but no center has given this email access yet (the website's "No access yet"). */
export default function NoAccessScreen() {
  const { email, signOut } = useAuth();
  const access = useAccess();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const waiting = access.pending.length > 0;
  if (access.isSuperAdmin)
    return (
      <CenteredCard testID="no-access-super-admin">
        <View style={styles.head}>
          <Logo size={48} />
          <T variant="title" style={styles.center}>
            Platform account
          </T>
          <T tone="muted" style={styles.center}>
            {email} runs Hyber CRM itself. The platform tools (every center, sign-ups, branch rules) are on the website. To try a center&apos;s portal on the phone, sign in with an account that center added, such as Demo Academy&apos;s demo tutor.
          </T>
        </View>
        <View style={styles.buttons}>
          <Button size="lg" onPress={() => void openWebsite("/platform")}>
            Open the platform on the website
          </Button>
          <Button variant="outline" onPress={() => void signOut()}>
            Use another account
          </Button>
        </View>
      </CenteredCard>
    );
  return (
    <CenteredCard testID="no-access">
      <View style={styles.head}>
        <Logo size={48} />
        <T variant="title" style={styles.center}>
          {waiting ? "Waiting for approval" : "No access yet"}
        </T>
        <T tone="muted" style={styles.center}>
          You&apos;re signed in as {email}. {waiting ? "The center will review your request; you'll get an email when it's approved." : "No center has given this address access yet."}
        </T>
      </View>
      {waiting ? (
        <ListSection title="Your requests">
          {access.pending.map((r) => (
            <ListRow key={r.branchId} icon={<Clock size={18} color={colors.warning} />} title={r.branchName ?? r.branchId} subtitle={`${ROLE_LABELS[r.requestedRole]} · waiting`} />
          ))}
        </ListSection>
      ) : (
        <ListSection>
          <ListRow icon={<Mail size={18} color={colors.mutedForeground} />} title="Got an invitation email?" subtitle="Sign in with the address it was sent to." />
          <ListRow icon={<Link2 size={18} color={colors.mutedForeground} />} title="Have your center's sign-up link?" subtitle="Open it on the website to request access with this account." />
          <ListRow icon={<UserRound size={18} color={colors.mutedForeground} />} title="Neither?" subtitle={`Ask your center's admin to add ${email}.`} />
        </ListSection>
      )}
      <View style={styles.buttons}>
        <Button
          size="lg"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            await access.refresh();
            setBusy(false);
          }}
        >
          Check again
        </Button>
        <Button variant="outline" onPress={() => void signOut()}>
          Use another account
        </Button>
      </View>
      <DeleteAccountLink />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
