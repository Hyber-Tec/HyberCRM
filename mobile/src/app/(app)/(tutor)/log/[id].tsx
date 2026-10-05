import { useLocalSearchParams } from "expo-router";
import { LogScreen } from "@/features/logs/LogScreen";

/**
 * Writing a session log, full screen over the tabs: the six-step form for a new log or a draft, and for a submitted
 * log the same form as an explicit edit ("Edit log"), when the branch allows it. Loaded by the session's ID.
 */
export default function LogRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LogScreen sessionId={id ?? ""} />;
}
