// SDK bridge — the ONLY place feature modules touch the Zalo SDK.
// Adapter interface (mocked in preview/tests, real on device):
//   getAccessToken(): Promise<string|null>
//   getUserProfile(): Promise<{ id: string, name: string|null, avatar: string|null }>
//     — id stays a STRING (never Number) — Zalo ids are opaque.
//   openPhone(phone): Promise<unknown>  // user-initiated call screen only;
//     resolution does NOT mean the call was answered (contract).
//   storageGet(key)/storageSet(key, value)/storageRemove(key)
//     — SDK storage via adapter; never localStorage/sessionStorage for
//     private data (SEC-10; Zalo does not guarantee web storage).
//
// Private content must never be cached in public storage. If a safe draft
// store is unavailable, features must say so instead of silently storing
// plaintext (master prompt §6.3).

export function createMockAdapter({ delayMs = 0, initialToken = "mock-token" } = {}) {
  const storage = new Map();
  const wait = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  return {
    kind: "mock",
    async getAccessToken() { await wait(delayMs); return initialToken; },
    async getUserProfile() {
      await wait(delayMs);
      return { id: "mock-zalo-id", name: "Người dùng thử (mock)", avatar: null };
    },
    async openPhone(phone) { await wait(delayMs); return { mocked: true, phone }; },
    async storageGet(key) { await wait(delayMs); return storage.has(key) ? storage.get(key) : null; },
    async storageSet(key, value) { await wait(delayMs); storage.set(key, value); },
    async storageRemove(key) { await wait(delayMs); storage.delete(key); },
  };
}

export function createZaloAdapter({ zmp } = {}) {
  // zmp = window.ZMPFlutter? No — the zmp-sdk global provided by the host.
  // On the real Mini App, zmp-sdk is bundled by the app shell; this adapter
  // only wraps calls and normalizes errors. Never import React bindings.
  if (!zmp) {
    throw new Error("zmp-sdk not available; use createMockAdapter in preview");
  }
  return {
    kind: "zalo",
    async getAccessToken() {
      const login = await zmp.login({ scope: "" }); // scope per permission guide
      if (!login || !login.accessToken) return null;
      return login.accessToken;
    },
    async getUserProfile() {
      const info = await zmp.getUserInfo({ autoRequestPermission: false });
      const userInfo = info && info.userInfo ? info.userInfo : {};
      return {
        id: String(userInfo.id ?? ""),
        name: userInfo.name ?? null,
        avatar: userInfo.avatar ?? null,
      };
    },
    async openPhone(phone) {
      // Only called from a user tap; result does not imply call answered.
      return zmp.openPhone({ phoneNumber: phone });
    },
    async storageGet(key) { return zmp.getStorage({ key }).then((r) => (r ? r.data : null)); },
    async storageSet(key, value) { return zmp.setStorage({ key, data: value }); },
    async storageRemove(key) { return zmp.removeStorage({ key }); },
  };
}

export function createSdkBridge({ adapter }) {
  if (!adapter) throw new Error("adapter required");
  return {
    adapter,
    isMock: adapter.kind === "mock",
    async authenticatedToken() { return adapter.getAccessToken(); },
  };
}
