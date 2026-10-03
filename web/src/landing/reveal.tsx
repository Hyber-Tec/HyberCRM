import { type CSSProperties, type ElementType, Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** True once the element has scrolled into view (and stays true). */
export function useSeen<T extends Element>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin, seen])
  return [ref, seen] as const
}

/** Fades and lifts its content in when it scrolls into view (see `.reveal` in landing.css). */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  y,
  className,
  children,
  ...rest
}: {
  as?: ElementType
  delay?: number
  y?: number
  className?: string
  children: ReactNode
} & Record<string, unknown>) {
  const [ref, seen] = useSeen<HTMLElement>()
  const style = { '--reveal-delay': `${delay}ms`, ...(y === undefined ? {} : { '--reveal-y': `${y}px` }) } as CSSProperties
  return (
    <Tag ref={ref} className={cn('reveal', seen && 'is-in', className)} style={style} {...rest}>
      {children}
    </Tag>
  )
}

/**
 * A heading whose words rise one after another when it scrolls into view;
 * `accent` words follow as one piece in the moving gradient.
 */
export function Words({ text, accent, className, delay = 0, as: Tag = 'span' }: { text: string; accent?: string; className?: string; delay?: number; as?: ElementType }) {
  const [ref, seen] = useSeen<HTMLElement>()
  const words = text.split(' ').filter(Boolean)
  return (
    <Tag ref={ref} className={cn('words', seen && 'is-in', className)} style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}>
      {words.map((w, i) => (
        <Fragment key={i}>
          {i ? ' ' : null}
          <span style={{ '--i': i } as CSSProperties}>{w}</span>
        </Fragment>
      ))}
      {accent ? (
        <>
          {' '}
          <span className="text-shine" style={{ '--i': words.length } as CSSProperties}>
            {accent}
          </span>
        </>
      ) : null}
    </Tag>
  )
}

/** Pointer position as CSS variables, for `.spotlight` cards. */
export function spotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`)
}
