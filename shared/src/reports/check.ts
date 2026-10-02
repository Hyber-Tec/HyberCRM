import type { NarrativeKey, PreviousGoal, ProgressLevel, ReportFacts, ReportGoal, ReportNarrative } from './types'

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

/** Plain sentence text: no Markdown, bullets, emojis or wrapping quotes; ends with punctuation. */
export function cleanText(s: unknown): string {
  let t = String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(EMOJI, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
  t = t.replace(/^["“”']+|["“”']+$/g, '').trim()
  // One paragraph per section: line breaks become spaces.
  t = t.replace(/\s*\n\s*/g, ' ')
  if (t && !/[.!?…]$/.test(t)) t = `${t}.`
  return t.replace(/!/g, '.').replace(/\.\.+$/, '.')
}

/** Cuts text to at most `max` words, at a sentence boundary when possible. */
export function capWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= max) return text
  const sentences = text.match(/[^.?]+[.?]+/g) ?? [text]
  let out = ''
  for (const s of sentences) {
    const next = `${out}${s}`.trim()
    if (next.split(/\s+/).length > max) break
    out = `${next} `
  }
  return out.trim() || `${words.slice(0, max).join(' ').replace(/[,;:]$/, '')}.`
}

const WORD_CAPS: Partial<Record<NarrativeKey, number>> = { overview: 90, academicProgress: 130, practice: 60, engagement: 80, homework: 80, tutorNote: 90 }

function list(items: unknown, max: number, words = 30): string[] {
  const out: string[] = []
  for (const x of Array.isArray(items) ? items : []) {
    const t = capWords(cleanText(x), words)
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out.slice(0, max)
}

/** Normalizes AI (or edited) sections: plain text, item counts and length caps. */
export function sanitizeNarrative(raw: Partial<Record<NarrativeKey, unknown>>): ReportNarrative {
  const text = (k: NarrativeKey) => capWords(cleanText(raw[k]), WORD_CAPS[k] ?? 80)
  const goals: ReportGoal[] = []
  for (const g of Array.isArray(raw.goals) ? raw.goals : []) {
    const goal = capWords(cleanText((g as ReportGoal)?.goal), 30)
    const measure = capWords(cleanText((g as ReportGoal)?.measure), 30)
    if (goal && !goals.some((x) => x.goal.toLowerCase() === goal.toLowerCase())) goals.push({ goal, measure })
  }
  const previousGoals: PreviousGoal[] = []
  for (const g of Array.isArray(raw.previousGoals) ? raw.previousGoals : []) {
    const p = g as PreviousGoal
    const goal = cleanText(p?.goal)
    if (!goal) continue
    previousGoals.push({ goal, status: p.status === 'met' || p.status === 'progress' ? p.status : 'not_yet', note: capWords(cleanText(p.note), 30) })
  }
  return {
    overview: text('overview'),
    academicProgress: text('academicProgress'),
    practice: text('practice'),
    engagement: text('engagement'),
    homework: text('homework'),
    strengths: list(raw.strengths, 4),
    focusAreas: list(raw.focusAreas, 3),
    goals: goals.slice(0, 4),
    previousGoals,
    homeSupport: list(raw.homeSupport, 3),
    tutorNote: text('tutorNote'),
  }
}

/** Every number the facts (and the previous report) hold, for the numbers check. */
function factNumbers(facts: ReportFacts): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.add(String(v))
      out.add(String(Math.round(v)))
      out.add(v.toFixed(1))
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(facts)
  return out
}

// "system" and "model" stay allowed: math and science topics use them ("systems of equations").
const BLOCKED = /\b(ai|a\.i\.|artificial intelligence|language model|logs?|logged|flags?|flagged|risk|at-risk|ratings?|stars?|out of 5|gemini|gpt|chatgpt|openai|claude|anthropic|llm)\b/gi
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}\b/gi

/**
 * Checks written sections against the facts. Returns, per section, why it needs
 * a second look: numbers that aren't in the facts, words families shouldn't see
 * (AI, risk, rating…), or a tone that contradicts the status.
 */
export function checkNarrative(n: ReportNarrative, facts: ReportFacts, level: ProgressLevel | null, studentFirstName = ''): Partial<Record<NarrativeKey, string[]>> {
  const allowed = factNumbers(facts)
  const topics = facts.skills.flatMap((a) => [a.area, ...a.skills.map((s) => s.name)]).filter((t) => t.length > 3)
  const out: Partial<Record<NarrativeKey, string[]>> = {}
  const texts: [NarrativeKey, string][] = [
    ['overview', n.overview],
    ['academicProgress', n.academicProgress],
    ['practice', n.practice],
    ['engagement', n.engagement],
    ['homework', n.homework],
    ['strengths', n.strengths.join(' ')],
    ['focusAreas', n.focusAreas.join(' ')],
    ['goals', n.goals.map((g) => `${g.goal} ${g.measure}`).join(' ')],
    ['previousGoals', n.previousGoals.map((g) => `${g.goal} ${g.note}`).join(' ')],
    ['homeSupport', n.homeSupport.join(' ')],
    ['tutorNote', n.tutorNote],
  ]
  for (const [key, raw] of texts) {
    if (!raw) continue
    const reasons: string[] = []
    // Topic names copied from the notes may contain blocked words ("Evaluation of Models").
    let text = raw
    for (const t of topics) text = text.split(t).join(' ')
    if (studentFirstName) text = text.split(studentFirstName).join(' ')
    const dateless = text.replace(MONTHS, ' ')
    const numbers = dateless.match(/\d+(?:\.\d+)?/g) ?? []
    // Goals may set targets ("85% accuracy"); everywhere else numbers must come from the facts.
    if (key !== 'goals' && key !== 'previousGoals') {
      const bad = numbers.filter((x) => !allowed.has(x) && !allowed.has(String(Number(x))))
      if (bad.length) reasons.push(`Numbers not found in the report’s figures: ${[...new Set(bad)].join(', ')}`)
    }
    const words = [...new Set((text.match(BLOCKED) ?? []).map((w) => w.toLowerCase()))]
    if (words.length) reasons.push(`Words families shouldn’t see: ${words.join(', ')}`)
    if (level && level !== 'on_track' && /\bon track\b/i.test(text)) reasons.push('Says “on track”, but the status is not On track')
    if (level === 'on_track' && /\b(concerning|worrying|alarming|struggling badly|failing)\b/i.test(text)) reasons.push('Sounds alarmed, but the status is On track')
    if (reasons.length) out[key] = reasons
  }
  return out
}
