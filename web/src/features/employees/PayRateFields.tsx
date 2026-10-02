import { LuCircleAlert } from 'react-icons/lu'
import { type RateKind, tutorsNeedAdminRate } from '@shared/pay/rates'
import { todayKey } from '@shared/time'
import type { StaffRole } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { type RateDraft, askedRates } from './rateDraft'

/**
 * The hourly-rate fields shown when an employee is created, by role and the
 * branch's pay model. People who can't see pay rates get a note instead.
 */
export function PayRateFields({ role, value, onChange, idPrefix }: { role: StaffRole; value: RateDraft; onChange: (v: RateDraft) => void; idPrefix: string }) {
  const { rules, timezone, can } = useBranch()
  const needAdmin = tutorsNeedAdminRate(rules, todayKey(timezone))
  if (!can('payRates')) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <LuCircleAlert className="mt-0.5 size-4 shrink-0" />
        Someone with access to Pay Rates needs to set their hourly rate before payroll.
      </p>
    )
  }
  const kinds = askedRates(role, needAdmin)
  const label = (k: RateKind) => (role === 'tutor' ? (k === 'teaching' ? 'Teaching rate' : 'Admin rate') : 'Hourly rate')
  const help =
    role === 'owner'
      ? 'Optional. Leave it empty if they aren’t paid by the hour.'
      : role === 'admin'
        ? 'Paid for all clocked time.'
        : needAdmin
          ? 'Teaching rate for time in logged sessions; admin rate for the rest of the shift.'
          : 'Paid for teaching time: time in sessions with a submitted log.'
  return (
    <FieldSet>
      <FieldLegend variant="label">Pay</FieldLegend>
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => (
          <Field key={k}>
            <FieldLabel htmlFor={`${idPrefix}-${k}`} className="text-xs font-normal text-muted-foreground">
              {label(k)}
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={`${idPrefix}-${k}`}
                inputMode="decimal"
                placeholder="0.00"
                value={value[k]}
                onChange={(e) => onChange({ ...value, [k]: e.target.value.replace(/[^\d.]/g, '') })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>/hr</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        ))}
      </div>
      <FieldDescription>
        {help} {role === 'owner' ? 'You can set it later on Pay Rates.' : `Required, so their time is never paid $0. You can change ${kinds.length > 1 ? 'them' : 'it'} later on Pay Rates.`}
      </FieldDescription>
    </FieldSet>
  )
}
