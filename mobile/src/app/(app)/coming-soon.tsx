import { PORTAL_LABELS } from "@shared/roles";
import { Sparkles } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { T } from "@/components/Text";
import { openWebsite } from "@/lib/links";
import { useAccess } from "@/state/AccessProvider";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * Admins, parents and students: their portal comes to the app in a later round (the tutor portal is first). Until
 * then the website works on the phone too.
 */
export default function ComingSoonScreen() {
  const { signOut, email } = useAuth();
  const access = useAccess();
  const { portal, name, branchId } = useBranch();
  const colors = useColors();
  const several = access.memberships.filter((m) => m.member.status === "active").length > 1;
  return (
    <CenteredCard testID="coming-soon">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <Sparkles size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        The {PORTAL_LABELS[portal]} is coming to the app
      </T>
      <T tone="muted" style={styles.center}>
        {name} on Hyber CRM works on this phone&apos;s browser in the meantime. Sign in there with {email}.
      </T>
      <View style={styles.buttons}>
        <Button size="lg" onPress={() => void openWebsite(`/${branchId}`)}>
          Open {name} on the website
        </Button>
        {several ? (
          <Button size="lg" variant="outline" onPress={() => access.choose(null)}>
            Choose another center
          </Button>
        ) : null}
        <Button variant="ghost" onPress={() => void signOut()}>
          Sign out
        </Button>
      </View>
      <DeleteAccountLink centerName={name} />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
