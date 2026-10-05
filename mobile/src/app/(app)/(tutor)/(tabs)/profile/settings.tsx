import { APP_URL } from "@shared/brand";
import { router } from "expo-router";
import { ExternalLink, KeyRound, Trash2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { GoogleMark } from "@/components/GoogleMark";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { appVersion } from "@/lib/device";
import { env } from "@/lib/env";
import { openUrl } from "@/lib/links";
import { type AppearancePref, useAppearance } from "@/state/AppearanceProvider";
import { useAuth } from "@/state/AuthProvider";
import { space, useColors } from "@/theme";

const APPEARANCE: { value: AppearancePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Settings: the app's appearance, how the account signs in (and its password), the privacy policy, the version, and
 * deleting the account.
 */
export default function SettingsScreen() {
  const colors = useColors();
  const { pref, setPref } = useAppearance();
  const { methods, email } = useAuth();
  const built = [env.buildCommit && `commit ${env.buildCommit.slice(0, 7)}`, env.builtAt && `built ${env.builtAt}`].filter(Boolean).join(", ");
  return (
    <Screen testID="settings-screen">
      <ListSection title="Appearance" footer="System follows your phone’s light or dark setting.">
        <View style={styles.segment}>
          <SegmentedControl value={pref} options={APPEARANCE} onChange={setPref} testID="appearance" />
        </View>
      </ListSection>

      <ListSection title="Sign-in & security" footer="Your access to a center follows your email, whichever way you sign in.">
        <ListRow
          icon={<RowIcon><GoogleMark size={16} /></RowIcon>}
          title="Google"
          subtitle={methods.google ? (email ?? undefined) : "Not connected"}
          right={methods.google ? <Badge>Connected</Badge> : undefined}
          testID="settings-google"
        />
        <ListRow
          icon={<RowIcon><KeyRound size={16} color={colors.foreground} /></RowIcon>}
          title="Password"
          subtitle={methods.password ? "You can sign in with your email and password." : "Add one to sign in without Google."}
          right={<T tone="muted">{methods.password ? "Change" : "Add"}</T>}
          onPress={() => router.push("/profile/password")}
          accessibilityLabel={methods.password ? "Change password" : "Add a password"}
          testID="settings-password"
        />
      </ListSection>

      <ListSection title="About">
        <ListRow title="Privacy policy" right={<ExternalLink size={16} color={colors.mutedForeground} />} chevron={false} onPress={() => void openUrl(`${APP_URL}/privacy`)} testID="settings-privacy" />
        <ListRow title="Version" subtitle={built || undefined} right={<T tone="muted" style={styles.nums}>{appVersion()}</T>} testID="settings-version" />
        {env.useEmulators ? (
          <ListRow title="Data" subtitle="The local emulators, not the real centers." right={<Badge tone="warning">Practice copy</Badge>} testID="settings-practice" />
        ) : null}
      </ListSection>

      <ListSection footer="Removes your sign-in and your personal profile. Your center keeps its own records of your work.">
        <ListRow
          icon={
            <RowIcon color={colors.destructiveTint}>
              <Trash2 size={16} color={colors.destructive} />
            </RowIcon>
          }
          title="Delete my account"
          destructive
          onPress={() => router.push("/profile/delete-account")}
          testID="settings-delete-account"
        />
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { padding: space.md },
  nums: { fontVariant: ["tabular-nums"] },
});
