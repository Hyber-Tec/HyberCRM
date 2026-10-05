/**
 * A small, safe HTML reader for the announcement editor's output (web/src/features/announcements/RichTextEditor.tsx,
 * sanitized by DOMPurify when saved). It only builds a tree of tags and text for `HtmlView` to draw with native views:
 * nothing is ever run, and what isn't text (scripts, styles, frames, forms, media) is dropped with its content.
 */

export type HtmlNode = HtmlText | HtmlElement;

export interface HtmlText {
  type: "text";
  text: string;
}

export interface HtmlElement {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}

/** Tags without content or a closing tag. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Dropped with everything inside them. */
const DROPPED = new Set([
  "applet",
  "audio",
  "button",
  "canvas",
  "embed",
  "form",
  "frame",
  "frameset",
  "head",
  "iframe",
  "input",
  "math",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "textarea",
  "title",
  "video",
  "xmp",
]);

/** Blocks that end an open paragraph, as a browser does. */
const CLOSES_P = new Set(["address", "blockquote", "div", "dl", "fieldset", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "ol", "p", "pre", "section", "table", "ul"]);

/** Deeper than this, the rest is left out (nobody writes that; it would only be someone testing the reader). */
const MAX_DEPTH = 48;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "­",
  zwnj: "‌",
  zwj: "‍",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sect: "§",
  para: "¶",
  cent: "¢",
  pound: "£",
  euro: "€",
  yen: "¥",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  hearts: "♥",
  check: "✓",
};

/** `&amp;` → `&`, `&#39;` → `'`; an unknown name stays as written. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "�";
    }
    return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const name = m[1].toLowerCase();
    // Event handlers and styles are never needed to draw a post.
    if (name.startsWith("on") || name === "style") continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** The tree of an HTML fragment. Unclosed tags close at the end; stray closing tags are ignored. */
export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlElement = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1];
  const source = html ?? "";
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const token = m[0];
    if (m[1]) {
      // A closing tag: close back to the matching open one, if there is one.
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const rawAttrs = m[3] ?? "";
      if (DROPPED.has(tag)) {
        // Skip to its end (script and style content is raw text, so a "<" inside must not start a tag).
        if (!VOID.has(tag) && !rawAttrs.trim().endsWith("/")) {
          const close = new RegExp(`</${tag}\\s*>`, "ig");
          close.lastIndex = re.lastIndex;
          const end = close.exec(source);
          re.lastIndex = end ? close.lastIndex : source.length;
        }
        continue;
      }
      if (top().tag === "p" && CLOSES_P.has(tag)) stack.pop();
      if (tag === "li") {
        // A new item closes the previous one in the same list.
        for (let i = stack.length - 1; i > 0 && !["ul", "ol"].includes(stack[i].tag); i--) {
          if (stack[i].tag === "li") {
            stack.length = i;
            break;
          }
        }
      }
      const el: HtmlElement = { type: "element", tag, attrs: parseAttrs(rawAttrs), children: [] };
      if (stack.length > MAX_DEPTH) continue;
      top().children.push(el);
      if (!VOID.has(tag) && !/\/\s*$/.test(rawAttrs)) stack.push(el);
    } else if (token[0] === "<" && token.length > 1) {
      // A comment, a doctype or a processing instruction: nothing to show.
      continue;
    } else {
      const text = decodeEntities(token);
      const parent = top();
      const last = parent.children[parent.children.length - 1];
      if (last?.type === "text") last.text += text;
      else parent.children.push({ type: "text", text });
    }
  }
  return root.children;
}

/** Links a post may open: web pages, email and phone numbers. Anything else (javascript:, data:) is plain text. */
export function safeHref(href: string | undefined, base?: string): string | null {
  const v = (href ?? "").trim();
  if (!v) return null;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  // A link to a page of the website itself ("/demo-academy/tutor/schedule").
  if (base && v.startsWith("/") && !v.startsWith("//")) return `${base.replace(/\/+$/, "")}${v}`;
  return null;
}

/** Images a post may show: uploaded files on the web (never inlined data). */
export function safeImageSrc(src: string | undefined): string | null {
  const v = (src ?? "").trim();
  return /^https?:\/\//i.test(v) ? v : null;
}
