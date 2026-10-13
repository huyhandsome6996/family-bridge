// Mock adapter — fixtures synthetic, CHỈ chạy khi demo mode bật rõ ràng.
// Dữ liệu minh họa có nhãn "Dữ liệu minh họa" ở tầng UI (demo-banner).
// Không lưu token/session giả như session thật; không phát sinh connection
// hoặc grant thật khi hiển thị trạng thái "đã kết nối".

import { ApiError } from "../api/client.mjs";
import { fixtures } from "../fixtures/index.js";
import {
  clearSession, getSession, hasLiveSession, setSession,
} from "../session.js";
import { CONSENT_ORDER } from "../policy.js";

const DEFAULT_LATENCY_MS = 450;
const TIMEOUT_MS = 4000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Mã demo cố định để luồng claim có thể diễn ra mà không cần backend.
const DEMO_CLAIMABLE_CODE = "DEMODEMO1234";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * scenario: null | "ok" | "error" | "timeout"
 *  - null: dùng hành vi chuẩn (ok).
 *  - "error": server trả 503 unavailable (mô phỏng ready thất bại).
 *  - "timeout": không trả lời trong thời gian chờ.
 * Chỉ có hiệu lực với mock adapter, được bật RÕ qua UI demo/query param.
 */
export function createMockAdapter({ scenario = null } = {}) {
  const pick = (fallback) => (scenario ?? fallback ?? "ok");

  // State minh họa trong phạm vi adapter (reset khi rebuildAdapter) — không
  // bao giờ là dữ liệu thật, không rời khỏi bộ nhớ tab hiện tại.
  const invites = new Map();
  const connections = [
    {
      connection_id: "demo-connection-1",
      other_party_id: "demo-peer-fixture",
      relationship_kind: "primary",
      generation: 1,
      status: "active",
      counterpart: { display_name: fixtures.demoPeer.displayLabel, identity_basis: "self_declared" },
    },
  ];
  const consents = new Map();
  let myDisplayName = null; // tên tự khai báo demo (fixture, trong bộ nhớ)

  async function simulate({ kind, fallback }) {
    const mode = pick(fallback);
    if (mode === "timeout") {
      await wait(TIMEOUT_MS + 500); // vượt quá timeoutMs của ApiClient-style guard
      throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
    }
    await wait(DEFAULT_LATENCY_MS);
    if (mode === "error") {
      throw new ApiError(
        kind === "ready"
          ? "Máy chủ chưa sẵn sàng (dữ liệu minh họa)."
          : "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
        503,
        "http",
      );
    }
    return true;
  }

  return {
    mode: "mock",

    async getBackendHealth() {
      await simulate({ kind: "health", fallback: "ok" });
      return "ok"; // GET /api/v1/health/ -> {"status":"ok"}
    },

    async getBackendReady() {
      await simulate({ kind: "ready", fallback: "ok" });
      return "ok"; // GET /api/v1/ready/ -> {"status":"ok"} hoặc 503 unavailable
    },

    /**
     * Trạng thái kết nối gia đình ở chế độ demo: fixture, KHÔNG tạo
     * connection/grant/session thật. Cả hai vai trò demo đều gắn với
     * tài khoản minh họa "đã kết nối" để xem trước home đã kết nối.
     */
    async getConnectionStatus() {
      await wait(200);
      return { connected: true, peer: fixtures.demoPeer, source: "fixture" };
    },

    async getProfile(role) {
      await wait(200);
      return { ...fixtures.demoProfile(role), source: "fixture" };
    },

    // ------------------------- F01 (bản demo) --------------------------------
    // Mọi kết quả đều là dữ liệu minh họa trong bộ nhớ adapter — KHÔNG có
    // phiên/lời mời/kết nối thật, không gọi mạng, không lưu storage.

    async loginWithZaloToken() {
      await wait(200);
      setSession({
        token: "demo-token-not-real",
        userId: "demo-user-fixture",
        expiresAt: Date.now() + 24 * 3600 * 1000,
        consentsRequired: ["service", "ai_processing", "research"],
      });
      return {
        userId: getSession().userId,
        expiresAt: getSession().expiresAt,
        consentsRequired: getSession().consentsRequired || [],
        source: "fixture",
      };
    },

    async trySilentLogin() {
      return hasLiveSession();
    },

    // Danh tính tự khai báo (demo): đối xứng với GET/PUT /api/v1/auth/me.
    async getMyProfile() {
      await wait(100);
      return {
        user_id: "demo-user-fixture",
        display_name: myDisplayName,
        identity_basis: "self_declared",
        source: "fixture",
      };
    },

    async updateMyProfile({ displayName } = {}) {
      await wait(150);
      const text = String(displayName || "").trim().slice(0, 80);
      if (!text) {
        throw new ApiError("Tên gọi không được bỏ trống (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "display_name", reason: "too_short" } });
      }
      myDisplayName = text;
      return {
        user_id: "demo-user-fixture",
        display_name: myDisplayName,
        identity_basis: "self_declared",
        source: "fixture",
      };
    },

    async logout() {
      await wait(150);
      clearSession();
      return true;
    },

    async listConsents() {
      await wait(150);
      return CONSENT_ORDER.map((purpose) => {
        const recorded = consents.get(purpose);
        return recorded
          ? { purpose, decision: recorded.decision, policy_version: recorded.version, withdrawn: false }
          : { purpose, decision: "none", policy_version: null, withdrawn: false };
      });
    },

    async recordConsent({ purpose, policyVersion, decision }) {
      await wait(150);
      consents.set(purpose, { version: policyVersion, decision });
      return { consent_id: `demo-consent-${purpose}`, purpose, policy_version: policyVersion, decision, recorded_at: new Date().toISOString(), source: "fixture" };
    },

    async createInvite({ relationshipKind = "primary" } = {}) {
      await simulate({ kind: "invite", fallback: "ok" });
      // Tạo mã mới thì các mã mở cũ của người tạo chuyển sang đã hủy (giống backend).
      for (const invite of invites.values()) {
        if (invite.role === "inviter" && (invite.status === "pending" || invite.status === "awaiting_confirmation")) {
          invite.status = "canceled";
        }
      }
      const id = `demo-invite-${invites.size + 1}`;
      const code = Array.from({ length: 12 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
      const invite = {
        invite_id: id,
        relationship_kind: relationshipKind,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        role: "inviter",
        revision: 1,
        counterpart: null,
      };
      invites.set(id, invite);
      return { invite_id: id, code, expires_at: invite.expires_at, status: "pending", source: "fixture" };
    },

    async listInvites() {
      await wait(150);
      return Array.from(invites.values()).map((invite) => ({ ...invite }));
    },

    /** Kiểm tra mã TRƯỚC khi chấp nhận (demo): chỉ mã fixture hợp lệ. */
    async previewInvite(code) {
      await simulate({ kind: "claim", fallback: "ok" });
      const normalized = String(code || "").trim().toUpperCase();
      if (normalized !== DEMO_CLAIMABLE_CODE) {
        throw new ApiError("Mã không đúng hoặc đã hết hạn (dữ liệu minh họa).", 404, "http", { code: "not_found", details: { reason: "invalid_or_expired_code" } });
      }
      return {
        invite_id: "demo-invite-claimed",
        relationship_kind: "primary",
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        counterpart: { display_name: fixtures.demoPeer.displayLabel, identity_basis: "self_declared" },
        identity_basis: "self_declared",
        source: "fixture",
      };
    },

    async claimInvite(code) {
      await simulate({ kind: "claim", fallback: "ok" });
      const normalized = String(code || "").trim().toUpperCase();
      if (normalized !== DEMO_CLAIMABLE_CODE) {
        throw new ApiError("Mã không đúng hoặc đã hết hạn (dữ liệu minh họa).", 404, "http", { code: "not_found", details: { reason: "invalid_or_expired_code" } });
      }
      const id = "demo-invite-claimed";
      if (!invites.has(id)) {
        invites.set(id, {
          invite_id: id,
          relationship_kind: "primary",
          status: "awaiting_confirmation",
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          role: "candidate",
          revision: 2,
          counterpart: { display_name: fixtures.demoPeer.displayLabel, identity_basis: "self_declared" },
        });
      }
      const invite = invites.get(id);
      invite.status = "awaiting_confirmation";
      return { invite_id: id, relationship_kind: invite.relationship_kind, status: invite.status, expires_at: invite.expires_at, role: "candidate", revision: invite.revision, counterpart: { ...invite.counterpart }, source: "fixture" };
    },

    async confirmInvite(inviteId, { expectedRevision = null } = {}) {
      await simulate({ kind: "confirm", fallback: "ok" });
      const invite = invites.get(inviteId);
      if (!invite || invite.role !== "inviter" || invite.status !== "awaiting_confirmation") {
        throw new ApiError("Lời mời không thể xác nhận (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "invite_not_confirmable" } });
      }
      invite.status = "active";
      return {
        invite: { invite_id: invite.invite_id, status: invite.status, role: "inviter" },
        connection: { connection_id: `demo-connection-${connections.length + 1}`, status: "active", relationship_kind: invite.relationship_kind, generation: 1 },
        source: "fixture",
      };
    },

    async declineInvite(inviteId) {
      await wait(150);
      const invite = invites.get(inviteId);
      if (invite) invite.status = "declined";
      return { invite_id: inviteId, status: "declined", role: "candidate", source: "fixture" };
    },

    async cancelInvite(inviteId) {
      await wait(150);
      const invite = invites.get(inviteId);
      if (invite) invite.status = "canceled";
      return { invite_id: inviteId, status: "canceled", role: "inviter", source: "fixture" };
    },

    async listConnections() {
      await wait(150);
      return connections.map((connection) => ({ ...connection }));
    },

    async revokeConnection(connectionId) {
      await simulate({ kind: "revoke", fallback: "ok" });
      const index = connections.findIndex((c) => c.connection_id === connectionId);
      if (index >= 0) connections.splice(index, 1);
      return {
        connection_id: connectionId,
        status: "revoked",
        revoked_at: new Date().toISOString(),
        generation: 1,
        note: "Kết nối mới phải qua lời mời hai bên; quyền đã thu hồi không hồi sinh.",
        source: "fixture",
      };
    },
  };
}
