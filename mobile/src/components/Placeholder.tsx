import { Construction } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { useColors } from "@/theme";

/** A screen still being built (development only). */
export function Placeholder({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Screen>
      <EmptyState icon={<Construction size={26} color={colors.mutedForeground} />} title={title} text="This screen is being built." />
    </Screen>
  );
}
