import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuBold,
  LuHeading2,
  LuHeading3,
  LuImage,
  LuItalic,
  LuLink,
  LuList,
  LuListOrdered,
  LuQuote,
  LuRedo2,
  LuStrikethrough,
  LuUnderline,
  LuUndo2,
} from 'react-icons/lu'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Announcement editor (Tiptap). Images are uploaded through `uploadImage`
 * (toolbar, paste or drop) and referenced by URL, never inlined.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your announcement…',
  uploadImage,
  className,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  uploadImage: (file: File) => Promise<string>
  className?: string
}) {
  const [uploading, setUploading] = useState(0)
  const editorRef = useRef<Editor | null>(null)

  async function insertImages(files: File[], pos?: number) {
    const editor = editorRef.current
    if (!editor) return
    for (const file of files) {
      setUploading((n) => n + 1)
      try {
        const src = await uploadImage(file)
        const chain = editor.chain().focus()
        ;(pos != null ? chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: file.name } }) : chain.setImage({ src, alt: file.name })).run()
      } catch (e) {
        toast.error((e as Error).message || 'Image upload failed.')
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'rich-content min-h-64 px-4 py-3 focus:outline-none', 'aria-label': 'Announcement content' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        void insertImages(files)
        return true
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertImages(files, pos)
        return true
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  })
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-background focus-within:ring-[3px] focus-within:ring-ring/50', className)}>
      <Toolbar editor={editor} uploading={uploading > 0} onPickImages={(files) => void insertImages(files)} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor, uploading, onPickImages }: { editor: Editor; uploading: boolean; onPickImages: (files: File[]) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const run = () => editor.chain().focus()

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
      <Tool icon={LuBold} label="Bold" pressed={s.bold} onPress={() => run().toggleBold().run()} />
      <Tool icon={LuItalic} label="Italic" pressed={s.italic} onPress={() => run().toggleItalic().run()} />
      <Tool icon={LuUnderline} label="Underline" pressed={s.underline} onPress={() => run().toggleUnderline().run()} />
      <Tool icon={LuStrikethrough} label="Strikethrough" pressed={s.strike} onPress={() => run().toggleStrike().run()} />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <Tool icon={LuHeading2} label="Heading" pressed={s.h2} onPress={() => run().toggleHeading({ level: 2 }).run()} />
      <Tool icon={LuHeading3} label="Subheading" pressed={s.h3} onPress={() => run().toggleHeading({ level: 3 }).run()} />
      <Tool icon={LuList} label="Bulleted list" pressed={s.bullet} onPress={() => run().toggleBulletList().run()} />
      <Tool icon={LuListOrdered} label="Numbered list" pressed={s.ordered} onPress={() => run().toggleOrderedList().run()} />
      <Tool icon={LuQuote} label="Quote" pressed={s.quote} onPress={() => run().toggleBlockquote().run()} />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <LinkTool editor={editor} active={s.link} href={s.href} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Insert image" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Spinner /> : <LuImage />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert image (or paste / drop one)</TooltipContent>
      </Tooltip>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onPickImages(files)
        }}
      />
      <div className="ml-auto flex items-center gap-0.5">
        <Tool icon={LuUndo2} label="Undo" disabled={!s.canUndo} onPress={() => run().undo().run()} />
        <Tool icon={LuRedo2} label="Redo" disabled={!s.canRedo} onPress={() => run().redo().run()} />
      </div>
    </div>
  )
}

function Tool({ icon: Icon, label, pressed, disabled, onPress }: { icon: IconType; label: string; pressed?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle size="sm" aria-label={label} pressed={!!pressed} disabled={disabled} onPressedChange={onPress} className="size-8 min-w-8 px-0">
          <Icon />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LinkTool({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const apply = () => {
    const v = url.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!v) chain.unsetLink().run()
    else chain.setLink({ href: /^(https?:|mailto:|tel:)/i.test(v) ? v : `https://${v}` }).run()
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setUrl(href)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Toggle size="sm" aria-label="Link" pressed={active} className="size-8 min-w-8 px-0">
              <LuLink />
            </Toggle>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link address" />
          <Button type="submit" size="sm">
            {url.trim() ? 'Apply' : 'Remove'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
