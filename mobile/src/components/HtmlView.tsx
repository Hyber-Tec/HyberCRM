import { Image } from "expo-image";
import { Fragment, memo, useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";
import { type HtmlElement, type HtmlNode, parseHtml, safeHref, safeImageSrc } from "@/components/html";
import { radius, space, useColors, type Colors } from "@/theme";

/**
 * Rich text from the website's announcement editor, drawn with native views: paragraphs, headings, bold, italic,
 * underline, strikethrough, links, bulleted and numbered lists (nested too), quotes, code, line breaks, rules and
 * images. Nothing in it is ever run (src/components/html.ts reads it); links and images are handed to the screen.
 */
export const HtmlView = memo(function HtmlView({
  html,
  onLinkPress,
  onImagePress,
  linkBase,
  fontSize = 16,
  testID,
}: {
  html: string;
  /** A tapped link (only http(s), mailto: and tel: links are links). */
  onLinkPress: (url: string) => void;
  /** A tapped image, to show it large. */
  onImagePress?: (uri: string, alt: string) => void;
  /** Where links like "/demo-academy/…" lead (the website). */
  linkBase?: string;
  fontSize?: number;
  testID?: string;
}) {
  const colors = useColors();
  const nodes = useMemo(() => parseHtml(html), [html]);
  const ctx: Ctx = { colors, fontSize, lineHeight: Math.round(fontSize * 1.5), onLinkPress, onImagePress, linkBase, muted: false, listDepth: 0 };
  return (
    <View style={styles.blocks} testID={testID}>
      {renderBlocks(nodes, ctx, "b")}
    </View>
  );
});

interface Ctx {
  colors: Colors;
  fontSize: number;
  lineHeight: number;
  onLinkPress: (url: string) => void;
  onImagePress?: (uri: string, alt: string) => void;
  linkBase?: string;
  /** Inside a quote: quieter text. */
  muted: boolean;
  listDepth: number;
}

/** Tags that flow inside a line of text. */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "font",
  "i",
  "ins",
  "kbd",
  "label",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "tt",
  "u",
  "var",
]);

function containsBlock(el: HtmlElement): boolean {
  return el.children.some((c) => c.type === "element" && (c.tag === "img" || !INLINE.has(c.tag) || containsBlock(c)));
}

const isInline = (n: HtmlNode) => n.type === "text" || (INLINE.has(n.tag) && !containsBlock(n));

/** Blocks one under the other; runs of inline content between them become paragraphs. */
function renderBlocks(nodes: HtmlNode[], ctx: Ctx, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let run: HtmlNode[] = [];
  const flush = () => {
    if (!run.length) return;
    const para = renderParagraph(run, ctx, `${key}-${out.length}`);
    if (para) out.push(para);
    run = [];
  };
  nodes.forEach((node, i) => {
    if (isInline(node)) {
      run.push(node);
      return;
    }
    flush();
    const block = renderBlock(node as HtmlElement, ctx, `${key}-${i}`);
    if (block) out.push(block);
  });
  flush();
  return out;
}

function renderBlock(el: HtmlElement, ctx: Ctx, key: string): ReactNode {
  const { colors } = ctx;
  switch (el.tag) {
    case "p": {
      // An empty paragraph keeps the space it has on the website (a blank line between blocks).
      if (!el.children.length) return <View key={key} />;
      return containsBlock(el) ? (
        <View key={key} style={styles.blocks}>
          {renderBlocks(el.children, ctx, key)}
        </View>
      ) : (
        renderParagraph(el.children, ctx, key) ?? <View key={key} />
      );
    }
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const size = el.tag === "h1" ? 24 : el.tag === "h2" ? 21 : el.tag === "h3" ? 18 : 16;
      return renderParagraph(el.children, ctx, key, { fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: el.tag === "h1" ? "700" : "600", letterSpacing: size > 18 ? -0.3 : 0, marginTop: 4 }, "header");
    }
    case "ul":
    case "ol":
      return renderList(el, ctx, key);
    case "li":
      // An item outside a list: drawn as a bulleted one.
      return renderList({ ...el, tag: "ul", children: [el] }, ctx, key);
    case "blockquote":
      return (
        <View key={key} style={[styles.quote, { borderLeftColor: colors.border }]}>
          {renderBlocks(el.children, { ...ctx, muted: true }, key)}
        </View>
      );
    case "pre":
      return (
        <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false} style={[styles.pre, { backgroundColor: colors.secondary }]} contentContainerStyle={styles.preContent}>
          <Text selectable style={{ fontFamily: MONO, fontSize: ctx.fontSize - 3, lineHeight: Math.round((ctx.fontSize - 3) * 1.5), color: colors.foreground }}>
            {textOf(el).replace(/\n$/, "")}
          </Text>
        </ScrollView>
      );
    case "hr":
      return <View key={key} style={[styles.rule, { backgroundColor: colors.border }]} />;
    case "img": {
      const uri = safeImageSrc(el.attrs.src);
      if (!uri) return null;
      return <HtmlImage key={key} uri={uri} alt={el.attrs.alt ?? ""} width={Number(el.attrs.width) || 0} height={Number(el.attrs.height) || 0} onPress={ctx.onImagePress} />;
    }
    case "br":
      return null;
    default:
      // Any other container (div, section, figure, table rows…): its content, one block under the other.
      if (!el.children.length) return null;
      return (
        <View key={key} style={styles.blocks}>
          {renderBlocks(el.children, ctx, key)}
        </View>
      );
  }
}

