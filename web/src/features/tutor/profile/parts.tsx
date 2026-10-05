import type { Staff, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useIsMobile } from '@/hooks/use-mobile'

/** The tutor's own photo when it's really them; initials in their color otherwise (or while a Super Admin previews). */
export function MeAvatar({ staff, className }: { staff: WithId<Staff> | null; className?: string }) {
  const { user } = useAuth()
  const { viewAs } = useBranch()
  const name = staff?.name || user?.displayName || '?'
  const photo = !viewAs ? user?.photoURL : null
  const color = staff?.color
  return (
    <Avatar className={className}>
      {photo ? <AvatarImage src={photo} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="font-semibold" style={color ? { backgroundColor: `${color}1f`, color } : undefined}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Title and one line under it, at the top of each section. */
export function SectionTitle({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  // Phones show a section on its own page, so its title is the page's heading.
  const Heading = useIsMobile() ? 'h1' : 'h2'
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Heading className="text-xl font-semibold tracking-tight">{title}</Heading>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  )
}
