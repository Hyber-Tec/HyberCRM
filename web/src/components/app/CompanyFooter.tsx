import { COMPANY_NAME, PRODUCT_NAME } from '@shared/brand'
import { cn } from '@/lib/utils'

const YEAR = new Date().getFullYear()

/** "Hyber CRM · Software by HyberTec LLC · © 2026" for public pages. */
export function CompanyFooter({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {PRODUCT_NAME} · Software by {COMPANY_NAME} · © {YEAR}
    </p>
  )
}
