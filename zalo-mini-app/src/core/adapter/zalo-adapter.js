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
// Cold-start Render free tier: các call mở app đầu tiên (login, capabilities,
// health/ready, consents, profile, proposals, help directory) dùng 60s.
const COLD_START_TIMEOUT_MS = 60000;

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

    // ------------------- F06: nháp + tạm dừng máy chủ ------------------------
    // Hợp đồng khớp backend family_bridge_features.f06_drafts (đã mount trên
    // backend thật) và wrapper tham chiếu packages/family_bridge_mobile/
    // f06_drafts/api.js. Mọi thao tác đều qua authed() — 401 xử lý thống nhất,
    // response của phiên cũ bị bỏ. KHÔNG tự retry thao tác ghi.

    async listDrafts({ cursor = null, limit } = {}) {
      requireBaseUrl();
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await authed(() =>
        request(`/api/v1/drafts${qs ? `?${qs}` : ""}`));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next_cursor) || null,
        // Envelope list của backend kèm server_time + pause_seconds — cần
        // cho UI tính thời gian dừng còn lại của row đang paused.
        serverTime: (data && data.server_time) || null,
        pauseSeconds: (data && data.pause_seconds) || null,
      };
    },

    async createDraft({ kind, body, title = "", cardId, cardVersion, recipientId }) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/drafts", {
        method: "POST",
        body: {
          kind,
          body,
          title: title || "",
          ...(cardId ? { card_id: cardId } : {}),
          ...(cardVersion != null ? { card_version: cardVersion } : {}),
          ...(recipientId ? { recipient_id: recipientId } : {}),
        },
      }));
      return data; // draft.view + server_time
    },

    async getDraft(draftId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}`));
      return data; // draft.view + server_time (countdown từ MÁY CHỦ)
    },

    async editDraft(draftId, { body, title = "", cardId, cardVersion, recipientId }) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}`, {
          method: "POST",
          body: {
            body,
            title: title || "",
            ...(cardId ? { card_id: cardId } : {}),
            ...(cardVersion != null ? { card_version: cardVersion } : {}),
            ...(recipientId ? { recipient_id: recipientId } : {}),
          },
        }));
      return data;
    },

    async discardDraft(draftId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}`, {
          method: "DELETE",
          body: {},
        }));
      return data; // { draft_id, status }
    },

    async pauseDraft(draftId) {
      requireBaseUrl();
      // Deadline do MÁY CHỦ ghi; re-pause trả cùng deadline (không reset).
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}/pause`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    async cancelDraftPause(draftId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}/pause`, {
          method: "DELETE",
          body: {},
        }));
      return data;
    },

    async previewDraft(draftId) {
      requireBaseUrl();
      // Chỉ hợp lệ sau deadline (máy chủ quyết); gửi không kèm preview sẽ bị
      // backend từ chối — UI phải đi qua bước này trước confirm-send.
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}/preview`, {
          method: "POST",
          body: {},
        }));
      return data; // preview gắn (revision, recipient, hash payload)
    },

    async confirmDraftSend(draftId, previewId) {
      requireBaseUrl();
      // HÀNH ĐỘNG CUỐI CÙNG do người dùng bấm — không tự gọi, không tự retry.
      // Lỗi mạng => kết quả CHƯA XÁC ĐỊNH: UI kiểm tra lại trạng thái, không
      // gửi lại với preview mới (nguy cơ nhân đôi gửi).
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}/confirm-send`, {
          method: "POST",
          body: { preview_id: previewId },
        }));
      return data;
    },

    // ------------------- Web (Task 2): đăng nhập lớp học ---------------------
    // POST /api/v1/auth/class-session {code,password}. KHÔNG đụng zmp-sdk:
    // web host không có SDK — form mật khẩu là đường đăng nhập duy nhất ở đây.
    // Cùng pattern chống "phiên hồi sinh" như loginWithZaloToken: chốt thế hệ
    // phiên TRƯỚC await đầu tiên, kiểm tra lại sau từng bước.
    async loginWithCredentials({ code, password, timeoutMs = COLD_START_TIMEOUT_MS } = {}) {
      requireBaseUrl();
      if (typeof code !== "string" || !code.trim()
        || typeof password !== "string" || !password) {
        throw new ApiError(
          "Vui lòng nhập đủ mã tài khoản và mật khẩu.",
          400, "http", { code: "input_invalid", details: { reason: "missing_fields" } },
        );
      }
      const capturedGeneration = getSessionGeneration();
      const data = await request("/api/v1/auth/class-session", {
        method: "POST",
        body: { code: code.trim(), password },
        timeoutMs,
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
        // role do máy chủ trả — trang login dùng setRole, KHÔNG tự suy.
        role: data.user && data.user.role ? data.user.role : null,
        classRef: data.user && data.user.class_ref ? data.user.class_ref : null,
      };
    },

    /**
     * Khả năng của máy chủ (public): login_methods/settings/policy.
     * Best-effort: MỌI lỗi (404, mạng, timeout, JSON sai) → {} — không bao
     * giờ chặn đăng nhập chỉ vì endpoint này chưa có.
     */
    async getCapabilities(timeoutMs = COLD_START_TIMEOUT_MS) {
      requireBaseUrl();
      try {
        const data = await request("/api/v1/auth/class-capabilities", { timeoutMs });
        return data && typeof data === "object" ? data : {};
      } catch {
        return {};
      }
    },

    /** POST /api/v1/auth/class-password — đổi mật khẩu, thu hồi phiên khác. */
    async changeClassPassword({ currentPassword, newPassword } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/auth/class-password", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword },
      }));
      return data;
    },

    /** POST /api/v1/auth/class-code — đổi mã đăng nhập lớp học. */
    async changeClassCode({ currentPassword, newCode } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/auth/class-code", {
        method: "POST",
        body: { current_password: currentPassword, new_code: newCode },
      }));
      return data;
    },

    /** POST /api/v1/auth/class-display-name — đổi tên tự khai báo (re-auth). */
    async changeClassDisplayName({ currentPassword, displayName } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/auth/class-display-name", {
          method: "POST",
          body: { current_password: currentPassword, display_name: displayName },
        }));
      return data;
    },

    // ---------------- Web (Task 2): đề xuất ghép đôi lớp học -----------------

    async listClassProposals({ cursor = null, limit, timeoutMs = COLD_START_TIMEOUT_MS } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/classroom/proposals", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
        timeoutMs,
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next_cursor) || null,
      };
    },

    async confirmClassProposal(proposalId, { expectedRevision = null } = {}) {
      requireBaseUrl();
      const body = expectedRevision === null || expectedRevision === undefined
        ? {}
        : { expected_revision: expectedRevision };
      const data = await authed(() =>
        request(`/api/v1/classroom/proposals/${encodeURIComponent(proposalId)}/confirm`, {
          method: "POST",
          body,
        }));
      return data;
    },

    /** reason: "refused" | "wrong_pair" (contract backend). */
    async declineClassProposal(proposalId, { reason = "wrong_pair" } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/classroom/proposals/${encodeURIComponent(proposalId)}/decline`, {
          method: "POST",
          body: { reason },
        }));
      return data;
    },

    async cancelClassProposal(proposalId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/classroom/proposals/${encodeURIComponent(proposalId)}/cancel`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    // ---------------------- Web (Task 2): F05 hộp thư ------------------------
    // list KHÔNG bao giờ trả body/snippet — chỉ metadata (DSA). Cursor của
    // f05 dùng tên "next" trong envelope → map về nextCursor cho UI.

    async listMessages({ cursor = null, limit, timeoutMs } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/messages", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
        ...(timeoutMs ? { timeoutMs } : {}),
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next) || null,
      };
    },

    async getMessage(messageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/messages/${encodeURIComponent(messageId)}`));
      return data; // list_view + body + connection_generation
    },

    /** POST /api/v1/messages/{id}/read — recipient-only, idempotent. */
    async markMessageRead(messageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/messages/${encodeURIComponent(messageId)}/read`, {
          method: "POST",
          body: {},
        }));
      return data; // { read: true }
    },

    /**
     * POST /api/v1/messages — gửi lời nhắn/thẻ/tín hiệu qua transport F05.
     * `key` BẮT BUỘC do caller tạo tại nút xác nhận (crypto.randomUUID()).
     * Không tự retry: mất response → UI tra cứu /operations/{key}.
     */
    async sendMessage({ kind, recipientId, body, title = "", replyTo = null, key } = {}) {
      requireBaseUrl();
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (idempotency key).", 0, "configuration");
      }
      const data = await authed(() => request("/api/v1/messages", {
        method: "POST",
        body: {
          kind,
          recipient_id: recipientId,
          body,
          title: title || "",
          ...(replyTo ? { reply_to: replyTo } : {}),
        },
        idempotencyKey: key,
      }));
      return data; // { message_id, created_at, state:"sent" } (201)
    },

    /** GET /api/v1/messages/quick-replies — có thể trả {results:[],note:"library_not_configured"}. */
    async quickReplies({ audience } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/messages/quick-replies", {
        query: audience ? { audience } : {},
      }));
      return data || { results: [] };
    },

    /** GET /api/v1/operations/{key} — tra cứu kết quả khi mất response. */
    async lookupOperation(key) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/operations/${encodeURIComponent(key)}`));
      return data; // { status: "sent" | ... }
    },

    // ---------------------- Web (Task 2): F03 thẻ cảm xúc --------------------

    async listCards({ group = null, limit } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/cards", {
        query: {
          ...(group ? { group } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        truncated: Boolean(data && data.truncated),
        maxWindow: (data && data.max_window) || null,
      };
    },

    async previewCard({ cardId, version, recipientId } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/cards/preview", {
        method: "POST",
        body: { card_id: cardId, version, recipient_id: recipientId },
      }));
      return data;
    },

    /** POST /api/v1/cards/send — key bắt buộc; hash payload do máy chủ tính. */
    async sendCard({ cardId, version, recipientId, authorNote = "", key } = {}) {
      requireBaseUrl();
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (idempotency key).", 0, "configuration");
      }
      const data = await authed(() => request("/api/v1/cards/send", {
        method: "POST",
        body: {
          card_id: cardId,
          version,
          recipient_id: recipientId,
          author_note: authorNote || "",
        },
        idempotencyKey: key,
      }));
      return data; // { message_id, state:"sent", card:{...} } (201)
    },

    async cardSnapshot(messageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/cards/${encodeURIComponent(messageId)}`));
      return data;
    },

    async cardReplySuggestions(messageId, { audience } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/cards/${encodeURIComponent(messageId)}/reply-suggestions`, {
          query: audience ? { audience } : {},
        }));
      return data || { results: [] };
    },

    // --------------------- Web (Task 2): F10 tín hiệu ------------------------
    // Chỉ 3 nhu cầu allowlist (không có trường thời gian — BỎ time-picker).

    async signalMeta() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/signals/meta"));
      return data || { needs: [] };
    },

    async signalPreview({ need, recipientId } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/signals/preview", {
        method: "POST",
        body: { need, recipient_id: recipientId },
      }));
      return data; // { need, label, body, recipient_id } — text do máy chủ render
    },

    /** POST /api/v1/signals/send — key bắt buộc; DTO (need, recipient) only. */
    async signalSend({ need, recipientId, key } = {}) {
      requireBaseUrl();
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (idempotency key).", 0, "configuration");
      }
      const data = await authed(() => request("/api/v1/signals/send", {
        method: "POST",
        body: { need, recipient_id: recipientId },
        idempotencyKey: key,
      }));
      return data;
    },

    async signalDetail(messageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/signals/${encodeURIComponent(messageId)}`));
      return data;
    },

    async signalAck(messageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/signals/${encodeURIComponent(messageId)}/ack`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    // ----------------------- Web (Task 2): F04 AI ----------------------------

    async aiStatus() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/ai/status"));
      return data || { ai_enabled: false };
    },

    /** POST /api/v1/ai/refine — key bắt buộc; replay cùng key trả CÙNG gợi ý. */
    async aiRefine({ text, purpose = "refine_expression", key, timeoutMs } = {}) {
      requireBaseUrl();
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (idempotency key).", 0, "configuration");
      }
      const data = await authed(() => request("/api/v1/ai/refine", {
        method: "POST",
        body: { original_text: text, purpose },
        idempotencyKey: key,
        ...(timeoutMs ? { timeoutMs } : {}),
      }));
      return data; // suggestion.view() (201)
    },

    async aiAccept(suggestionId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/ai/suggestions/${encodeURIComponent(suggestionId)}/accept`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    async aiDiscard(suggestionId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/ai/suggestions/${encodeURIComponent(suggestionId)}/discard`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    // ----------------------- Web (Task 2): F13 danh bạ -----------------------

    /** GET /api/v1/help/directory — PUBLIC (AllowAny), không cần phiên. */
    async helpDirectory(timeoutMs = COLD_START_TIMEOUT_MS) {
      requireBaseUrl();
      const data = await request("/api/v1/help/directory", { timeoutMs });
      return data || { contacts: [], fallback: true };
    },

    // --------------------- Web (Task 2): F15 riêng tư ------------------------

    async privacyOverview() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/privacy/overview"));
      return data || { shared_by_me: [], connections: [] };
    },

    async revokeGrant({ itemType, itemId, recipientId } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/privacy/grants/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}/revoke`, {
          method: "POST",
          body: recipientId ? { recipient_id: recipientId } : {},
        }));
      return data;
    },

    /** categories: allowlist backend (account/connections/mood/journal/...). */
    async requestDeletion({ categories } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/privacy/deletion-requests", {
        method: "POST",
        body: { categories },
      }));
      return data; // { request_id, status, receipt?, duplicate? }
    },

    async getDeletionRequest(requestId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/privacy/deletion-requests/${encodeURIComponent(requestId)}`));
      return data;
    },

    async cancelDeletionRequest(requestId, { expectedRevision = null } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/privacy/deletion-requests/${encodeURIComponent(requestId)}/cancel`, {
          method: "POST",
          body: expectedRevision === null || expectedRevision === undefined
            ? {}
            : { expected_revision: expectedRevision },
        }));
      return data;
    },

    async withdrawConsent({ purpose } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/privacy/consents/${encodeURIComponent(purpose)}/withdraw`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    // ------------------- Web (Task 2): F02/F07/F09 dữ liệu home --------------

    /** POST /api/v1/mood/entries — ghi nhận cảm xúc ngày hôm nay (máy chủ). */
    async createMoodEntry({ emotion, note = "", entryDate = null } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/mood/entries", {
        method: "POST",
        body: {
          ...(entryDate ? { entry_date: entryDate } : {}),
          emotion,
          note: note || "",
        },
      }));
      return data; // entry.view() (201); trùng ngày → 400 entry_already_exists
    },

    async listMoodEntries({ cursor = null, limit } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/mood/entries", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next) || null,
      };
    },

    /** GET /api/v1/program/my — enrollment CẢ các row opted-out (trung thực). */
    async programMy() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/program/my"));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** GET /api/v1/program/weeks/{program_key} — tuần + tiến độ của tôi. */
    async programWeeks(programKey) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/program/weeks/${encodeURIComponent(programKey)}`));
      return data || { results: [] };
    },

    /** GET /api/v1/activities/catalog — kind: "activity" | "micro_lesson". */
    async activitiesCatalog({ kind = null, audience = null } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/activities/catalog", {
        query: {
          ...(kind ? { kind } : {}),
          ...(audience ? { audience } : {}),
        },
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },
  };
}
