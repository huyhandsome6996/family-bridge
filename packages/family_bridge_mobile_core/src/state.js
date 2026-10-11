// Tiny observable store with bounded window (DSA-05/DSA budget: UI history
// window max 200 metadata items; evict oldest, keep cursor — no endless
// append). Business state NEVER lives in DOM and vice versa.

const MAX_WINDOW = 200;

export function createStore({ initialState = {} } = {}) {
  let state = { ...initialState };
  const listeners = new Set();

  function notify() {
    for (const listener of Array.from(listeners)) {
      try { listener(state); } catch { /* isolate listener errors */ }
    }
  }

  return {
    get() { return state; },
    set(patch) {
      state = { ...state, ...patch };
      if (Array.isArray(state.items) && state.items.length > MAX_WINDOW) {
        state = { ...state, items: state.items.slice(-MAX_WINDOW) };
      }
      notify();
    },
    appendItems(items) {
      const merged = [...(state.items || []), ...items];
      state = { ...state, items: merged.slice(-MAX_WINDOW) };
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
