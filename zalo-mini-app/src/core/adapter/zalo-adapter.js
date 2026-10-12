// Zalo adapter — chế độ production. Nối backend thật theo
// docs/features/f01/api.md (F01: đăng nhập Zalo + kết nối hai phía).
//
// Quy tắc giữ nguyên từ nền tảng US-003:
// - SDK zmp chỉ được gọi trong môi trường Zalo thật (assertZaloHost) và chỉ
//   thông qua file adapter này — KHÔNG import zmp-sdk trong components/pages.
// - KHÔNG fallback tự động sang mock; lỗi ném ra để UI hiển thị thật.
// - Token phiên nằm trong memory (core/session.js), không vào storage/URL.
//
// Lưu ý SDK (zmp-sdk 2.53.0, checked 2026-10-13):
// - getAccessToken() -> Promise<string>; từ SDK 2.35.0 lấy ID không cần xác
//   nhận. Trên localhost SDK trả "" — assertZaloHost chặn trước, không tin.
// - F01 chỉ cần ID tối thiểu: không getUserInfo (mock cứng trên localhost),
//   không getPhoneNumber, không followOA.

import { ApiError, createApiClient } from "../api/client.mjs";
import { isZaloHost } from "../config.js";
import {
  clearSession, getToken, getSession, hasLiveSession, setSession,
} from "../session.js";

const TIMEOUT_MS = 15000;

