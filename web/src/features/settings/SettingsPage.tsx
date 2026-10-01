import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuImageUp, LuTrash2 } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { publicProfileFor } from '@shared/branchFactory'
import { COL, DOC, ROOT } from '@shared/paths'
import { PAY_MODEL_HELP, PAY_MODEL_LABELS, payModelOn } from '@shared/settings/businessRules'
import { DEFAULT_SETTINGS, type BranchSettings } from '@shared/settings/defaults'
import { formatDateKey, todayKey } from '@shared/time'
import { type SettingsOverrides, getPath, setPath, unsetPath } from '@shared/settings/resolve'
import type { Branch, BranchBranding, BranchContact } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { PageHeader } from '@/components/app/PageHeader'
import { TimeZonePicker } from '@/components/app/TimeZonePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { SignupShareCard } from '@/features/access/SignupShare'
import { AuditLogSection } from '@/features/audit/AuditLogSection'
import { type AuditInput, addAudit } from '@/lib/audit'
import { db, storage } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { DateHoursCard } from './DateHoursCard'
import { SettingField } from './SettingsFields'
import { SETTINGS_SECTIONS, type FieldDef } from './schema'

const SECTIONS = [
  { key: 'branch', title: 'Branch' },
  { key: 'branding', title: 'Branding' },
  ...SETTINGS_SECTIONS.map((s) => ({ key: s.key, title: s.title })),
  { key: 'audit-log', title: 'Audit Log' },
]

export function SettingsPage() {
  const { branchId } = useBranch()
  const { section } = useParams()
  const navigate = useNavigate()
  const active = SECTIONS.some((s) => s.key === section) ? section! : 'branch'
  const setActive = (key: string) => navigate(`/${branchId}/admin/settings/${key}`)
  return (
    <div>
      <PageHeader title="Settings" description="Your branch profile, branding and day-to-day settings. Defaults follow the standard Hyber setup." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:sticky lg:top-4 lg:w-52 lg:shrink-0 lg:self-start">
          <div className="lg:hidden">
            <Select value={active} onValueChange={setActive}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ul className="hidden space-y-0.5 lg:block">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={cn(
                    'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    active === s.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cn('min-w-0 flex-1', active === 'audit-log' ? 'lg:max-w-5xl' : 'lg:max-w-3xl')}>
          {active === 'branch' ? (
            <div className="space-y-4">
              <BranchProfileCard />
              <BusinessRulesCard />
            </div>
          ) : active === 'branding' ? (
            <BrandingCard />
          ) : active === 'audit-log' ? (
            <AuditLogSection />
          ) : active === 'schedule' ? (
            <div className="space-y-4">
              <BusinessSection sectionKey={active} />
              <DateHoursCard />
            </div>
          ) : active === 'signup' ? (
            <div className="space-y-4">
              <BusinessSection sectionKey={active} />
              <SignupShareCard />
            </div>
          ) : (
            <BusinessSection sectionKey={active} />
          )}
        </div>
      </div>
    </div>
  )
}

function useBranchWriter() {
  const { branchId, actor, branch } = useBranch()
  return async (patch: Partial<Branch>, audit: AuditInput) => {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId), { ...patch, updatedAt: serverTimestamp(), updatedBy: actor.email })
    const next = { ...branch, ...patch }
    batch.set(doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile), publicProfileFor(next))
    addAudit(batch, branchId, actor, audit)
    await batch.commit()
  }
}

