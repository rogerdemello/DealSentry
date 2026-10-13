/**
 * A tiny pub/sub so the HTTP layer can tell the session store that the server
 * demanded a sign-in (401 AUTH_REQUIRED), without api-client importing React code.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to "sign-in required". Returns an unsubscribe function. */
export function onAuthRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAuthRequired(): void {
  listeners.forEach((listener) => listener());
}