export function createZaloAdapter({ baseUrl } = {}) {
  const request = createApiClient({ baseUrl, getToken, timeoutMs: TIMEOUT_MS });

  function requireBaseUrl() {
    // Thiếu cấu hình là lỗi kind "configuration" — KHÔNG phải timeout/mạng,
    // dù status = 0 (status 0 chỉ nghĩa "không có HTTP status").
    if (!baseUrl) {
      throw new ApiError(
        "Chưa cấu hình địa chỉ máy chủ. Thêm VITE_API_BASE_URL khi build.",
        0,
        "configuration",
      );
    }
  }

  // Wrapper cho các call cần đăng nhập: nhận 401 từ backend nghĩa là phiên
  // hết hạn/thu hồi/user bị vô hiệu — xóa phiên trong memory để UI dẫn về
  // đăng nhập. Không tự retry (không gọi lại getAccessToken ngầm).
  async function authed(run) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
      }
      throw error;
    }
  }

  return {
    mode: "zalo",

    async getBackendHealth() {
      requireBaseUrl();
      const data = await request("/api/v1/health/");
      return data && data.status === "ok" ? "ok" : "unknown";
    },

    async getBackendReady() {
      requireBaseUrl();
      try {
        const data = await request("/api/v1/ready/");
        return data && data.status === "ok" ? "ok" : "unknown";
      } catch (error) {
        // 503 {"status":"unavailable"} là trạng thái HỢP LỆ của ready,
        // không phải lỗi mạng — trả về trạng thái để UI hiển thị đúng.
        if (error instanceof ApiError && error.status === 503) return "unavailable";
        throw error;
      }
    },

    /**
     * BOUNDARY cũ giữ lại cho trang home nền tảng: trạng thái kết nối của
     * bản foundation là dữ liệu fixture (demo). Bản production dùng
     * listConnections() bên dưới.
     */
    async getConnectionStatus() {
      throw new ApiError("Tính năng kết nối chưa được triển khai ở bản nền tảng.", 501, "http");
    },

    /** BOUNDARY: không dùng getUserInfo — SDK localhost trả mock cứng. */
    async getProfile() {
      throw new ApiError("Định danh người dùng chưa được triển khai ở bản nền tảng.", 501, "http");
    },

    /** Helper: chỉ cho phép gọi SDK trong Zalo thật. */
    assertZaloHost() {
      if (!isZaloHost()) {
        throw new ApiError("Tính năng này chỉ hoạt động trong Zalo.", 0, "configuration");
      }
    },

    // ------------------------- F01: đăng nhập -------------------------------

    /**
     * Đăng nhập: getAccessToken (SDK) -> POST /api/v1/auth/session.
     * Backend tự xác minh với Zalo (appsecret_proof) rồi cấp phiên.
     * Không bao giờ gửi role/id/tên tự nhận từ client.
     */
    async loginWithZaloToken() {
      requireBaseUrl();
      this.assertZaloHost();
      let accessToken = null;
      try {
        const sdk = await import("zmp-sdk");
        accessToken = await sdk.getAccessToken();
      } catch (error) {
        throw new ApiError(
          "Không gọi được Zalo để lấy phiên đăng nhập. Vui lòng thử lại.",
          0,
          "configuration",
        );
      }
      if (typeof accessToken !== "string" || !accessToken) {
        throw new ApiError(
          "Chưa lấy được phiên đăng nhập từ Zalo. Vui lòng thử lại.",
          0,
          "configuration",
        );
      }
      const data = await request("/api/v1/auth/session", {
        method: "POST",
        body: { access_token: accessToken },
      });
      if (!data || typeof data.token !== "string" || !data.token) {
        throw new ApiError("Backend trả về phiên không hợp lệ.", 0, "invalid_response");
      }
      setSession({
        token: data.token,
        userId: data.user && data.user.id,
        expiresAt: data.expires_at,
        consentsRequired: data.consents_required,
      });
      return {
        userId: getSession().userId,
        expiresAt: getSession().expiresAt,
        consentsRequired: getSession().consentsRequired || [],
      };
    },

    /**
     * Đăng nhập lại im lặng lúc mở app (một lần/phiên chạy, không lặp).
     * Trả true khi có phiên sống sau lần thử này; không ném lỗi ra ngoài.
     */
    async trySilentLogin() {
      if (hasLiveSession()) return true;
      try {
        await this.loginWithZaloToken();
        return true;
      } catch {
        return false;
      }
    },

    async logout() {
      requireBaseUrl();
      const token = getToken();
      if (token) {
        try {
          await request("/api/v1/auth/logout", { method: "POST", body: {} });
        } finally {
          clearSession();
        }
        return true;
      }
      clearSession();
      return false;
    },

    // ------------------------- F01: đồng ý ----------------------------------

    async listConsents() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/consents"));
      return data && Array.isArray(data.consents) ? data.consents : [];
    },

    async recordConsent({ purpose, policyVersion, decision }) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/consents", {
        method: "POST",
        body: {
          purpose,
          policy_version: policyVersion,
          decision,
        },
      }));
      return data;
    },

    // ------------------------- F01: lời mời ---------------------------------

    async createInvite({ relationshipKind = "primary" } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/connections/invites", {
        method: "POST",
        body: { relationship_kind: relationshipKind },
      }));
      return data; // { invite_id, code (hiện MỘT lần), expires_at, status }
    },

    async listInvites() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/connections/invites"));
      return data && Array.isArray(data.results) ? data.results : [];
    },

    async claimInvite(code) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/connections/invites/claim", {
        method: "POST",
        body: { code },
      }));
      return data; // display_for
    },

    async confirmInvite(inviteId, { expectedRevision = null } = {}) {
      requireBaseUrl();
      const body = expectedRevision === null || expectedRevision === undefined
        ? {}
        : { expected_revision: expectedRevision };
      const data = await authed(() =>
        request(`/api/v1/connections/invites/${encodeURIComponent(inviteId)}/confirm`, {
          method: "POST",
          body,
        }));
      return data; // { invite, connection }
    },

    async declineInvite(inviteId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/connections/invites/${encodeURIComponent(inviteId)}/decline`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    async cancelInvite(inviteId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/connections/invites/${encodeURIComponent(inviteId)}/cancel`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    // ------------------------- F01: kết nối ---------------------------------

    async listConnections() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/connections"));
      return data && Array.isArray(data.results) ? data.results : [];
    },

    async revokeConnection(connectionId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/connections/${encodeURIComponent(connectionId)}/revoke`, {
          method: "POST",
          body: {},
        }));
      return data; // { connection_id, status, revoked_at, generation, note }
    },
  };
}