/** Read-only: the core rules HyberTec chose when the branch was set up. */
function BusinessRulesCard() {
  const { rules, timezone } = useBranch()
  const today = todayKey(timezone)
  const now = payModelOn(rules, today)
  const next = rules.payModels.find((p) => p.from > today)
  const rows: { label: string; value: string; help?: string }[] = [
    {
      label: 'Pay model',
      value: PAY_MODEL_LABELS[now],
      help: next ? `Changes to ${PAY_MODEL_LABELS[next.model]} on ${formatDateKey(next.from, 'medium')}. ${PAY_MODEL_HELP[now]}` : PAY_MODEL_HELP[now],
    },
    { label: 'Students per tutor at once', value: String(rules.maxStudentsPerTutor), help: rules.maxStudentsPerTutor === 1 ? 'One-to-one sessions.' : undefined },
    {
      label: 'Parent conferences',
      value: rules.conferences.enabled ? `Every ${rules.conferences.everyHours} tutoring hours` : 'Off',
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business rules</CardTitle>
        <CardDescription>Chosen by HyberTec when your branch was set up. To change them, contact HyberTec.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[14rem_1fr]">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd>
                <div className="font-medium">{r.value}</div>
                {r.help ? <div className="text-xs text-muted-foreground">{r.help}</div> : null}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function BranchProfileCard() {
  const { branch, branchId } = useBranch()
  const write = useBranchWriter()
  const [name, setName] = useState(branch.name)
  const [shortName, setShortName] = useState(branch.shortName)
  const [timezone, setTimezone] = useState(branch.timezone)
  const [contact, setContact] = useState<BranchContact>(branch.contact ?? { email: '', phone: '', address: '', website: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(branch.name)
    setShortName(branch.shortName)
    setTimezone(branch.timezone)
    setContact(branch.contact ?? { email: '', phone: '', address: '', website: '' })
  }, [branch])

  async function save() {
    if (!name.trim()) return toast.error('The branch needs a name.')
    setBusy(true)
    try {
      await write(
        { name: name.trim(), shortName: shortName.trim() || name.trim(), timezone, contact },
        {
          action: 'settings.update',
          category: 'settings',
          entityType: 'branch',
          entityId: branchId,
          summary: 'Updated the branch profile',
          changes: [
            ...(branch.name !== name.trim() ? [{ field: 'name', label: 'Name', from: branch.name, to: name.trim() }] : []),
            ...(branch.timezone !== timezone ? [{ field: 'timezone', label: 'Time zone', from: branch.timezone, to: timezone }] : []),
          ],
        },
      )
      toast.success('Branch profile saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branch</CardTitle>
        <CardDescription>
          Branch ID <span className="font-mono">{branchId}</span> (can’t be changed)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bp-name">Name</FieldLabel>
              <Input id="bp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bp-short">Short name</FieldLabel>
              <Input id="bp-short" value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="bp-tz">Time zone</FieldLabel>
            <TimeZonePicker id="bp-tz" value={timezone} onChange={setTimezone} />
            <FieldDescription>All dates, “today”, locks and cut-offs use this zone, whatever device people use.</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['email', 'phone', 'website', 'address'] as const).map((k) => (
              <Field key={k}>
                <FieldLabel htmlFor={`bp-${k}`} className="capitalize">
                  {k}
                </FieldLabel>
                <Input id={`bp-${k}`} value={contact[k] ?? ''} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? <Spinner /> : null} Save
        </Button>
      </CardFooter>
    </Card>
  )
}

const ACCENTS = ['#171717', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0891b2']

function BrandingCard() {
  const { branch, branchId } = useBranch()
  const write = useBranchWriter()
  const [branding, setBranding] = useState<BranchBranding>(branch.branding)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => setBranding(branch.branding), [branch.branding])

  async function save(next: BranchBranding, summary: string) {
    await write({ branding: next }, { action: 'settings.branding', category: 'settings', entityType: 'branch', entityId: branchId, summary })
  }

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file.')
    if (file.size > 2 * 1024 * 1024) return toast.error('The logo must be smaller than 2 MB.')
    setBusy('Uploading…')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `branches/${branchId}/branding/logo-${Date.now()}.${ext}`
      const r = storageRef(storage, path)
      await uploadBytes(r, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' })
      const url = await getDownloadURL(r)
      const old = branding.logoPath
      const next = { ...branding, logoUrl: url, logoPath: path }
      await save(next, 'Uploaded a new logo')
      if (old) await deleteObject(storageRef(storage, old)).catch(() => undefined)
      toast.success('Logo updated')
    } catch (e) {
      toast.error('Upload failed', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function removeLogo() {
    const old = branding.logoPath
    await save({ ...branding, logoUrl: null, logoPath: null }, 'Removed the logo')
    if (old) await deleteObject(storageRef(storage, old)).catch(() => undefined)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Your logo and color appear in every portal and on your sign-up page.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Logo</FieldLabel>
            <div className="flex items-center gap-4">
              <BrandMark name={branch.name} logoUrl={branding.logoUrl} accentColor={branding.accentColor} className="size-16 rounded-xl text-lg" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild disabled={!!busy}>
                  <label className="cursor-pointer">
                    {busy ? <Spinner /> : <LuImageUp />}
                    {busy ?? 'Upload logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) void upload(f)
                      }}
                    />
                  </label>
                </Button>
                {branding.logoUrl ? (
                  <Button variant="ghost" onClick={() => void removeLogo()}>
                    <LuTrash2 /> Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <FieldDescription>Square images work best (PNG or SVG, under 2 MB). Without a logo, initials are shown.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Brand color</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  onClick={() => void save({ ...branding, accentColor: c }, `Changed the brand color to ${c}`)}
                  className={cn(
                    'size-8 rounded-full border-2 transition-transform hover:scale-105',
                    branding.accentColor === c ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <Input
                type="color"
                className="h-8 w-14 cursor-pointer p-1"
                value={branding.accentColor ?? '#171717'}
                onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                onBlur={() => void save(branding, `Changed the brand color to ${branding.accentColor}`)}
              />
              {branding.accentColor ? (
                <Button variant="ghost" size="sm" onClick={() => void save({ ...branding, accentColor: null }, 'Reset the brand color')}>
                  Reset
                </Button>
              ) : null}
            </div>
            <FieldDescription>Used for your logo mark; the app itself keeps a neutral theme.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="br-title">Sidebar title</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="br-title"
                placeholder={branch.name}
                value={branding.sidebarTitle ?? ''}
                onChange={(e) => setBranding({ ...branding, sidebarTitle: e.target.value })}
              />
              <Button variant="outline" onClick={() => void save({ ...branding, sidebarTitle: branding.sidebarTitle?.trim() || null }, 'Changed the sidebar title')}>
                Save
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function BusinessSection({ sectionKey }: { sectionKey: string }) {
  const { branch, branchId, settings, rules } = useBranch()
  const write = useBranchWriter()
  const section = useMemo(() => {
    const full = SETTINGS_SECTIONS.find((s) => s.key === sectionKey)!
    return { ...full, fields: full.fields.filter((f) => !f.visible || f.visible(rules)) }
  }, [sectionKey, rules])
  const [draft, setDraft] = useState<BranchSettings>(settings)
  const [busy, setBusy] = useState(false)

  useEffect(() => setDraft(settings), [settings, sectionKey])

  const dirty = useMemo(
    () => section.fields.some((f) => JSON.stringify(getPath(draft, f.path)) !== JSON.stringify(getPath(settings, f.path))),
    [draft, settings, section],
  )

  async function save() {
    let overrides: SettingsOverrides = (branch.settings ?? {}) as SettingsOverrides
    const changes: AuditInput['changes'] = []
    for (const f of section.fields) {
      const next = cleanValue(f, getPath(draft, f.path))
      const prev = getPath(settings, f.path)
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        changes.push({ field: f.path, label: f.label, from: display(prev), to: display(next) })
      }
      overrides =
        JSON.stringify(next) === JSON.stringify(getPath(DEFAULT_SETTINGS, f.path))
          ? unsetPath(overrides, f.path)
          : setPath(overrides, f.path, next)
    }
    setBusy(true)
    try {
      await write(
        { settings: overrides },
        {
          action: 'settings.update',
          category: 'settings',
          entityType: 'branch',
          entityId: branchId,
          summary: `Updated ${section.title} settings`,
          changes,
        },
      )
      toast.success(`${section.title} settings saved`)
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {section.fields.map((f) => (
            <SettingField
              key={f.path}
              def={f}
              value={getPath(draft, f.path)}
              isDefault={JSON.stringify(getPath(draft, f.path)) === JSON.stringify(getPath(DEFAULT_SETTINGS, f.path))}
              onChange={(v) => setDraft((d) => setPath(d, f.path, v))}
              onReset={() => setDraft((d) => setPath(d, f.path, getPath(DEFAULT_SETTINGS, f.path)))}
              weekStartsOn={draft.general.weekStartsOn}
            />
          ))}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft(settings)}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save changes
        </Button>
      </CardFooter>
    </Card>
  )
}

function cleanValue(f: FieldDef, v: unknown): unknown {
  if (f.kind === 'list' && Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  return v
}

function display(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.join(', ')
  return JSON.stringify(v)
}
