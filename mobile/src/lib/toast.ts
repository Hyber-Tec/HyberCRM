/**
 * Short messages at the top of the screen, as the website's toasts (sonner): what happened, and now and then a
 * button to act on it. Kept in a small store so anything can show one.
 */
export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  /** Tapping the toast itself (a notification that arrived while the app was open opens its screen). */
  onPress?: () => void;
  /** How long it stays, in milliseconds. */
  duration: number;
}

type Listener = (toasts: Toast[]) => void;
type Options = { description?: string; action?: Toast["action"]; onPress?: () => void; duration?: number };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

function show(kind: ToastKind, title: string, opts: Options = {}): number {
  const t: Toast = { id: nextId++, kind, title, description: opts.description, action: opts.action, onPress: opts.onPress, duration: opts.duration ?? (kind === "error" ? 6000 : 4000) };
  // One at a time reads best on a phone: the newest replaces the rest.
  toasts = [t];
  emit();
  return t.id;
}

export const toast = Object.assign((title: string, opts?: Options) => show("info", title, opts), {
  success: (title: string, opts?: Options) => show("success", title, opts),
  error: (title: string, opts?: Options) => show("error", title, opts),
  info: (title: string, opts?: Options) => show("info", title, opts),
  dismiss(id: number): void {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(toasts);
    return () => listeners.delete(listener);
  },
});
