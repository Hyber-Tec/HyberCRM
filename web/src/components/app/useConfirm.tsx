import { useCallback, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

export interface ConfirmOptions {
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
}

/** `if (await confirm({...}))`: true when the person confirms. Render `dialog` once in the component. */
export function useConfirm() {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ ...opts, resolve })), [])
  const dialog = (
    <ConfirmDialog
      open={!!req}
      onOpenChange={(open) => {
        if (!open && req) {
          req.resolve(false)
          setReq(null)
        }
      }}
      title={req?.title ?? ''}
      description={req?.description}
      confirmLabel={req?.confirmLabel}
      destructive={req?.destructive}
      onConfirm={() => {
        req?.resolve(true)
        setReq(null)
      }}
    />
  )
  return { confirm, dialog }
}
