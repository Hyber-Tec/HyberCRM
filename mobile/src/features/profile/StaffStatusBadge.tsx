import { STAFF_STATUS_LABELS } from "@shared/people";
import type { StaffStatus } from "@shared/types";
import { Badge, type BadgeTone } from "@/components/Badge";

const TONE: Record<StaffStatus, BadgeTone> = { active: "success", on_hold: "warning", finished: "secondary" };

/** The employee's status (Active, On Hold, Finished), as on the website's profile. */
export function StaffStatusBadge({ status }: { status: StaffStatus | null | undefined }) {
  if (!status) return null;
  return (
    <Badge tone={TONE[status] ?? "secondary"} style={{ alignSelf: "center" }}>
      {STAFF_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
