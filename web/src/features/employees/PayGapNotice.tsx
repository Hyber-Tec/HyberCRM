import { LuBadgeDollarSign } from 'react-icons/lu'
import { Link } from 'react-router'
import { useBranch } from '@/branch/BranchProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { type PayGap, gapLabel } from './payGaps'

const AMBER = 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'

/**
 * Says who has no pay rate yet (their worked time is priced at $0), with a link
 * to Pay Rates unless the page already is Pay Rates.
 */
export function PayGapNotice({ gaps, link = true, className }: { gaps: PayGap[]; link?: boolean; className?: string }) {
  const { branchId } = useBranch()
  if (!gaps.length) return null
  const one = gaps.length === 1
  return (
    <Alert className={cn(AMBER, className)} data-testid="pay-gap-notice">
      <LuBadgeDollarSign />
      <AlertTitle>{one ? `${gaps[0].staff.name} has no pay rate yet` : `${gaps.length} employees have no pay rate yet`}</AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        <p>
          {one ? `${gapLabel(gaps[0])}, so their worked time is paid $0 until it’s set.` : `Their worked time is paid $0 until it’s set: ${gaps.map((g) => `${g.staff.name} (${gapLabel(g).toLowerCase()})`).join(', ')}.`}
          {link ? (
            <>
              {' '}
              <Link to={`/${branchId}/admin/employees/pay-rates`} className="font-medium underline underline-offset-2">
                Set rates
              </Link>
            </>
          ) : null}
        </p>
      </AlertDescription>
    </Alert>
  )
}

/** The same notice for one employee's own page or payroll report. */
export function RateMissingNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Alert className={cn(AMBER, className)} data-testid="rate-missing">
      <LuBadgeDollarSign />
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        <p>{children}</p>
      </AlertDescription>
    </Alert>
  )
}
