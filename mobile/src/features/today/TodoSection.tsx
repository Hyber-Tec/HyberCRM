import { CalendarClock, CheckCheck, Megaphone, NotebookPen, TriangleAlert } from "lucide-react-native";
import { useState, type ReactElement } from "react";
import { studentLabel } from "@shared/people";
import { type Conflict, tutorConflictText } from "@shared/schedule/conflicts";
import type { DateKey } from "@shared/time";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import type { SessionDoc } from "@/features/schedule/data";
import { dayWords } from "@/features/schedule/DaySection";
import { clock, listWords, plural, shortDay } from "@/features/schedule/format";
import { useColors } from "@/theme";

/** Rows of one kind shown before "Show all". */
const FIRST = 3;

/**
 * What the tutor should do, most pressing first: sessions waiting for the admin (in conflict), session logs to write,
 * days of availability still to set inside the notice window, and unread news. When there's nothing: all caught up.
 */
export function TodoSection({
  conflicts,
  logs,
  availabilityDays,
  leadDays,
  unread,
  newestUnread,
  today,
  hour12,
  onOpenSession,
  onWriteLog,
  onAvailability,
  onNews,
}: {
  conflicts: { session: SessionDoc; conflicts: Conflict[] }[];
  logs: SessionDoc[];
  availabilityDays: DateKey[];
  leadDays: number;
  unread: number;
  newestUnread: string | null;
  today: DateKey;
  hour12: boolean;
  onOpenSession: (s: SessionDoc) => void;
  onWriteLog: (s: SessionDoc) => void;
  onAvailability: () => void;
  onNews: () => void;
}) {
  const colors = useColors();
  const [allConflicts, setAllConflicts] = useState(false);
  const [allLogs, setAllLogs] = useState(false);
  const when = (s: SessionDoc) => {
    const w = dayWords(s.dateKey, today);
    return `${w.relative ? w.primary : shortDay(s.dateKey)}, ${clock(s.startMin, hour12)}`;
  };
  const count = conflicts.length + logs.length + (availabilityDays.length ? 1 : 0) + (unread ? 1 : 0);

  const rows: ReactElement[] = [];
  for (const { session: s, conflicts: c } of allConflicts ? conflicts : conflicts.slice(0, FIRST)) {
    rows.push(
      <ListRow
        key={`c-${s.id}`}
        testID={`todo-conflict-${s.id}`}
        icon={
          <RowIcon color={colors.destructiveTint}>
            <TriangleAlert size={17} color={colors.destructive} />
          </RowIcon>
        }
        title={`${studentLabel(s.studentName, s.studentGrade)} · ${when(s)}`}
        subtitle={tutorConflictText(c) ?? undefined}
        onPress={() => onOpenSession(s)}
        accessibilityLabel={`Not confirmed: ${s.studentName}, ${when(s)}. ${tutorConflictText(c) ?? ""}`}
      />,
    );
  }
  if (conflicts.length > FIRST) {
    rows.push(<ListRow key="c-more" testID="todo-conflicts-more" title={allConflicts ? "Show fewer" : `Show all ${conflicts.length} waiting for the admin`} onPress={() => setAllConflicts(!allConflicts)} chevron={false} />);
  }
  for (const s of allLogs ? logs : logs.slice(0, FIRST)) {
    rows.push(
      <ListRow
        key={`l-${s.id}`}
        testID={`todo-log-${s.id}`}
        icon={
          <RowIcon color={colors.warningTint}>
            <NotebookPen size={17} color={colors.warning} />
          </RowIcon>
        }
        title={studentLabel(s.studentName, s.studentGrade)}
        subtitle={`Session log to write · ${when(s)}${s.subject ? ` · ${s.subject}` : ""}`}
        onPress={() => onWriteLog(s)}
        accessibilityLabel={`Write the session log for ${s.studentName}, ${when(s)}`}
      />,
    );
  }
  if (logs.length > FIRST) {
    rows.push(<ListRow key="l-more" testID="todo-logs-more" title={allLogs ? "Show fewer" : `Show all ${logs.length} logs to write`} onPress={() => setAllLogs(!allLogs)} chevron={false} />);
  }
  if (availabilityDays.length) {
    const shown = availabilityDays.slice(0, 2).map(shortDay);
    const more = availabilityDays.length - shown.length;
    rows.push(
      <ListRow
        key="availability"
        testID="todo-availability"
        icon={
          <RowIcon color={colors.infoTint}>
            <CalendarClock size={17} color={colors.info} />
          </RowIcon>
        }
        title={`Set your availability for ${plural(availabilityDays.length, "day")}`}
        subtitle={`${more > 0 ? `${shown.join(", ")} and ${plural(more, "more day")}` : listWords(shown)} · needed ${leadDays} days ahead`}
        onPress={onAvailability}
      />,
    );
  }
  if (unread) {
    rows.push(
      <ListRow
        key="news"
        testID="todo-news"
        icon={
          <RowIcon>
            <Megaphone size={17} color={colors.foreground} />
          </RowIcon>
        }
        title={`${plural(unread, "unread post")} in News`}
        subtitle={newestUnread ?? undefined}
        onPress={onNews}
      />,
    );
  }
  if (!rows.length) {
    rows.push(
      <ListRow
        key="done"
        testID="todo-caught-up"
        icon={
          <RowIcon color={colors.successTint}>
            <CheckCheck size={17} color={colors.success} />
          </RowIcon>
        }
        title="You’re all caught up"
        subtitle="No session logs to write and nothing waiting for you."
      />,
    );
  }

  return (
    <ListSection title="To do" detail={count ? String(count) : undefined} testID="today-todo">
      {rows}
    </ListSection>
  );
}
