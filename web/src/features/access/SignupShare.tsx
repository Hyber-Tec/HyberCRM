import { useEffect, useState } from 'react'
import { LuCopy, LuDownload, LuExternalLink, LuQrCode, LuTriangleAlert } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { branchSignupUrl } from '@shared/brand'
import { useBranch } from '@/branch/BranchProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** The branch's public sign-up page address (on this site). */
export function useSignupUrl() {
  const { branchId } = useBranch()
  return branchSignupUrl(branchId, window.location.origin)
}

function useQrCode(text: string, enabled: boolean) {
  const [url, setUrl] = useState<{ text: string; data: string } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    // Loaded on demand: the QR library isn't needed anywhere else.
    void import('qrcode').then(({ toDataURL }) =>
      toDataURL(text, { width: 480, margin: 2, errorCorrectionLevel: 'M' }).then((data) => live && setUrl({ text, data })),
    )
    return () => {
      live = false
    }
  }, [text, enabled])
  return url?.text === text ? url.data : null
}

/**
 * Share the sign-up page: the link (copy, open) and a QR code to print or post.
 * Warns when sign-ups are turned off.
 */
export function SignupShare({ className }: { className?: string }) {
  const { branchId, branch, settings } = useBranch()
  const url = useSignupUrl()
  const qr = useQrCode(url, true)
  const closed = settings.signup.enabled === false || settings.signup.roles.length === 0

  return (
    <div className={cn('space-y-4', className)}>
      {closed ? (
        <Alert>
          <LuTriangleAlert />
          <AlertDescription>
            Sign-ups are turned off, so the page says “Sign-up is closed”.{' '}
            <Link to={`/${branchId}/admin/settings/signup`} className="font-medium text-foreground underline underline-offset-2">
              Turn them on in Settings
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 rounded-xl border bg-white p-2 sm:mx-0">
          {qr ? <img src={qr} alt={`QR code for ${url}`} className="size-36" data-testid="signup-qr" /> : <Skeleton className="size-36" />}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-muted-foreground">
            New tutors, parents and students open this link, sign in with Google and request access. You approve requests in Account → Sign-up requests.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Sign-up link" />
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(url)
                toast.success('Sign-up link copied')
              }}
            >
              <LuCopy /> Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <LuExternalLink /> Open the page
              </a>
            </Button>
            <Button variant="outline" size="sm" disabled={!qr} asChild={!!qr}>
              {qr ? (
                <a href={qr} download={`${branch.shortName || branchId}-sign-up-qr.png`}>
                  <LuDownload /> Download QR code
                </a>
              ) : (
                <span>
                  <LuDownload /> Download QR code
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A card with the sign-up link, for the Sign-up requests tab and Settings. */
export function SignupShareCard({ className }: { className?: string }) {
  return (
    <Card className={cn('gap-3 p-4', className)} data-testid="signup-share">
      <div className="flex items-center gap-2 text-sm font-medium">
        <LuQrCode className="size-4 text-muted-foreground" /> Your sign-up page
      </div>
      <SignupShare />
    </Card>
  )
}

export function SignupShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { branch } = useBranch()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{branch.name}’s sign-up page</DialogTitle>
          <DialogDescription>Share it on your website, in messages, or print the QR code for the front desk.</DialogDescription>
        </DialogHeader>
        {open ? <SignupShare /> : null}
      </DialogContent>
    </Dialog>
  )
}
