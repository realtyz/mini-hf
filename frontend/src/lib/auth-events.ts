/**
 * Auth event emitter for cross-cutting auth concerns.
 *
 * Used by the API client to signal logout without a full page reload,
 * so the router layer can perform SPA navigation instead.
 */

const AUTH_LOGOUT_EVENT = "auth:logout";

const emitter = new EventTarget();

export function emitAuthLogout() {
  emitter.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

export function onAuthLogout(callback: () => void): () => void {
  const handler = () => callback();
  emitter.addEventListener(AUTH_LOGOUT_EVENT, handler);
  return () => emitter.removeEventListener(AUTH_LOGOUT_EVENT, handler);
}
