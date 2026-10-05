import { Stack, useLocalSearchParams } from "expo-router";
import { BookOpen } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { useMySubjects } from "@/features/profile/subjects";
import { SwitchRow } from "@/features/profile/SwitchRow";
import { useColors } from "@/theme";

/** One category's subjects, each with a switch (saved at once, with an audit entry, as on the website). */
export default function SubjectCategoryScreen() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  const colors = useColors();
  const { groups, loading, teaches, toggle } = useMySubjects();
  const group = groups.find((g) => g.id === category) ?? null;
  const mine = group ? group.subjects.filter((s) => teaches(s.id)).length : 0;
  return (
    <Screen testID="subject-category-screen">
      <Stack.Screen options={{ title: group?.name ?? "Subjects" }} />
      {loading ? (
        <SkeletonCards count={5} height={52} />
      ) : !group ? (
        <EmptyState icon={<BookOpen size={26} color={colors.mutedForeground} />} title="This category isn’t there anymore" text="Go back to see your center’s subjects." />
      ) : (
        <ListSection title={group.name} detail={`${mine} of ${group.subjects.length}`} footer="Your subjects tell the admin what you can teach. They never stop a session from being booked.">
          {group.subjects.map((s) => (
            <SwitchRow key={s.id} title={s.name} value={teaches(s.id)} onChange={(on) => void toggle(s, on)} testID={`subject-${s.id}`} />
          ))}
        </ListSection>
      )}
    </Screen>
  );
}
