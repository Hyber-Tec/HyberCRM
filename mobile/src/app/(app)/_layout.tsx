import { Stack } from "expo-router";
import { Loading } from "@/components/Loading";
import { AccessProvider, useAccess } from "@/state/AccessProvider";
import { BranchProvider, useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";
import { PausedAccess } from "@/features/access/PausedAccess";

/**
 * The signed-in app. Which center it shows comes first (AccessProvider): none yet, a choice among several, or one.
 * Then the portal of the person's one role: tutors get their tabs; admins, parents and students are told their
 * portal comes to the app soon, with a way to the website meanwhile.
 */
export default function AppLayout() {
  return (
    <AccessProvider>
      <AccessGate />
    </AccessProvider>
  );
}

function AccessGate() {
  const access = useAccess();
  if (access.loading) return <Loading label="Opening your center" />;
  const active = access.memberships.filter((m) => m.member.status === "active");
  if (!access.current) return <PickStack gate={active.length > 0 ? "choose" : "none"} />;
  return (
    <BranchProvider membership={access.current} fallback={<Loading label="Opening your center" />} paused={(name, why) => <PausedAccess branchName={name} why={why} />}>
      <PortalStack />
    </BranchProvider>
  );
}

function PickStack({ gate }: { gate: "choose" | "none" }) {
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={gate === "choose"}>
        <Stack.Screen name="choose-branch" />
      </Stack.Protected>
      <Stack.Protected guard={gate === "none"}>
        <Stack.Screen name="no-access" />
      </Stack.Protected>
    </Stack>
  );
}

function PortalStack() {
  const { portal } = useBranch();
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={portal === "tutor"}>
        <Stack.Screen name="(tutor)" />
      </Stack.Protected>
      <Stack.Protected guard={portal !== "tutor"}>
        <Stack.Screen name="coming-soon" />
      </Stack.Protected>
    </Stack>
  );
}
