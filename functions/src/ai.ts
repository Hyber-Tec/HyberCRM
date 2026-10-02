import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'

/**
 * The AI service key. The app never names the service or model to users: it is
 * always "AI" (DECISIONS §4). Until a real key is set, every AI feature uses its
 * deterministic fallback.
 */
export const geminiKey = defineSecret('GEMINI_API_KEY')
const LOG_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const REPORT_MODEL = process.env.AI_REPORT_MODEL || LOG_MODEL

export interface AiOptions {
  /** Which model tier: the quick per-log one, or the report one. */
  tier?: 'log' | 'report'
  temperature?: number
  timeoutMs?: number
  maxOutputTokens?: number
  /** Extra instruction after the input (a section rewrite or a correction). */
  instruction?: string
}

/** True when a real key is configured. */
export function aiConfigured(): boolean {
  const key = geminiKey.value()
  return !!key && key !== 'unset' && key !== 'not-set'
}

/** Asks the AI for JSON matching `schema`; null when it isn't configured or fails. */
export async function aiJson<T>(system: string, input: unknown, schema: Record<string, unknown>, o: AiOptions = {}): Promise<T | null> {
  if (!aiConfigured()) return null
  const model = o.tier === 'report' ? REPORT_MODEL : LOG_MODEL
  try {
    const parts: { text: string }[] = [{ text: JSON.stringify(input) }]
    if (o.instruction) parts.push({ text: o.instruction })
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey.value()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: o.temperature ?? 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
          ...(o.maxOutputTokens ? { maxOutputTokens: o.maxOutputTokens } : {}),
        },
      }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
    })
    if (!res.ok) {
      logger.warn('AI request failed', res.status, (await res.text()).slice(0, 500))
      return null
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? (JSON.parse(text) as T) : null
  } catch (e) {
    logger.warn('AI call failed', e)
    return null
  }
}
