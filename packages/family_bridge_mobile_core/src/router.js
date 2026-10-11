// Minimal hash router with mount/unmount cleanup contract.
// Route modules export an async factory:
//   export async function createPage({ root, params, ctx }) {
//     ...build DOM...
//     return { el, destroy() { /* remove listeners/timers/requests */ } };
//   }
// Navigation cancels the previous page via destroy() BEFORE mounting next.

export function createRouter({ root, routes, notFound }) {
  if (!root || !routes) throw new Error("root and routes required");
  let current = null;
  let guards = [];

  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#/, "");
    const [path, queryString] = raw.split("?");
    const params = {};
    if (queryString) {
      for (const pair of queryString.split("&")) {
        const [k, v] = pair.split("=");
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
      }
    }
    return { path: path || "/", params };
  }

  function match(path) {
    if (routes[path]) return { factory: routes[path], params: {} };
    for (const pattern of Object.keys(routes)) {
      const names = [];
      const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, (m) => {
        names.push(m.slice(1));
        return "([^/]+)";
      }) + "$");
      const found = path.match(regex);
      if (found) {
        const params = {};
        names.forEach((name, i) => { params[name] = decodeURIComponent(found[i + 1]); });
        return { factory: routes[pattern], params };
      }
    }
    return null;
  }

  async function render() {
    const { path, params } = parseHash();
    if (current && typeof current.destroy === "function") {
      try { current.destroy(); } catch { /* cleanup must not block nav */ }
      current = null;
    }
    root.replaceChildren();
    for (const guard of guards) {
      const decision = await guard({ path, params });
      if (decision && decision.redirect) {
        location.hash = decision.redirect;
        return;
      }
    }
    const matched = match(path);
    const factory = matched ? matched.factory : notFound;
    const page = await factory({ root, params, path });
    const el = page && page.el ? page.el : document.createElement("div");
    root.appendChild(el);
    current = page || { el, destroy() {} };
  }

  return {
    start() {
      window.addEventListener("hashchange", render);
      return render();
    },
    stop() {
      window.removeEventListener("hashchange", render);
      if (current && typeof current.destroy === "function") current.destroy();
      current = null;
    },
    navigate(path) { location.hash = path; },
    addGuard(guard) { guards.push(guard); return () => { guards = guards.filter((g) => g !== guard); }; },
  };
}
