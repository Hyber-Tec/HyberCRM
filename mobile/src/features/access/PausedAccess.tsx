import { PauseCircle } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { T } from "@/components/Text";
import { useAccess } from "@/state/AccessProvider";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

const WORDS = {
  paused: { title: "Your access is paused", text: (email: string, name: string) => `${email} is paused in ${name}. Ask an admin of the center to restore your access.` },
  removed: { title: "No access to this center", text: (email: string, name: string) => `${name} no longer lists ${email}. Ask an admin of the center if this is a mistake.` },
  unavailable: { title: "This center isn't available", text: (_email: string, name: string) => `${name} can't be opened right now. Try again later, or contact the center.` },
} as const;

/** The person can't use the center: their access was paused or removed by an admin, or the center isn't open. */
export function PausedAccess({ branchName, why = "paused" }: { branchName: string; why?: keyof typeof WORDS }) {
  const { email, signOut } = useAuth();
  const access = useAccess();
  const colors = useColors();
  const others = access.memberships.filter((m) => m.member.status === "active").length;
  return (
    <CenteredCard testID="paused-access">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <PauseCircle size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        {WORDS[why].title}
      </T>
      <T tone="muted" style={styles.center}>
        {WORDS[why].text(email ?? "", branchName)}
      </T>
      <View style={styles.buttons}>
        {others > 0 ? (
          <Button size="lg" onPress={() => access.choose(null)}>
            Choose another center
          </Button>
        ) : null}
        <Button size="lg" variant="outline" onPress={() => void access.refresh()}>
          Check again
        </Button>
        <Button variant="ghost" onPress={() => void signOut()}>
          Sign out
        </Button>
      </View>
      <DeleteAccountLink centerName={branchName} />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
