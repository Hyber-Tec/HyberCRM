import { httpsCallable } from 'firebase/functions'
import { LuMail, LuMailCheck, LuMailX } from 'react-icons/lu'
import { toast } from 'sonner'
import { branchSignInUrl } from '@shared/brand'
import { formatInstant } from '@shared/time'
import type { Member, MemberInvite } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { functions } from '@/lib/firebase'
import { cn } from '@/lib/utils'

const call = httpsCallable<{ branchId: string; email: string }, { status: MemberInvite['status']; error: string | null }>(functions, 'resendInvite')

/** The link a person uses to sign in to the branch (this site's address, their email pre-selected). */
export function signInLink(branchId: string, email: string) {
  return branchSignInUrl(branchId, email, window.location.origin)
}

/** Emails someone their sign-in link again and says how it went. */
export async function resendInvite(branchId: string, email: string) {
  try {
    const { data } = await call({ branchId, email })
    if (data.status === 'sent') toast.success('Sign-in email sent', { description: `${email} got a link to sign in.` })
    else if (data.status === 'not_configured') toast.info('Email isn’t set up yet', { description: 'Copy the sign-in link and send it yourself for now.' })
    else if (data.status === 'skipped') toast.info('Not sent', { description: 'This person’s access is paused, or the center isn’t active.' })
    else toast.error('The email couldn’t be sent', { description: data.error ?? undefined })
  } catch (e) {
    toast.error('The email couldn’t be sent', { description: (e as Error).message })
  }
}

export async function copySignInLink(branchId: string, email: string) {
  await navigator.clipboard.writeText(signInLink(branchId, email))
  toast.success('Sign-in link copied', { description: `Send it to ${email}. It opens the center’s sign-in page.` })
}

/**
 * Where someone is with their access: signed in, invited (email sent), or why
 * the email didn't go out.
 */
export function InviteStatus({ member, timezone, className }: { member: Member; timezone: string; className?: string }) {
  const invite = member.invite
  const at = (t: { toDate(): Date } | null | undefined) => (t ? formatInstant(t.toDate(), timezone, { month: 'short', day: 'numeric' }) : '')
  if (member.lastLoginAt) {
    return <span className={cn('text-sm text-muted-foreground', className)}>Signed in {at(member.lastLoginAt)}</span>
  }
  const line = (icon: React.ReactNode, text: string, tip: string, tone = 'text-muted-foreground') => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center gap-1.5 text-sm', tone, className)} data-testid="invite-status">
          {icon}
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  )
  switch (invite?.status) {
    case 'sent':
      return line(<LuMailCheck className="size-3.5 text-emerald-600" />, `Invited ${at(invite.at)}`, `We emailed a sign-in link${invite.count > 1 ? ` (${invite.count} times)` : ''}. They haven’t signed in yet.`)
    case 'failed':
      return line(<LuMailX className="size-3.5" />, 'Email failed', invite.error ?? 'The sign-in email couldn’t be sent. Try again, or copy the link.', 'text-destructive')
    case 'not_configured':
      return line(<LuMail className="size-3.5" />, 'Not emailed yet', 'Email sending isn’t set up yet. Copy the sign-in link from the menu and send it yourself.')
    case 'skipped':
      return line(<LuMail className="size-3.5" />, 'Not emailed', 'No email goes to paused access.')
    default:
      return <span className={cn('text-sm text-muted-foreground', className)}>Not signed in yet</span>
  }
}
