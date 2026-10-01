import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { PRODUCT_NAME, branchSignInUrl, isReservedEmail } from '@shared/brand'
import { type InviteKind, inviteEmail } from '@shared/email/invite'
import { COL, DOC, ROOT } from '@shared/paths'
import { ROLE_LABELS } from '@shared/roles'
import type { Branch, BranchPublicProfile, Member, MemberInvite, SignupRequest } from '@shared/types'
import { db } from './app'
import { gmailAppPassword, sendMail } from './email'

/**
 * Emails someone a link to sign in to a branch and records the result on their
 * member doc (`invite`). `by` is who gave the access (an email), or null.
 */
async function deliverInvite(opts: { branchId: string; email: string; member: Member; kind: InviteKind; by: string | null }): Promise<MemberInvite['status']> {
  const { branchId, email, member, kind, by } = opts
  const memberRef = db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`)
  const record = (status: MemberInvite['status'], error: string | null = null) =>
    memberRef.update({
      invite: { status, kind, at: FieldValue.serverTimestamp(), by, error, count: FieldValue.increment(1) },
    })

  const branchSnap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  const branch = branchSnap.data() as Branch | undefined
  if (!branch || branch.status !== 'active' || member.status !== 'active') {
    await record('skipped')
    return 'skipped'
  }

  // Who gave the access: HyberTec for the Super Admin, else a branch member by name.
  // Replies go to that member, or to the branch's contact address.
  let inviterName: string | null = null
  let byHyberTec = false
  let replyTo: string | null = branch.contact?.email || null
  if (by && by !== email) {
    const [platform, inviter] = await Promise.all([db.doc(`${ROOT.platformAdmins}/${by}`).get(), db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${by}`).get()])
    if (platform.exists) byHyberTec = true
    else if (inviter.exists) {
      inviterName = (inviter.get('displayName') as string) || by
      replyTo = by
    }
  }

  const content = inviteEmail({
    kind,
    to: email,
    name: member.displayName ?? '',
    role: member.role,
    branchName: branch.name,
    inviterName,
    byHyberTec,
    signInUrl: branchSignInUrl(branchId, email),
  })
  const result = await sendMail({ to: email, ...content, fromName: `${branch.name} via ${PRODUCT_NAME}`, replyTo })
  await record(result.status, result.status === 'failed' ? result.error : null)
  return result.status
}

/**
 * A new member gets a sign-in email: an owner invite, "you've been added", or
 * "your request was approved". A member who becomes an owner gets one too.
 * Test and example addresses are never emailed.
 */
export const onMemberWritten = onDocumentWritten(
  { document: `${ROOT.branches}/{branchId}/${COL.members}/{email}`, secrets: [gmailAppPassword] },
  async (event) => {
    const before = event.data?.before.data() as Member | undefined
    const after = event.data?.after.data() as Member | undefined
    if (!after) return
    const { branchId, email } = event.params
    const promoted = !!before && before.role !== 'owner' && after.role === 'owner'
    if (before && !promoted) return
    if (isReservedEmail(email)) return

    let kind: InviteKind = promoted ? 'promoted_owner' : after.role === 'owner' ? 'owner' : 'added'
    let by = (promoted ? after.updatedBy : after.createdBy) ?? null
    if (!before) {
      const request = await db.doc(`${ROOT.branches}/${branchId}/${COL.signupRequests}/${email}`).get()
      if (request.exists && (request.data() as SignupRequest).status === 'approved') {
        kind = 'approved'
        by = (request.get('decidedBy') as string | undefined) ?? by
      }
    }
    await deliverInvite({ branchId, email, member: after, kind, by })
  },
)

/** An owner or admin (or the Super Admin) emails someone their sign-in link again. */
export const resendInvite = onCall({ secrets: [gmailAppPassword] }, async (req) => {
  const { branchId, email } = (req.data ?? {}) as { branchId?: string; email?: string }
  const token = req.auth?.token
  if (!token || typeof token.email !== 'string' || token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (!branchId || !email) throw new HttpsError('invalid-argument', 'Missing branch or email.')
  const caller = token.email.toLowerCase()
  const [platform, callerMember, target] = await Promise.all([
    db.doc(`${ROOT.platformAdmins}/${caller}`).get(),
    db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${caller}`).get(),
    db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email.toLowerCase()}`).get(),
  ])
  const callerRole = callerMember.get('role') as string | undefined
  const isAdmin = platform.exists || (callerMember.get('status') === 'active' && (callerRole === 'owner' || callerRole === 'admin'))
  if (!isAdmin) throw new HttpsError('permission-denied', 'Only branch admins can send sign-in emails.')
  if (!target.exists) throw new HttpsError('not-found', 'This person has no access to the branch.')
  const member = target.data() as Member
  if (isReservedEmail(target.id)) throw new HttpsError('failed-precondition', 'Test and example addresses never get email.')

  const status = await deliverInvite({ branchId, email: target.id, member, kind: member.role === 'owner' ? 'owner' : 'added', by: caller })
  if (status === 'sent') {
    const profile = (await db.doc(`${ROOT.branches}/${branchId}/${COL.public}/${DOC.publicProfile}`).get()).data() as BranchPublicProfile | undefined
    await db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).add({
      at: FieldValue.serverTimestamp(),
      actorUid: req.auth!.uid,
      actorEmail: caller,
      actorName: (callerMember.get('displayName') as string | undefined) || (token.name as string | undefined) || caller,
      actorRole: platform.exists ? 'super_admin' : (callerRole ?? 'admin'),
      action: 'member.invite',
      category: 'access',
      entityType: 'member',
      entityId: target.id,
      summary: `Emailed ${member.displayName || target.id} a link to sign in to ${profile?.name ?? branchId} (${ROLE_LABELS[member.role]})`,
      context: '',
      dateKey: null,
      studentId: null,
      studentName: null,
      tutorId: null,
      tutorName: null,
      changes: [],
      via: 'function',
    })
  }
  const invite = (await target.ref.get()).get('invite') as MemberInvite | undefined
  return { status, error: invite?.error ?? null }
})
