import { COL, ROOT } from "@shared/paths";
import { type Portal, type Role, portalOf } from "@shared/roles";
import { type BusinessRules, resolveBusinessRules } from "@shared/settings/businessRules";
import type { BranchSettings } from "@shared/settings/defaults";
import { resolveSettings } from "@shared/settings/resolve";
import type { Branch, Member, Staff } from "@shared/types";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useDoc } from "@/lib/firestore";
import { useAuth } from "./AuthProvider";
import type { Membership } from "./AccessProvider";

/** Who does something, as the audit log records it (web/src/lib/audit.ts). */
export interface Actor {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

export interface BranchState {
  branchId: string;
  branch: Branch & { id: string };
  /** The branch's name and logo as everyone sees them (public profile). */
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  settings: BranchSettings;
  /** Core rules the Super Admin sets (pay model, students per tutor, conferences). */
  rules: BusinessRules;
  timezone: string;
  member: Member & { id: string };
  role: Role;
  portal: Portal;
  /** Tutors and admins: their employee record. */
  staffId: string | null;
  staff: (Staff & { id: string }) | null;
  /** Student: their own record. Parent: their children. */
  studentId: string | null;
  studentIds: string[];
  actor: Actor;
}

const BranchContext = createContext<BranchState | null>(null);

/**
 * The branch the app shows, kept live: its settings and rules, the person's member doc (a paused access closes the
 * app at once) and, for employees, their staff record. Children render only once all of it is known.
 */
export function BranchProvider({
  membership,
  children,
  fallback,
  paused,
}: {
  membership: Membership;
  children: ReactNode;
  fallback: ReactNode;
  /** The person can't use this center now: their access was paused or removed, or the center isn't open. */
  paused: (name: string, why: "paused" | "removed" | "unavailable") => ReactNode;
}) {
  const { user, email } = useAuth();
  const { branchId } = membership;
  const branchState = useDoc<Branch>(`${ROOT.branches}/${branchId}`);
  const memberState = useDoc<Member>(email ? `${ROOT.branches}/${branchId}/${COL.members}/${email}` : null);
  const staffId = memberState.data?.staffId ?? membership.member.staffId ?? null;
  const staffState = useDoc<Staff>(staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}` : null);

  const value = useMemo<BranchState | null>(() => {
    const branch = branchState.data;
    const member = memberState.data;
    if (!branch || !member || !user || !email || member.status !== "active") return null;
    return {
      branchId,
      branch,
      name: membership.profile?.name ?? branch.name,
      logoUrl: membership.profile?.logoUrl ?? branch.branding?.logoUrl ?? null,
      accentColor: membership.profile?.accentColor ?? branch.branding?.accentColor ?? null,
      settings: resolveSettings(branch.settings),
      rules: resolveBusinessRules(branch.businessRules),
      timezone: branch.timezone || "America/New_York",
      member,
      role: member.role,
      portal: portalOf(member.role),
      staffId: member.staffId ?? null,
      staff: staffState.data,
      studentId: member.studentId ?? null,
      studentIds: member.studentIds ?? [],
      actor: { uid: user.uid, email, name: member.displayName || user.displayName || email, role: member.role },
    };
  }, [branchState.data, memberState.data, staffState.data, user, email, branchId, membership.profile]);

  const name = membership.profile?.name ?? branchId;
  if (memberState.data && memberState.data.status !== "active") return paused(name, "paused");
  // The server says the member doc is gone: an admin removed this person's access while the app was open.
  if (!memberState.loading && !memberState.data && !memberState.error) return paused(name, "removed");
  // A suspended or archived center is closed to its members by the rules.
  if (branchState.error) return paused(name, "unavailable");
  if (!value || (staffId && staffState.loading)) return fallback;
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}
