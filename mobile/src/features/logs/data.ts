import { collection, limit, orderBy, query, serverTimestamp, setDoc, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import type { LogAi, LogContent, SessionLog } from "@shared/sessions/logs";
import type { Session } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { branchDoc } from "@/features/data/hooks";
import { callable, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The session log's data, as the website reads and writes it (web/src/features/sessions/log/*): the log itself
 * (`sessionLogs/{sessionId}`, one per session), the student's earlier logs, drafts written straight to Firestore
 * (the rules allow only the log's own fields), and the website's callables for submitting, polishing and context.
 */

/** One session's log, live (a missing log reads as missing: the form opens before the first draft exists). */
export function useSessionLog(sessionId: string | null) {
  const { branchId } = useBranch();
  return useDoc<SessionLog>(sessionId ? `${ROOT.branches}/${branchId}/${COL.sessionLogs}/${sessionId}` : null);
}

/**
 * The student's earlier submitted logs (newest first, this session left out): everyone's when tutors may read every
 * log, otherwise the tutor's own. They feed Prepare and the suggestions in the other steps.
 */
export function usePreviousLogs(session: { id: string; studentId: string } | null) {
  const { branchId, settings, staffId } = useBranch();
  const seeAll = settings.sessionLogs.tutorsSeeAllLogs;
  const studentId = session?.studentId ?? null;
  const key = studentId && (seeAll || staffId) ? `prev-logs-${branchId}-${studentId}-${seeAll ? "all" : staffId}` : null;
  const { data, loading, error } = useQuery<SessionLog>(key, () => {
    const base = collection(db, ROOT.branches, branchId, COL.sessionLogs);
    return seeAll
      ? query(base, where("studentId", "==", studentId), orderBy("dateKey", "desc"), limit(60))
      : query(base, where("studentId", "==", studentId), where("tutorId", "==", staffId), orderBy("dateKey", "desc"), limit(60));
  });
  const sessionId = session?.id;
  const logs = useMemo(
    () => data.filter((l) => l.id !== sessionId && l.status === "submitted").sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin),
    [data, sessionId],
  );
  return { logs, loading: loading && !error };
}

export interface ConferenceNoteContext {
  date: string;
  text: string;
  authorName: string;
}

const contextCallable = callable<{ branchId: string; sessionId: string }, { conferenceNote: ConferenceNoteContext | null }>("sessionLogContext");

/**
 * The student's latest parent conference note, which tutors can't read directly: the session's tutor gets it from
 * the server when the branch holds conferences (`sessionLogContext`). Null otherwise or when it can't be had.
 */
export function useConferenceNote(sessionId: string | null): ConferenceNoteContext | null {
  const { branchId, rules } = useBranch();
  const [note, setNote] = useState<{ sessionId: string; note: ConferenceNoteContext | null } | null>(null);
  const enabled = rules.conferences.enabled && !!sessionId;
  useEffect(() => {
    if (!enabled || !sessionId) return;
    let live = true;
    contextCallable({ branchId, sessionId })
      .then((r) => live && setNote({ sessionId, note: r.conferenceNote }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [branchId, sessionId, enabled]);
  return enabled && note?.sessionId === sessionId ? note.note : null;
}

/**
 * Saves the log as a draft (before the first submit only): the log's own fields plus the session's snapshot, merged
 * into the doc, exactly what the website writes and the rules accept. A trigger mirrors `logStatus: 'draft'` onto
 * the session.
 */
export async function writeDraft(branchId: string, session: Session & { id: string }, content: LogContent, actorEmail: string): Promise<void> {
  await setDoc(
    branchDoc(branchId, COL.sessionLogs, session.id),
    {
      sessionId: session.id,
      ...content,
      status: "draft",
      tutorId: session.tutorId,
      tutorName: session.tutorName,
      studentId: session.studentId,
      studentName: session.studentName,
      subject: session.subject,
      subjectId: session.subjectId ?? null,
      dateKey: session.dateKey,
      startMin: session.startMin,
      endMin: session.endMin,
      updatedAt: serverTimestamp(),
      updatedBy: actorEmail,
    },
    { merge: true },
  );
}

/** Submits (or re-submits) the log on the server: validation, AI notes, attendance, hours and the audit entry. */
export const submitSessionLog = callable<{ branchId: string; sessionId: string; content: LogContent }, { ok: boolean; ai?: LogAi; usedHours?: number }>("submitSessionLog");

/** "Polish notes": the four notes rewritten for grammar and clarity, or the same text back when AI isn't available. */
export const polishNotes = callable<{ branchId: string; mode: "polish"; payload: Record<string, string> }, Record<string, string | undefined>>("sessionAi");

/**
 * Why a submit was refused, in the server's own words (the website shows them too: a missing field, the start time,
 * a canceled session); a dropped connection or anything unexpected gets the app's usual line.
 */
export function submitErrorText(e: unknown): string {
  return errorMessage(e, "Save failed. Please try again.");
}
