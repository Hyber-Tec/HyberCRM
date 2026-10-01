import { LuConstruction } from 'react-icons/lu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeader } from './PageHeader'

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuConstruction />
          </EmptyMedia>
          <EmptyTitle>Coming soon</EmptyTitle>
          <EmptyDescription>{description ?? 'This page is part of an upcoming build step.'}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
