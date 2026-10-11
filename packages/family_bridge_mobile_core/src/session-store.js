// Session store — token + actor + role, with hard clear().
// Revoke/unlink/logout/actor switch MUST call clear() to purge private state
// and cancel in-flight UI state (access matrix: "Thu hồi và cache").

const PRIVATE_KEYS = ["token", "actor", "role", "pendingPreview"];

export function createSessionStore() {
  let state = { token: null, actor: null, role: null };
  const listeners = new Set();

  function notify(prev) {
    for (const listener of Array.from(listeners)) {
      try { listener(state, prev); } catch (err) { /* listener must not crash app */ }
    }
  }

  return {
    get() { return state; },
    set(patch) {
      const prev = state;
      state = Object.freeze({ ...state, ...patch });
      notify(prev);
    },
    clear() {
      const prev = state;
      state = { token: null, actor: null, role: null };
      // Best-effort wipe of any private keys accidentally stored on window.
      for (const key of PRIVATE_KEYS) {
        try { delete window[`__fb_${key}`]; } catch { /* noop */ }
      }
      notify(prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