function renderList(el: HtmlElement, ctx: Ctx, key: string): ReactNode {
  const ordered = el.tag === "ol";
  const items = el.children.filter((c): c is HtmlElement => c.type === "element" && c.tag === "li");
  const start = ordered ? Number(el.attrs.start) || 1 : 1;
  const depth = ctx.listDepth;
  const bullet = depth === 0 ? "•" : depth === 1 ? "◦" : "▪";
  const inner: Ctx = { ...ctx, listDepth: depth + 1 };
  const color = ctx.muted ? ctx.colors.mutedForeground : ctx.colors.foreground;
  return (
    <View key={key} style={styles.list} accessibilityRole="list">
      {items.map((li, i) => (
        <View key={`${key}-${i}`} style={styles.item}>
          <Text style={[styles.marker, { width: ordered ? ctx.fontSize * 1.6 : ctx.fontSize * 1.1, fontSize: ctx.fontSize, lineHeight: ctx.lineHeight, color }]} accessibilityElementsHidden importantForAccessibility="no">
            {ordered ? `${start + i}.` : bullet}
          </Text>
          <View style={styles.itemBody}>{renderBlocks(li.children, inner, `${key}-${i}`)}</View>
        </View>
      ))}
    </View>
  );
}

/** One run of text with its marks, after HTML's whitespace rules. */
interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  mark?: boolean;
  small?: boolean;
  href?: string | null;
}

function flatten(nodes: HtmlNode[], marks: Omit<Segment, "text">, ctx: Ctx, out: Segment[]): void {
  for (const n of nodes) {
    if (n.type === "text") {
      out.push({ ...marks, text: n.text.replace(/[ \t\n\r\f]+/g, " ") });
      continue;
    }
    if (n.tag === "br") {
      out.push({ ...marks, text: "\n" });
      continue;
    }
    const next = { ...marks };
    switch (n.tag) {
      case "b":
      case "strong":
        next.bold = true;
        break;
      case "i":
      case "em":
      case "cite":
      case "dfn":
      case "var":
        next.italic = true;
        break;
      case "u":
      case "ins":
        next.underline = true;
        break;
      case "s":
      case "strike":
      case "del":
        next.strike = true;
        break;
      case "code":
      case "kbd":
      case "samp":
      case "tt":
        next.code = true;
        break;
      case "mark":
        next.mark = true;
        break;
      case "small":
      case "sub":
      case "sup":
        next.small = true;
        break;
      case "a":
        next.href = safeHref(n.attrs.href, ctx.linkBase);
        break;
    }
    if (n.tag === "q") out.push({ ...next, text: "“" });
    flatten(n.children, next, ctx, out);
    if (n.tag === "q") out.push({ ...next, text: "”" });
  }
}

/** Collapses spaces as a browser does: none at the start or end of a line, never two in a row. */
function collapse(segments: Segment[]): Segment[] {
  let spaceBefore = true;
  for (const s of segments) {
    if (s.text === "\n") {
      spaceBefore = true;
      continue;
    }
    let t = s.text;
    if (spaceBefore) t = t.replace(/^ +/, "");
    if (t) spaceBefore = t.endsWith(" ");
    s.text = t;
  }
  // No space at the end of a line.
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s.text === "\n") continue;
    s.text = s.text.replace(/ +$/, "");
    if (s.text) break;
  }
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].text === "\n" && segments[i - 1].text !== "\n") segments[i - 1].text = segments[i - 1].text.replace(/ +$/, "");
  }
  return segments.filter((s) => s.text);
}

