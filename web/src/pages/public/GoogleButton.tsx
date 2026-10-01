import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export function GoogleSignInButton({
  label = 'Sign in with Google',
  size = 'lg',
  className,
}: {
  label?: string
  size?: 'default' | 'lg'
  className?: string
}) {
  const { signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size={size}
      variant="outline"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await signIn()
        } catch (e) {
          toast.error('Sign-in failed', { description: (e as Error).message })
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Spinner /> : <FcGoogle className="size-4" />}
      {label}
    </Button>
  )
}
