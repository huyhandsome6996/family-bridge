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
  clearSession, clearSessionIfUnchanged, getSession, getSessionGeneration,
  getToken, hasLiveSession, setSession,
} from "../session.js";

const TIMEOUT_MS = 15000;

/** Đường SDK mặc định: zmp-sdk chỉ được import động trong môi trường Zalo. */
async function defaultGetSdkAccessToken() {
  const sdk = await import("zmp-sdk");
  return sdk.getAccessToken();
}

export function createZaloAdapter({ baseUrl, getSdkAccessToken = defaultGetSdkAccessToken } = {}) {
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

  // Lỗi "kết quả lỗi thời do phiên đã đổi" — dùng chung cho login/authed.
  // KHÔNG báo chắc chắn thất bại: với thao tác ghi, máy chủ CÓ THỂ đã xử lý
  // trước khi response bị bỏ theo phiên — UI phải kiểm tra lại trạng thái
  // mới nhất, KHÔNG tự retry (cả đọc lẫn ghi) để tránh nhân đôi mutation.
  function staleSessionError() {
    return new ApiError(
      "Phiên đã thay đổi khi yêu cầu đang chạy — kết quả của phiên cũ bị bỏ qua. " +
      "Với thao tác ghi, máy chủ có thể đã xử lý trước khi phiên đổi: hãy kiểm " +
      "tra lại trạng thái mới nhất trước khi thử lại.",
      0,
      "stale_session",
    );
  }

  // Wrapper cho các call cần đăng nhập (review vòng 2 — cô lập theo thế hệ
  // phiên cho CẢ thành công lẫn lỗi):
  // - 401 của request thuộc phiên HIỆN TẠI (generation chưa đổi) → xóa phiên
  //   (hết hạn/thu hồi/user vô hiệu).
  // - Response thành công thuộc thế hệ đã hết hiệu lực → BỎ: dữ liệu của
  //   actor cũ không được trả cho UI của phiên mới.
  // - Response lỗi (kể cả 401) thuộc thế hệ cũ → BỎ, thay bằng stale_session;
  //   KHÔNG dùng nó để xóa phiên mới, KHÔNG tự retry.
  async function authed(run) {
    const capturedGeneration = getSessionGeneration();
    let data;
    try {
      data = await run();
    } catch (error) {
      if (getSessionGeneration() !== capturedGeneration) {
        throw staleSessionError();
      }
      if (error instanceof ApiError && error.status === 401) {
        clearSessionIfUnchanged(capturedGeneration);
      }
      throw error;
    }
    if (getSessionGeneration() !== capturedGeneration) {
      throw staleSessionError();
    }
    return data;
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
     *
     * Chống phiên "hồi sinh" (review vòng 2): chốt thế hệ phiên TRƯỚC bước
     * await ĐẦU TIÊN (SDK getAccessToken), rồi KIỂM TRA LẠI sau từng bước
     * async cần thiết:
     *  - sau SDK trả: nếu logout/đổi phiên xảy ra trong lúc SDK chờ thì toàn
     *    bộ luồng này hết hiệu lực — KHÔNG phát hành (không POST access
     *    token), KHÔNG cài phiên;
     *  - sau POST trả: kết quả lỗi thời bị BỎ, không setSession.
     * Không tự retry.
     */
    async loginWithZaloToken() {
      requireBaseUrl();
      this.assertZaloHost();
      const capturedGeneration = getSessionGeneration();
      let accessToken = null;
      let sdkError = null;
      try {
        accessToken = await getSdkAccessToken();
      } catch (error) {
        sdkError = error;
      }
      if (getSessionGeneration() !== capturedGeneration) {
        // Phiên đổi trong lúc SDK chờ: bỏ CẢ lỗi SDK lẫn token — luồng cũ chết.
        throw staleSessionError();
      }
      if (sdkError) {
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
      if (getSessionGeneration() !== capturedGeneration) {
        throw staleSessionError();
      }
      if (!data || typeof data.token !== "string" || !data.token) {
        throw new ApiError("Backend trả về phiên không hợp lệ.", 0, "invalid_response");
      }
      setSession({
        token: data.token,
        userId: data.user && data.user.id,
        displayName: data.user && data.user.display_name,
        expiresAt: data.expires_at,
        consentsRequired: data.consents_required,
      });
      return {
        userId: getSession().userId,
        displayName: getSession().displayName || null,
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
      // Chụp token TRƯỚC khi vô hiệu hóa: request thu hồi phải đi đúng token
      // cũ (explicit token override) dù phiên tại client đã xóa ngay sau đây.
      const token = getToken();
      // Vô hiệu hóa NGAY LẶC TỨC (review vòng 2 — không đợi response thu hồi):
      // mọi luồng đăng nhập và request bắt đầu trước logout đều mất hiệu lực
      // từ thời điểm này — response đăng nhập chậm không được cài phiên,
      // response 200/401 của request phiên cũ không được trả cho UI.
      clearSession();
      if (token) {
        // Vẫn gửi thu hồi đúng token cũ đã chụp. Response này (kể cả lỗi)
        // KHÔNG đụng vào phiên: đăng nhập mới do người dùng chủ động bắt đầu
        // sau logout phải sống nguyên vẹn. Không retry thu hồi.
        await request("/api/v1/auth/logout", { method: "POST", body: {}, token });
        return true;
      }
      return false;
    },

    // --------------------- F01: danh tính tự khai báo ------------------------

    /** GET /api/v1/auth/me — tên tự khai báo của chính mình (không phải
     * danh tính Zalo xác minh; UI phải gắn nhãn rõ). */
    async getMyProfile() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/auth/me"));
      return data || null;
    },

    /** PUT /api/v1/auth/me — đặt/cập nhật tên tự khai báo. */
    async updateMyProfile({ displayName }) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/auth/me", {
        method: "PUT",
        body: { display_name: displayName },
      }));
      return data;
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

    async listInvites({ cursor = null, limit } = {}) {
      requireBaseUrl();
      // A09: bounded keyset page — trả { results, nextCursor } để UI có nút
      // “Xem thêm” thay vì âm thầm cắt dòng 21+.
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await authed(() =>
        request(`/api/v1/connections/invites${qs ? `?${qs}` : ""}`));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next_cursor) || null,
      };
    },

    /**
     * Kiểm tra mã TRƯỚC khi chấp nhận (read-only): ai tạo mã, quan hệ đề
     * nghị. Trả về { invite_id, relationship_kind, status, expires_at,
     * counterpart: { display_name, identity_basis } } — counterpart là TÊN
     * TỰ KHAI BÁO, không phải danh tính Zalo xác minh.
     */
    async previewInvite(code) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/connections/invites/preview", {
        method: "POST",
        body: { code },
      }));
      return data;
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

    async listConnections({ cursor = null, limit } = {}) {
      requireBaseUrl();
      // A09: bounded keyset page — như listInvites.
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await authed(() =>
        request(`/api/v1/connections${qs ? `?${qs}` : ""}`));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next_cursor) || null,
      };
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
