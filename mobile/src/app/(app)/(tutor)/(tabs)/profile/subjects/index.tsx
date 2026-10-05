import { router, Stack } from "expo-router";
import { BookOpen } from "lucide-react-native";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useMySubjects } from "@/features/profile/subjects";
import { SwitchRow } from "@/features/profile/SwitchRow";
import { useColors } from "@/theme";

/**
 * My subjects (True Education's two-level list): the categories with how many of their subjects the tutor teaches,
 * each opening its subjects; the search finds subjects in every category and switches them right there.
 */
export default function SubjectsScreen() {
  const colors = useColors();
  const { groups, loading, teaches, toggle, count } = useMySubjects();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const found = q ? groups.flatMap((g) => g.subjects.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ ...s, group: g.name }))) : [];

  return (
    <Screen testID="subjects-screen">
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Search subjects",
            hideWhenScrolling: false,
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            onCancelButtonPress: () => setSearch(""),
          },
        }}
      />
      {loading ? (
        <SkeletonCards count={4} height={52} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} color={colors.mutedForeground} />} title="No subjects yet" text="Your center hasn’t added its subjects yet." />
      ) : q ? (
        found.length ? (
          <ListSection title="Subjects" detail={`${found.length}`}>
            {found.map((s) => (
              <SwitchRow key={s.id} title={s.name} subtitle={s.group} value={teaches(s.id)} onChange={(on) => void toggle(s, on)} testID={`subject-${s.id}`} />
            ))}
          </ListSection>
        ) : (
          <EmptyState title="No subjects match" text={`Nothing called “${search.trim()}”.`} />
        )
      ) : (
        <>
          <T tone="muted" style={{ paddingHorizontal: 4 }} testID="subjects-count">
            {count ? `You teach ${count} subject${count === 1 ? "" : "s"}. Tap a category to change them.` : "Pick the subjects you can teach. Tap a category to start."}
          </T>
          <ListSection>
            {groups.map((g) => {
              const mine = g.subjects.filter((s) => teaches(s.id)).length;
              return (
                <ListRow
                  key={g.id}
                  title={g.name}
                  right={<T tone={mine ? "default" : "muted"} style={{ fontVariant: ["tabular-nums"] }}>{`${mine} of ${g.subjects.length}`}</T>}
                  onPress={() => router.push({ pathname: "/profile/subjects/[category]", params: { category: g.id } })}
                  accessibilityLabel={`${g.name}, ${mine} of ${g.subjects.length} subjects`}
                  testID={`category-${g.id}`}
                />
              );
            })}
          </ListSection>
        </>
      )}
    </Screen>
  );
}
