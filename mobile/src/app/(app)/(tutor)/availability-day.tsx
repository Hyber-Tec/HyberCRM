import { isDateKey } from "@shared/time";
import { useLocalSearchParams } from "expo-router";
import { CalendarX } from "lucide-react-native";
import { View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { DayEditor, REPEAT_WEEKS } from "@/features/availability/DayEditor";
import { useColors } from "@/theme";

/**
 * A day's availability, as a sheet over the calendar: `/availability-day?date=YYYY-MM-DD`, with `&repeat=4` when it
 * comes from Repeat weekly (the repeat is then already set).
 */
export default function AvailabilityDayScreen() {
  const { date, repeat } = useLocalSearchParams<{ date?: string; repeat?: string }>();
  const weeks = (REPEAT_WEEKS as readonly number[]).includes(Number(repeat)) ? Number(repeat) : 0;
  const colors = useColors();
  if (!isDateKey(date)) {
    return (
      <View testID="availability-day">
        <EmptyState icon={<CalendarX size={26} color={colors.mutedForeground} />} title="This day couldn’t be opened" text="Go back to your availability and pick a day." />
      </View>
    );
  }
  return <DayEditor key={date} date={date} repeatWeeks={weeks} />;
}
