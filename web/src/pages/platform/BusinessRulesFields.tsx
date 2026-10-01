import { MAX_STUDENTS_PER_TUTOR_LIMIT, PAY_MODELS, PAY_MODEL_HELP, PAY_MODEL_LABELS, type PayModel } from '@shared/settings/businessRules'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet, FieldLegend, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** The capacity and conference rules (the pay model has its own control). */
export interface CapacityAndConferences {
  maxStudentsPerTutor: number
  conferencesEnabled: boolean
  everyHours: string
}

/** Pay model cards: Teaching only (the default) or Teaching + Admin. */
export function PayModelChoice({ value, onChange, idPrefix }: { value: PayModel; onChange: (m: PayModel) => void; idPrefix: string }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as PayModel)} className="grid gap-2 sm:grid-cols-2">
      {PAY_MODELS.map((m) => (
        <FieldLabel key={m} htmlFor={`${idPrefix}-${m}`} className="has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                {PAY_MODEL_LABELS[m]}
                {m === 'teaching_only' ? <span className="text-xs font-normal text-muted-foreground">(default)</span> : null}
              </FieldTitle>
              <FieldDescription>{PAY_MODEL_HELP[m]}</FieldDescription>
            </FieldContent>
            <RadioGroupItem value={m} id={`${idPrefix}-${m}`} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  )
}

/** Students per tutor at once and parent conferences. */
export function CapacityAndConferenceFields({
  value,
  onChange,
  idPrefix,
}: {
  value: CapacityAndConferences
  onChange: (next: CapacityAndConferences) => void
  idPrefix: string
}) {
  const set = (patch: Partial<CapacityAndConferences>) => onChange({ ...value, ...patch })
  return (
    <>
      <Field>
        <FieldLabel>Students per tutor at once</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={String(value.maxStudentsPerTutor)}
          onValueChange={(v) => v && set({ maxStudentsPerTutor: Number(v) })}
          className="justify-start"
        >
          {Array.from({ length: MAX_STUDENTS_PER_TUTOR_LIMIT }, (_, i) => i + 1).map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="w-11 tabular-nums data-[state=on]:bg-foreground data-[state=on]:text-background"
              aria-label={`${n} at once`}
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          {value.maxStudentsPerTutor === 1
            ? 'Strictly one-to-one: the schedule never gives a tutor two students at the same time.'
            : `The schedule never gives a tutor more than ${value.maxStudentsPerTutor} students at the same time.`}
        </FieldDescription>
      </Field>
      <FieldSet>
        <FieldLegend variant="label">Parent conferences</FieldLegend>
        <Field orientation="horizontal">
          <Switch id={`${idPrefix}-conf`} checked={value.conferencesEnabled} onCheckedChange={(v) => set({ conferencesEnabled: v })} />
          <FieldLabel htmlFor={`${idPrefix}-conf`} className="font-normal">
            Track parent conferences
          </FieldLabel>
        </Field>
        {value.conferencesEnabled ? (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={`${idPrefix}-hours`}>Every</label>
            <Input
              id={`${idPrefix}-hours`}
              inputMode="numeric"
              className="w-20 tabular-nums"
              value={value.everyHours}
              onChange={(e) => set({ everyHours: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            />
            <span className="text-muted-foreground">tutoring hours</span>
          </div>
        ) : null}
        <FieldDescription>
          {value.conferencesEnabled
            ? 'A student is due a parent conference after this many tutoring hours; Home lists who is due.'
            : 'Off: nothing is tracked, and there is no Conference tab or Conference Needed card.'}
        </FieldDescription>
      </FieldSet>
    </>
  )
}

/** Validates the conference hours; returns an error message or null. */
export function conferenceHoursError(v: CapacityAndConferences): string | null {
  if (!v.conferencesEnabled) return null
  const n = Number(v.everyHours)
  return Number.isInteger(n) && n >= 1 && n <= 500 ? null : 'Enter the conference interval in whole hours (1–500).'
}
