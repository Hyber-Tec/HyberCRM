import { collection, orderBy, query } from 'firebase/firestore'
import { useMemo } from 'react'
import { LuArrowRight, LuGlobe, LuPlus, LuSettings2 } from 'react-icons/lu'
import { Link } from 'react-router'
import { ROOT } from '@shared/paths'
import type { Branch, BranchStatus } from '@shared/types'
import { BrandMark } from '@/components/app/BrandMark'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/lib/firebase'
import { useQuery } from '@/lib/firestore'

export const STATUS_BADGE: Record<BranchStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active: { label: 'Active', variant: 'secondary' },
  suspended: { label: 'Suspended', variant: 'destructive' },
  archived: { label: 'Archived', variant: 'outline' },
}

export function PlatformHome() {
  const q = useMemo(() => query(collection(db, ROOT.branches), orderBy('name')), [])
  const { data: branches, loading, error } = useQuery<Branch>(q, 'platform-branches')

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Every tutoring center on Hyber. Open one to work in it exactly as its admin would."
        actions={
          <Button asChild>
            <Link to="/platform/branches/new">
              <LuPlus /> New branch
            </Link>
          </Button>
        }
      />
      {error ? <p className="text-sm text-destructive">Could not load branches: {error.message}</p> : null}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyTitle>No branches yet</EmptyTitle>
            <EmptyDescription>Create the first tutoring center to get started.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/platform/branches/new">
                <LuPlus /> New branch
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="gap-4">
              <CardHeader className="flex flex-row items-center gap-3">
                <BrandMark name={b.name} logoUrl={b.branding?.logoUrl} accentColor={b.branding?.accentColor} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{b.name}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">/{b.id}</div>
                </div>
                <Badge variant={STATUS_BADGE[b.status]?.variant ?? 'outline'}>{STATUS_BADGE[b.status]?.label ?? b.status}</Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <LuGlobe className="size-4" /> {b.timezone}
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button asChild className="flex-1">
                  <Link to={`/${b.id}/admin/home`}>
                    Open <LuArrowRight />
                  </Link>
                </Button>
                <Button variant="outline" size="icon" asChild aria-label={`Manage ${b.name}`}>
                  <Link to={`/platform/branches/${b.id}`}>
                    <LuSettings2 />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
