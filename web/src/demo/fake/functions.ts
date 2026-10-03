/**
 * Stand-in for `firebase/functions` in the demo build. Callables the demo can
 * run in the browser are registered by `src/demo/callables.ts`; the rest
 * (email, AI) answer with a friendly "not in the demo" error.
 */

type Handler = (data: unknown) => Promise<unknown>

const handlers = new Map<string, Handler>()

export const NOT_IN_DEMO = 'This works in your own center. The demo doesn’t send emails or run server tasks.'

export function registerCallable(name: string, handler: Handler) {
  handlers.set(name, handler)
}

export function getFunctions() {
  return {}
}

export function connectFunctionsEmulator() {}

export function httpsCallable(_functions: unknown, name: string) {
  return async (data: unknown) => {
    const handler = handlers.get(name)
    // A short pause, so spinners and "Saving…" states read like the real thing.
    await new Promise((r) => setTimeout(r, 350))
    if (!handler) throw Object.assign(new Error(NOT_IN_DEMO), { code: 'functions/unavailable' })
    return { data: await handler(data) }
  }
}
