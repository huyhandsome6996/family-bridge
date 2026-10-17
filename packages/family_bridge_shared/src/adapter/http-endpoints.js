// Factory các endpoint thuần HTTP của adapter production — tách từ
// zalo-mini-app/src/core/adapter/zalo-adapter.js theo ADR-1 (task 18-a):
// toàn bộ method endpoint KHÔNG đụng zmp-sdk/window được di chuyển NGUYÊN
// THÂN vào đây để mini app và web dùng chung MỘT nguồn duy nhất (chống drift).
//
// Thuần ESM, KHÔNG DOM, KHÔNG zmp-sdk, KHÔNG storage (purity contract trong
// README.md). Token phiên đọc qua session in-memory của chính package này
// (../session.js — SEC-10); client HTTP inject qua tham số `request`.
//
// Hợp đồng factory (ADR-1):
//   createHttpEndpoints({
//     request,            // hàm HTTP từ createApiClient({baseUrl, getToken, timeoutMs})
//     authed,             // wrapper cô lập theo thế hệ phiên (glue host cung cấp)
//     requireBaseUrl,     // ném ApiError kind "configuration" khi thiếu baseUrl
//     staleSessionError,  // tạo lỗi kind "stale_session" khi kết quả lỗi thời
//     coldStartTimeoutMs, // mặc định 60000 — call mở app đầu tiên (Render free tier)
//   })
//
// Giá trị mặc định KHÔNG đổi so với zalo-adapter.js cũ: request timeout 15000
// do glue host truyền vào createApiClient (SC18 pin 15000); cold-start 60000
// qua tham số `coldStartTimeoutMs`.

import { ApiError } from "../api/client.mjs";
import {
  getSession, getSessionGeneration, setSession,
} from "../session.js";

export function createHttpEndpoints({
  request,
  authed,
  requireBaseUrl,
  staleSessionError,
  coldStartTimeoutMs,
}) {
  return {
    async getBackendHealth(timeoutMs = coldStartTimeoutMs) {
      requireBaseUrl();
      const data = await request("/api/v1/health/", { timeoutMs });
      return data && data.status === "ok" ? "ok" : "unknown";
    },

    async getBackendReady(timeoutMs = coldStartTimeoutMs) {
      requireBaseUrl();
      try {
        const data = await request("/api/v1/ready/", { timeoutMs });
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

    // ------------------------- F01: đăng nhập -------------------------------

    /** GET /api/v1/auth/me — tên tự khai báo của chính mình (không phải
     * danh tính Zalo xác minh; UI phải gắn nhãn rõ). */
    async getMyProfile(timeoutMs = coldStartTimeoutMs) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/auth/me", { timeoutMs }));
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

    async listConsents(timeoutMs = coldStartTimeoutMs) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/consents", { timeoutMs }));
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
    async loginWithCredentials({ code, password, timeoutMs = coldStartTimeoutMs } = {}) {
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
        loginMethod: "class",
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
    async getCapabilities(timeoutMs = coldStartTimeoutMs) {
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

    async listClassProposals({ cursor = null, limit, timeoutMs = coldStartTimeoutMs } = {}) {
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

    // ------------- Admin cấp phát cặp HS/PH (CAP-23, 18/10/2026) -------------
    // Chỉ admin có grant "classroom.provision" dùng được; thiếu grant →
    // backend 404 (be mặt admin không tồn tại). UI phải phân loại theo kind.

    async adminListClasses(timeoutMs = coldStartTimeoutMs) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/classroom/admin/classes", { timeoutMs }));
      return data && Array.isArray(data.results) ? data.results : [];
    },

    /** rows: [{caregiver_code, student_code, caregiver_name?, student_name?,
     * caregiver_external_ref?, student_external_ref?, allow_reconnect?}] —
     * preview CHỈ ĐỌC, không ghi gì (kể cả khi thiếu mật khẩu khởi tạo). */
    async adminPreviewPairs({ classRef, rows, initialPassword = null } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/classroom/admin/pairs-preview", {
          method: "POST",
          body: {
            class_ref: classRef,
            rows,
            ...(initialPassword ? { initial_password: initialPassword } : {}),
          },
        }));
      return data;
    },

    /** batchRef: UUID do caller tạo tại nút xác nhận (crypto.randomUUID) —
     * gửi lại cùng batchRef → server trả kết quả ĐÃ LƯU (idempotent). */
    async adminApplyPairs({ classRef, rows, batchRef, initialPassword = null } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/classroom/admin/pairs-apply", {
          method: "POST",
          body: {
            class_ref: classRef,
            rows,
            batch_ref: batchRef,
            ...(initialPassword ? { initial_password: initialPassword } : {}),
          },
        }));
      return data;
    },

    async adminBackfillInventory({ classRef = null, timeoutMs = coldStartTimeoutMs } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/classroom/admin/backfill-inventory", {
          query: classRef ? { class_ref: classRef } : {},
          timeoutMs,
        }));
      return data;
    },

    async adminBackfillApply({ classRef = null, batchRef } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/classroom/admin/backfill-apply", {
          method: "POST",
          body: {
            ...(classRef ? { class_ref: classRef } : {}),
            batch_ref: batchRef,
          },
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
    async helpDirectory(timeoutMs = coldStartTimeoutMs) {
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
