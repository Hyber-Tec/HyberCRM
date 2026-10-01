import { httpsCallable } from 'firebase/functions'
import { useState } from 'react'
import { LuKeyRound } from 'react-icons/lu'
import { toast } from 'sonner'
import type { Staff, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { functions } from '@/lib/firebase'

const setKioskPin = httpsCallable<{ branchId: string; staffId: string; pin: string | null }, { ok: boolean }>(functions, 'setKioskPin')

/** Admin sets or removes an employee's kiosk PIN (hashed and checked for uniqueness on the server). */
export function KioskPinCard({ staff }: { staff: WithId<Staff> }) {
  const { branchId, settings } = useBranch()
  const len = settings.timeClock.kiosk.pinLength
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(value: string | null) {
    setBusy(true)
    try {
      await setKioskPin({ branchId, staffId: staff.id, pin: value })
      toast.success(value ? 'Kiosk PIN saved' : 'Kiosk PIN removed')
      setPin('')
    } catch (e) {
      toast.error((e as { message?: string }).message?.replace(/^.*?: /, '') || 'Could not save the PIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuKeyRound /> Kiosk PIN {staff.hasKioskPin ? <Badge variant="secondary">Set</Badge> : <Badge variant="outline">Not set</Badge>}
        </CardTitle>
        <CardDescription>Used to clock in and out at the kiosk. PINs are stored encrypted and must be unique.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Input
          className="w-36 font-mono tracking-[0.4em]"
          inputMode="numeric"
          maxLength={len}
          placeholder={'•'.repeat(len)}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, len))}
        />
        <Button disabled={busy || pin.length !== len} onClick={() => void save(pin)}>
          {busy ? <Spinner /> : null} {staff.hasKioskPin ? 'Change PIN' : 'Set PIN'}
        </Button>
        {staff.hasKioskPin ? (
          <Button variant="ghost" disabled={busy} onClick={() => window.confirm('Remove this kiosk PIN?') && void save(null)}>
            Remove
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
