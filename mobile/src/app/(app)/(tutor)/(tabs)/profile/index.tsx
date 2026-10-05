import { ROLE_LABELS } from "@shared/roles";
import { router } from "expo-router";
import { ArrowLeftRight, Bell, BookOpen, LogOut, Settings, UserRound, Wallet } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { StaffStatusBadge } from "@/features/profile/StaffStatusBadge";
import { toast } from "@/lib/toast";
import { useAccess } from "@/state/AccessProvider";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * The tutor's Profile (True Education's mobile Profile, made native): who they are at this center, then their
 * account, subjects, pay, notifications and settings, switching centers when they belong to several, and signing out.
 */
export default function ProfileScreen() {
  const colors = useColors();
  const { name: branchName, staff, actor, member, role } = useBranch();
  const { user, email, signOut } = useAuth();
  const access = useAccess();
  const others = access.memberships.filter((m) => m.member.status === "active").length > 1;
  const staffName = staff?.name || actor.name;
  const subjects = staff?.subjectIds?.length ?? 0;
  const icon = (Icon: typeof UserRound) => (
    <RowIcon>
      <Icon size={17} color={colors.foreground} />
    </RowIcon>
  );

  const askSignOut = async () => {
    if (!(await confirmAsync({ title: "Sign out?", message: `You’ll need to sign in again to see ${branchName} on this phone.`, confirmLabel: "Sign out", destructive: true }))) return;
    try {
      await signOut();
    } catch {
      toast.error("Couldn’t sign out. Try again.");
    }
  };

  return (
    <Screen testID="profile-screen">
      <Card style={styles.header} testID="profile-card">
        <Avatar name={staffName} url={user?.photoURL ?? member.photoURL} size={64} color={staff?.color} />
        <View style={styles.who}>
          <T variant="heading" numberOfLines={1}>
            {staffName}
          </T>
          <T variant="small" tone="muted" numberOfLines={1}>
            {email}
          </T>
          <T variant="small" tone="muted" numberOfLines={1}>
            {ROLE_LABELS[role]} · {branchName}
          </T>
        </View>
        <StaffStatusBadge status={staff?.status} />
      </Card>

      <ListSection>
        <ListRow icon={icon(UserRound)} title="Account details" onPress={() => router.push("/profile/account")} testID="profile-account" />
        <ListRow
          icon={icon(BookOpen)}
          title="My subjects"
          right={subjects ? String(subjects) : undefined}
          onPress={() => router.push("/profile/subjects")}
          testID="profile-subjects"
          accessibilityLabel={`My subjects, ${subjects} selected`}
        />
        <ListRow icon={icon(Wallet)} title="Payroll history" onPress={() => router.push("/profile/payroll")} testID="profile-payroll" />
      </ListSection>

      <ListSection>
        <ListRow icon={icon(Bell)} title="Notifications" onPress={() => router.push("/profile/notifications")} testID="profile-notifications" />
        <ListRow icon={icon(Settings)} title="Settings" onPress={() => router.push("/profile/settings")} testID="profile-settings" />
      </ListSection>

      {others ? (
        <ListSection footer={`You’re in ${branchName}. Pick another center you belong to.`}>
          <ListRow icon={icon(ArrowLeftRight)} title="Switch center" onPress={() => access.choose(null)} testID="profile-switch-center" />
        </ListSection>
      ) : null}

      <ListSection>
        <ListRow
          icon={
            <RowIcon color={colors.destructiveTint}>
              <LogOut size={17} color={colors.destructive} />
            </RowIcon>
          }
          title="Sign out"
          destructive
          onPress={() => void askSignOut()}
          chevron={false}
          testID="profile-sign-out"
        />
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.lg },
  who: { flex: 1, gap: 2 },
});
