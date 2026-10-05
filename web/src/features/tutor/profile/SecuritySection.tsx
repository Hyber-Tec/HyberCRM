import { useState } from 'react'
import { LuLogOut } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { PasswordDialog, SignInMethodsList } from '@/components/app/SignInSecurity'
import { Button } from '@/components/ui/button'
import { SectionTitle } from './parts'

/** Profile → Sign-in & security: how the account signs in, its password, and signing out. */
export function SecuritySection() {
  const { branch } = useBranch()
  const { email, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState(false)
  return (
    <div>
      <SectionTitle title="Sign-in & security" description={`Your access to ${branch.name} follows your email, ${email ?? ''}, whichever way you sign in.`} />
      <section className="rounded-xl border bg-card p-5" aria-labelledby="methods-title">
        <h3 id="methods-title" className="text-sm font-semibold">
          Ways to sign in
        </h3>
        <p className="mt-0.5 mb-4 text-sm text-muted-foreground">Use the same ones on the website and in the phone app.</p>
        <SignInMethodsList onPassword={() => setPassword(true)} />
      </section>
      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5" aria-labelledby="signout-title">
        <div>
          <h3 id="signout-title" className="text-sm font-semibold">
            Sign out
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">On a shared computer, sign out when you’re done.</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <LuLogOut /> Sign out
        </Button>
      </section>
      <PasswordDialog open={password} onOpenChange={setPassword} />
    </div>
  )
}
