import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuShieldCheck, LuTrash2, LuUserPlus } from 'react-icons/lu'
import { toast } from 'sonner'
import { ROOT, emailKey } from '@shared/paths'
import type { PlatformAdmin } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/firebase'
import { useQuery } from '@/lib/firestore'

export function PlatformAdmins() {
  const { email } = useAuth()
  const q = useMemo(() => collection(db, ROOT.platformAdmins), [])
  const { data: admins } = useQuery<PlatformAdmin>(q, 'platform-admins')
  const [value, setValue] = useState('')

  async function add() {
    const key = emailKey(value)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      toast.error('Enter a valid email address.')
      return
    }
    await setDoc(doc(db, ROOT.platformAdmins, key), { email: key, name: '', addedAt: serverTimestamp(), addedBy: email })
    setValue('')
    toast.success(`${key} is now a platform admin`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Platform admins"
        description="Super Admins see every branch and can enter any of them with full access."
      />
      <Card>
        <CardHeader>
          <CardTitle>Super Admins</CardTitle>
          <CardDescription>Only add people who run Hyber itself, not branch staff.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <LuShieldCheck className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{a.email}</span>
              {a.id === email ? (
                <span className="text-xs text-muted-foreground">You</span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${a.email}`}
                  onClick={async () => {
                    if (!window.confirm(`Remove ${a.email} as a platform admin?`)) return
                    await deleteDoc(doc(db, ROOT.platformAdmins, a.id))
                  }}
                >
                  <LuTrash2 />
                </Button>
              )}
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="name@gmail.com" />
            <Button type="submit" variant="outline">
              <LuUserPlus /> Add
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
