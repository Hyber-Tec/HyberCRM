import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useMemo } from 'react'
import { LuArrowLeft, LuDownload, LuPencil } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { COL, branchColPath } from '@shared/paths'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/firebase'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { ReportDocument } from './ReportDocument'
import { type AnyReport, isV2, reportName } from './model'

/**
 * `/{branch}/progress-report/{id}`: the report as families see it, ready to
 * print or save as PDF. Families get only Back and Download PDF; staff also get
 * the editor. Opening a shared report records the family's first view.
 */
export function ProgressReportPage() {
  const { reportId = '' } = useParams()
  const navigate = useNavigate()
  const { branchId, branch, timezone, isAdmin, role, actor } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.progressReports, reportId), [branchId, reportId])
  const { data: r, loading, error } = useDoc<AnyReport>(ref)
  const family = role === 'parent' || role === 'student'
  const staff = isAdmin || role === 'tutor'

  useEffect(() => {
    if (r && isV2(r)) document.title = `${r.student.name} – Progress report – ${r.period.label}`
  }, [r])

  // The family's view receipt (write-once; later opens are refused quietly).
  useEffect(() => {
    if (!r || !family || !r.sharedWithParents) return
    const key = `hyber.reportView.${branchId}.${reportId}.${actor.email}`
    try {
      if (localStorage.getItem(key)) return
    } catch {
      /* private mode */
    }
    void setDoc(doc(db, `${branchColPath(branchId, COL.progressReports)}/${reportId}/views/${actor.email.toLowerCase()}`), {
      viewedAt: serverTimestamp(),
      role,
    })
      .catch(() => undefined)
      .finally(() => {
        try {
          localStorage.setItem(key, '1')
        } catch {
          /* private mode */
        }
      })
  }, [r, family, branchId, reportId, actor.email, role])

  const back = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/${branchId}/${family ? (role === 'parent' ? 'parent/progress-reports' : 'student/home') : `${isAdmin ? 'admin' : 'tutor'}/sessions/progress-reports`}`)
  }

  if (loading) return <FullPageSpinner label="Loading the report…" />
  if (!r || error) {
    return <FullPageMessage title="Report not available" description="It may have been deleted, or it isn’t shared with you." actions={[{ label: 'Go back', onClick: back }]} />
  }
  if (!isV2(r)) {
    return (
      <FullPageMessage
        title="This report needs updating"
        description="It was made with an earlier version of the app. Ask the center to prepare a new one."
        actions={[{ label: 'Go back', onClick: back }]}
      />
    )
  }

  return (
    <div className="report-canvas min-h-svh pb-10 print:pb-0">
      <div className="sticky top-0 z-30 border-b border-black/5 bg-[#efeee9]/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[816px] items-center gap-2 px-3 py-2.5 sm:px-0">
          <Button variant="ghost" size="sm" onClick={back} className="text-[#0b0b0b] hover:bg-black/5">
            <LuArrowLeft /> Back
          </Button>
          <div className="min-w-0 flex-1 truncate text-center text-sm font-medium text-[#52514e]">{reportName(r)}</div>
          {staff ? (
            <Button variant="ghost" size="sm" className="text-[#0b0b0b] hover:bg-black/5" onClick={() => navigate(`/${branchId}/${isAdmin ? 'admin' : 'tutor'}/sessions/progress-reports/${reportId}`)}>
              <LuPencil /> Edit
            </Button>
          ) : null}
          <Button size="sm" onClick={() => window.print()} className="bg-[#0b0b0b] text-white hover:bg-[#0b0b0b]/90">
            <LuDownload /> Download PDF
          </Button>
        </div>
      </div>
      {staff && r.status === 'draft' ? (
        <div className="mx-auto mt-4 max-w-[816px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
          This is a draft. Families can’t see it until an admin shares it.
        </div>
      ) : null}
      <main className="mt-4 sm:mt-8 sm:px-4 print:m-0 print:p-0">
        <ReportDocument report={r} audience="family" timezone={timezone} logoUrl={branch.branding?.logoUrl ?? null} />
      </main>
    </div>
  )
}
