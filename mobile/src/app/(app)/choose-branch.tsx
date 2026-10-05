import { ROLE_LABELS } from "@shared/roles";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { ListRow, ListSection } from "@/components/List";
import { Logo } from "@/components/Logo";
import { T } from "@/components/Text";
import { useAccess } from "@/state/AccessProvider";
import { useAuth } from "@/state/AuthProvider";
import { radius, space } from "@/theme";

/** Several centers for this email: pick one (remembered on this phone; Profile → Switch center changes it). */
export default function ChooseBranchScreen() {
  const { email, signOut } = useAuth();
  const access = useAccess();
  return (
    <CenteredCard testID="choose-branch">
      <View style={styles.head}>
        <Logo size={48} />
        <T variant="title">Choose a center</T>
        <T tone="muted" style={styles.center}>
          Signed in as {email}
        </T>
      </View>
      <ListSection>
        {access.memberships.map((m) => {
          const name = m.profile?.name ?? m.branchId;
          const paused = m.member.status !== "active";
          return (
            <ListRow
              key={m.branchId}
              icon={m.profile?.logoUrl ? <Image source={{ uri: m.profile.logoUrl }} style={styles.logo} contentFit="contain" /> : <Avatar name={name} size={40} color={m.profile?.accentColor} />}
              title={name}
              subtitle={paused ? "Access paused" : ROLE_LABELS[m.member.role]}
              onPress={paused ? undefined : () => access.choose(m.branchId)}
              testID={`branch-${m.branchId}`}
            />
          );
        })}
      </ListSection>
      <Button variant="ghost" onPress={() => void signOut()}>
        Sign out
      </Button>
      <DeleteAccountLink />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  logo: { width: 40, height: 40, borderRadius: radius.md },
});