function renderParagraph(nodes: HtmlNode[], ctx: Ctx, key: string, style?: TextStyle, role?: "header"): ReactNode | null {
  const segments = collapse(
    (() => {
      const out: Segment[] = [];
      flatten(nodes, {}, ctx, out);
      return out;
    })(),
  );
  if (!segments.length) return null;
  const { colors, fontSize, lineHeight } = ctx;
  const base: TextStyle = { fontSize, lineHeight, color: ctx.muted ? colors.mutedForeground : colors.foreground };
  return (
    <Text key={key} selectable style={[base, style]} accessibilityRole={role}>
      {segments.map((s, i) => {
        const deco = [s.underline || s.href ? "underline" : "", s.strike ? "line-through" : ""].filter(Boolean).join(" ") as TextStyle["textDecorationLine"];
        const segStyle: TextStyle = {
          ...(s.bold ? { fontWeight: "700" } : null),
          ...(s.italic ? { fontStyle: "italic" } : null),
          ...(deco ? { textDecorationLine: deco } : null),
          ...(s.code ? { fontFamily: MONO, fontSize: Math.round((style?.fontSize ?? fontSize) * 0.88), backgroundColor: colors.secondary } : null),
          ...(s.mark ? { backgroundColor: colors.warningTint } : null),
          ...(s.small ? { fontSize: Math.round((style?.fontSize ?? fontSize) * 0.8) } : null),
          ...(s.href ? { color: colors.info } : null),
        };
        const href = s.href;
        return href ? (
          <Text key={i} style={segStyle} onPress={() => ctx.onLinkPress(href)} accessibilityRole="link" suppressHighlighting={false}>
            {s.text}
          </Text>
        ) : Object.keys(segStyle).length ? (
          <Text key={i} style={segStyle}>
            {s.text}
          </Text>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        );
      })}
    </Text>
  );
}

function textOf(node: HtmlNode): string {
  if (node.type === "text") return node.text;
  if (node.tag === "br") return "\n";
  return node.children.map(textOf).join("");
}

/** A full-width picture at its own proportions (known once it loads); tap to see it large. */
function HtmlImage({ uri, alt, width, height, onPress }: { uri: string; alt: string; width: number; height: number; onPress?: (uri: string, alt: string) => void }) {
  const colors = useColors();
  const [ratio, setRatio] = useState(width > 0 && height > 0 ? width / height : 16 / 10);
  const [failed, setFailed] = useState(false);
  const image = (
    <Image
      source={{ uri }}
      style={[styles.image, { aspectRatio: ratio, backgroundColor: colors.secondary, borderColor: colors.border }]}
      contentFit="cover"
      transition={150}
      accessibilityLabel={alt || "Image"}
      onLoad={(e) => {
        if (e.source.width > 0 && e.source.height > 0) setRatio(e.source.width / e.source.height);
      }}
      onError={() => setFailed(true)}
    />
  );
  if (failed)
    return (
      <View style={[styles.image, styles.failed, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{alt ? `Couldn’t load “${alt}”` : "Couldn’t load this image"}</Text>
      </View>
    );
  if (!onPress) return image;
  return (
    <Pressable
      onPress={() => onPress(uri, alt)}
      testID="html-image"
      accessibilityRole="imagebutton"
      accessibilityLabel={alt ? `${alt}, open image` : "Open image"}
      accessibilityHint="Shows the image full screen"
      style={({ pressed }) => pressed && { opacity: 0.85 }}
    >
      {image}
    </Pressable>
  );
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const styles = StyleSheet.create({
  blocks: { gap: space.md },
  list: { gap: space.xs },
  item: { flexDirection: "row" },
  marker: { textAlign: "left", fontVariant: ["tabular-nums"] },
  itemBody: { flex: 1, gap: space.xs },
  quote: { borderLeftWidth: 3, paddingLeft: space.md, gap: space.sm },
  pre: { borderRadius: radius.md },
  preContent: { padding: space.md },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  image: { width: "100%", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  failed: { height: 72, alignItems: "center", justifyContent: "center" },
});
