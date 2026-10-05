import type { Subject } from "@shared/types";
import { useMemo, useState } from "react";
import { useSubjectCatalog } from "@/features/data/hooks";
import { errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { setMySubject } from "./api";

export const UNCATEGORIZED = "uncategorized";

export interface SubjectGroup {
  id: string;
  name: string;
  subjects: (Subject & { id: string })[];
}

/**
 * The branch's subjects by category (in their order, "Uncategorized" last, as the website groups them) and the ones
 * the tutor teaches. A switch shows its new state at once while the save goes through, and goes back if it fails.
 */
export function useMySubjects() {
  const { branchId, actor, staffId, staff } = useBranch();
  const { subjects, categories, loading } = useSubjectCatalog();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const groups = useMemo((): SubjectGroup[] => {
    const known = new Set(categories.map((c) => c.id));
    return [...categories.map((c) => ({ id: c.id, name: c.name })), { id: UNCATEGORIZED, name: "Uncategorized" }]
      .map((g) => ({ ...g, subjects: subjects.filter((s) => (g.id === UNCATEGORIZED ? !known.has(s.categoryId) : s.categoryId === g.id)) }))
      .filter((g) => g.subjects.length > 0);
  }, [subjects, categories]);

  const saved = useMemo(() => new Set(staff?.subjectIds ?? []), [staff?.subjectIds]);
  const teaches = (id: string) => pending[id] ?? saved.has(id);

  const toggle = async (subject: { id: string; name: string }, on: boolean) => {
    if (!staffId) return;
    setPending((p) => ({ ...p, [subject.id]: on }));
    try {
      await setMySubject(branchId, actor, staffId, staff?.name || actor.name, subject, on);
    } catch (e) {
      toast.error(`Couldn’t ${on ? "add" : "remove"} ${subject.name}`, { description: errorMessage(e) });
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[subject.id];
        return next;
      });
    }
  };

  const count = subjects.filter((s) => teaches(s.id)).length;
  return { groups, loading, teaches, toggle, count };
}
