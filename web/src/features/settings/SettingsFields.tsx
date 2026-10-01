import { LuRotateCcw } from 'react-icons/lu'
import type { WeekHours } from '@shared/settings/defaults'
import { formatMinutes, orderedWeekdays, type Weekday, WEEKDAY_LABELS } from '@shared/time'
import { TimeSelect } from '@/components/app/TimeSelect'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { FieldDef } from './schema'

interface Props {
  def: FieldDef
  value: unknown
  isDefault: boolean
  onChange: (value: unknown) => void
  onReset: () => void
  weekStartsOn: Weekday
  disabled?: boolean
}

export function SettingField({ def, value, isDefault, onChange, onReset, weekStartsOn, disabled }: Props) {
  const id = `set-${def.path}`
  const reset = !isDefault ? (
    <Button type="button" variant="ghost" size="xs" onClick={onReset} className="text-muted-foreground" disabled={disabled}>
      <LuRotateCcw /> Default
    </Button>
  ) : null

  if (def.kind === 'boolean') {
    return (
      <Field orientation="horizontal" className="items-start">
        <Switch id={id} checked={value === true} onCheckedChange={onChange} disabled={disabled} />
        <FieldContent>
          <FieldLabel htmlFor={id} className="font-normal">
            {def.label}
          </FieldLabel>
          {def.help ? <FieldDescription>{def.help}</FieldDescription> : null}
        </FieldContent>
        {reset}
      </Field>
    )
  }

  let control: React.ReactNode = null
  switch (def.kind) {
    case 'number':
      control = (
        <InputGroup className="w-48">
          <InputGroupInput
            id={id}
            type="number"
            inputMode="numeric"
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
            disabled={disabled}
          />
          {def.suffix ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText>{def.suffix}</InputGroupText>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      )
      break
    case 'select':
      control = (
        <Select value={String(value)} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
      break
    case 'multiselect': {
      const list = Array.isArray(value) ? (value as string[]) : []
      control = (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {def.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={list.includes(o.value)}
                disabled={disabled}
                onCheckedChange={(v) =>
                  onChange(v === true ? [...list, o.value] : list.filter((x) => x !== o.value))
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      )
      break
    }
    case 'text':
      control = def.multiline ? (
        <Textarea id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={3} disabled={disabled} />
      ) : (
        <Input id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )
      break
    case 'list':
      control = (
        <Textarea
          id={id}
          rows={Math.min(8, Math.max(3, (value as string[] | undefined)?.length ?? 3))}
          value={(Array.isArray(value) ? (value as string[]) : []).join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trimStart()))}
          onBlur={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          disabled={disabled}
        />
      )
      break
    case 'hhmm':
      control = (
        <Input id={id} type="time" className="w-36" value={String(value ?? '00:00')} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )
      break
    case 'date':
      control = (
        <DatePicker id={id} className="w-44" value={value ? String(value) : null} onChange={(d) => onChange(d)} disabled={disabled} />
      )
      break
    case 'range': {
      const r = (value ?? { startMin: 540, endMin: 1320 }) as { startMin: number; endMin: number }
      control = (
        <div className="flex items-center gap-2">
          <TimeSelect value={r.startMin} step={def.step ?? 30} onChange={(m) => onChange({ ...r, startMin: m })} disabled={disabled} />
          <span className="text-sm text-muted-foreground">to</span>
          <TimeSelect value={r.endMin} step={def.step ?? 30} onChange={(m) => onChange({ ...r, endMin: m })} disabled={disabled} />
        </div>
      )
      break
    }
    case 'weekHours':
      control = <WeekHoursEditor value={value as WeekHours} onChange={onChange} weekStartsOn={weekStartsOn} disabled={disabled} />
      break
  }

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
        {reset}
      </div>
      {control}
      {def.help ? <FieldDescription>{def.help}</FieldDescription> : null}
    </Field>
  )
}

export function WeekHoursEditor({
  value,
  onChange,
  weekStartsOn,
  disabled,
}: {
  value: WeekHours
  onChange: (v: WeekHours) => void
  weekStartsOn: Weekday
  disabled?: boolean
}) {
  return (
    <div className="divide-y rounded-lg border">
      {orderedWeekdays(weekStartsOn).map((day) => {
        const d = value[day]
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <div className="w-28 text-sm font-medium">{WEEKDAY_LABELS[day]}</div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={d.isOpen}
                disabled={disabled}
                onCheckedChange={(v) => onChange({ ...value, [day]: { ...d, isOpen: v } })}
              />
              {d.isOpen ? 'Open' : 'Closed'}
            </label>
            {d.isOpen ? (
              <div className="ml-auto flex items-center gap-2">
                <TimeSelect value={d.openMin} disabled={disabled} onChange={(m) => onChange({ ...value, [day]: { ...d, openMin: m } })} />
                <span className="text-sm text-muted-foreground">to</span>
                <TimeSelect value={d.closeMin} disabled={disabled} onChange={(m) => onChange({ ...value, [day]: { ...d, closeMin: m } })} />
              </div>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground">
                Hidden from the schedule ({formatMinutes(d.openMin)} – {formatMinutes(d.closeMin)} when opened)
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
