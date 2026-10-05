import { useLocalSearchParams } from "expo-router";
import { LogScreen } from "@/features/logs/LogScreen";

/** A session log, read-only (a sheet): the tutor's own or, when the branch allows it, another tutor's. */
export default function LogViewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LogScreen sessionId={id ?? ""} readOnly />;
}
