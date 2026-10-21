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

    /**
     * POST /api/v1/drafts/{id} — edit theo hợp đồng C8: `kind` OPTIONAL khi
     * edit (bất biến sau create) — adapter KHÔNG BAO GIỜ gửi `kind` trong body
     * edit; edit chỉ mang field có mặt (body/title/card/recipient). Lưu ý:
     * backend f06_drafts tại baseline 72930ae vẫn validate `kind` ở edit
     * (DraftDetailView.post -> _content_fields require_all=True rồi mới pop)
     * — gap backend thuộc A2, không fix bằng cách gửi kind từ client.
     *
     * N06 (QA vòng 2 — "client stale lưu đè im lặng bản của client khác",
     * contract BINDING F04R2-LEAD-1): field MỚI optional `expectedRevision` —
     *  - KHÔNG truyền / null → KHÔNG gửi `expected_revision` (backcompat hành
     *    vi cũ, cùng convention expectedRevision === null || === undefined của
     *    confirmInvite/confirmClassProposal/cancelDeletionRequest).
     *  - Truyền số nguyên dương ≤ 2147483647 → body kèm `expected_revision`;
     *    máy chủ so với draft.revision: lệch → 409
     *    {"error":{"code":"revision_conflict","details":{"reason":
     *    "draft_conflict","current_revision":N}}} (details KHÔNG chứa body —
     *    FORBIDDEN_DETAIL_KEYS), khớp → 200 revision+1.
     *  - 409 revision_conflict nổi lên NGUYÊN status/code/details qua ApiError
     *    của createApiClient (đọc envelope lỗi thống nhất — cùng parity các
     *    lỗi khác). Adapter KHÔNG nuốt, KHÔNG tự retry thao tác ghi; phía UI
     *    phải GET lại bản mới để reconcile rồi mới sửa tiếp.
     *  - Sai kiểu (0/âm/lẻ/chuỗi/vượt 2^31-1) → chặn TRƯỚC fetch 400
     *    input_invalid {field:"expected_revision", reason:"must_be_positive_int"}
     *    (parity aiRefine input_revision — hợp đồng C2).
     */
    async editDraft(draftId, { body, title = "", cardId, cardVersion, recipientId, expectedRevision } = {}) {
      requireBaseUrl();
      const payload = {
        body,
        title: title || "",
        ...(cardId ? { card_id: cardId } : {}),
        ...(cardVersion != null ? { card_version: cardVersion } : {}),
        ...(recipientId ? { recipient_id: recipientId } : {}),
      };
      if (expectedRevision !== undefined && expectedRevision !== null) {
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1
          || expectedRevision > 2147483647) {
          // Chặn trước fetch — 1..2147483647 theo hợp đồng N06 (int dương).
          throw new ApiError("expectedRevision phải là số nguyên dương.", 400, "http",
            { code: "input_invalid", details: { field: "expected_revision", reason: "must_be_positive_int" } });
        }
        payload.expected_revision = expectedRevision;
      }
      const data = await authed(() =>
        request(`/api/v1/drafts/${encodeURIComponent(draftId)}`, {
          method: "POST",
          body: payload,
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
      return data; // pass-through NGUYÊN VẸN (parity mock): {preview_id,
      // revision, recipient_id, body, deadline, server_time} — `body` là
      // snapshot server-bound (N01, QA 19/10): client hiển thị preview.body
      // trong sheet xác nhận, KHÔNG đọc lại live textarea. Adapter KHÔNG được
      // thêm/bớt field của preview (cùng quy tắc pass-through với aiRefine).
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
    // list KHÔNG bao giờ trả body/snippet — chỉ metadata (DSA). Envelope của
    // f05: param trang là `page_size`, cursor là `next` → map về
    // { results, nextCursor } cho UI (handoff 02 §4.6: không để tham số trang
    // bị máy chủ bỏ im lặng).

    async listMessages({ cursor = null, limit, timeoutMs } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/messages", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(limit ? { page_size: String(limit) } : {}),
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

    /** GET /api/v1/operations/{key} — tra cứu kết quả khi mất response.
     * Backend trả state: "sent" | "not_found"; chuẩn hóa cả state và status để tương thích đơn nguồn.
     */
    async lookupOperation(key) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/operations/${encodeURIComponent(key)}`));
      if (!data) return data;
      const state = data.state || data.status;
      return {
        ...data,
        state,
        status: state,
      };
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

    /**
     * POST /api/v1/ai/refine — key BẮT BUỘC do caller tạo (crypto.randomUUID);
     * replay cùng key trả CÙNG gợi ý (máy chủ quyết). Body mapping theo hợp
     * đồng freeze v1 (C2): {original_text, purpose, input_revision?}.
     * inputRevision là field MỚI optional (counter keystroke của composer):
     *  - KHÔNG truyền / null  → body legacy {original_text, purpose} — máy chủ
     *    hiện hành chấp nhận (payload thiếu input_revision vẫn hợp lệ).
     *  - Truyền số nguyên dương ≤ 2147483647 → gửi kèm `input_revision`; máy chủ
     *    echo lại trong DTO để UI đối chiếu stale (C7).
     * Response trả NGUYÊN VẸN DTO của máy chủ (AiSuggestion.view() + echo) —
     * adapter KHÔNG đổi tên field: text duy nhất là `suggested_text`, không
     * bao giờ `refined_text`, không biến đổi envelope.
     */
    async aiRefine({ text, purpose = "refine_expression", key, inputRevision, timeoutMs } = {}) {
      requireBaseUrl();
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (idempotency key).", 0, "configuration");
      }
      const body = { original_text: text, purpose };
      if (inputRevision !== undefined && inputRevision !== null) {
        if (!Number.isInteger(inputRevision) || inputRevision < 1
          || inputRevision > 2147483647) {
          // Chặn trước fetch — 1..2147483647 theo hợp đồng C2 (int dương).
          throw new ApiError("inputRevision phải là số nguyên dương.", 400, "http",
            { code: "input_invalid", details: { field: "input_revision", reason: "must_be_positive_int" } });
        }
        body.input_revision = inputRevision;
      }
      const data = await authed(() => request("/api/v1/ai/refine", {
        method: "POST",
        body,
        idempotencyKey: key,
        ...(timeoutMs ? { timeoutMs } : {}),
      }));
      return data; // suggestion.view() (201) — pass-through, không rename field
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

    /** GET /api/v1/privacy/overview — cursor v2 "ov2|<created_at_iso>|<share_id>"
     * (R09): trang-1 gọi KHÔNG cursor; nút "Tải thêm" truyền cursor opaque
     * xuống query. Envelope giữ nguyên (data || fallback rỗng trung thực). */
    async privacyOverview({ cursor } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/privacy/overview", {
        query: { ...(cursor ? { cursor } : {}) },
      }));
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

    /** GET /api/v1/privacy/deletion-requests/list — owner-only (KHÔNG dùng
     * POST để tra cứu; POST tạo yêu cầu mới). Path ĐÚNG urls.py: GET nằm ở
     * /list (view gốc chỉ có POST). Cursor v2 "v2|<requested_at_iso>|<id>";
     * shape ĐÚNG backend list_requests (services/deletion.py):
     * { results: [{request_id,status,scope_categories,requested_at,revision}],
     *   next_cursor, has_more } — mới nhất trước. */
    async listDeletionRequests({ cursor } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/privacy/deletion-requests/list", {
        query: { ...(cursor ? { cursor } : {}) },
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        next_cursor: (data && data.next_cursor) || null,
        has_more: Boolean(data && data.has_more),
      };
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
      // Backend đọc `page_size` (validate_page_size) — tham số `limit` của
      // caller giữ nguyên tên để không phá consumer, nhưng PHẢI map đúng
      // query param server đọc; trước đây gửi `limit` và bị bỏ qua im lặng
      // (phân trang vô hiệu, lịch sử tải không giới hạn).
      const data = await authed(() => request("/api/v1/mood/entries", {
        query: {
          ...(cursor ? { cursor } : {}),
          // F07 dùng param trang `page_size` + envelope `next` (giống F05).
          ...(limit ? { page_size: String(limit) } : {}),
        },
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next) || null,
      };
    },

    // ------------------- F07 (US-015/US-026): chi tiết/sửa/tổng hợp ----------

    /** GET /api/v1/mood/entries/{id} — mục của chính mình. */
    async getMoodEntry(entryId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/mood/entries/${encodeURIComponent(entryId)}`));
      return data;
    },

    /** PATCH /api/v1/mood/entries/{id} — sửa mục, revision +1; bản mới
     * KHÔNG tự chia sẻ cho người nhận cũ. */
    async editMoodEntry(entryId, { emotion = null, note = null } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/mood/entries/${encodeURIComponent(entryId)}`, {
          method: "PATCH",
          body: {
            ...(emotion ? { emotion } : {}),
            ...(note !== null ? { note } : {}),
          },
        }));
      return data; // entry.view() với revision mới
    },

    /** GET /api/v1/mood/entries/summary — đếm mô tả của chính mình. */
    async moodSummary(days = null) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/mood/entries/summary", {
        query: days ? { days: String(days) } : {},
      }));
      return data || { results: [], emotions: [] };
    },

    // ------------------- F07: chia sẻ từng mục ------------------------------

    /** GET /api/v1/mood/entries/{id}/shares — mục này đang chia sẻ cho ai
     * với trạng thái THẬT (active/stale_revision/revoked/unlinked). */
    async listMoodEntryShares(entryId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/mood/entries/${encodeURIComponent(entryId)}/shares`));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** POST /api/v1/mood/entries/{id}/share — chia sẻ ĐÚNG mục cho ĐÚNG
     * một người đang kết nối, tại revision ĐÃ xem trước (expectedRevision;
     * lệch -> 409 stale). KHÔNG tự retry thao tác ghi. */
    async shareMoodEntry(entryId, { recipientId, expectedRevision = null } = {}) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/mood/entries/${encodeURIComponent(entryId)}/share`, {
          method: "POST",
          body: {
            recipient_id: recipientId,
            ...(expectedRevision ? { expected_revision: expectedRevision } : {}),
          },
        }));
      return data; // grant_view() (201) với status thật của grant
    },

    /** POST /api/v1/mood/shares/{id}/revoke — thu hồi ĐÚNG grant này;
     * các mục/người nhận khác không đổi. */
    async revokeMoodShare(shareId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/mood/shares/${encodeURIComponent(shareId)}/revoke`, {
          method: "POST",
          body: {},
        }));
      return data;
    },

    /** GET /api/v1/mood/shared — những mục CÒN ĐƯỢC PHÉP xem (máy chủ lọc
     * quyền trước phân trang; `limit` map đúng `page_size`). */
    async listSharedMoodEntries({ cursor = null, limit } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/mood/shared", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(limit ? { page_size: String(limit) } : {}),
        },
      }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next) || null,
      };
    },

    /** GET /api/v1/mood/shared/{id} — máy chủ recheck quyền MỖI lần đọc;
     * 404 khi thu hồi/đã sửa/không còn kết nối. */
    async getSharedMoodEntry(shareId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/mood/shared/${encodeURIComponent(shareId)}`));
      return data;
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

    // ----------------------- F11: Điểm tựa dự phòng -------------------------
    async listSupporterRoles() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/supporters/roles"));
      return data && Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    },

    async inviteSupporter({ supporterId, relationshipKind } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/supporters/roles", {
        method: "POST",
        body: { supporter_id: supporterId, relationship_kind: relationshipKind },
      }));
      return data;
    },

    async respondSupporterRole({ roleId, decision } = {}) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/supporters/roles/${encodeURIComponent(roleId)}/respond`, {
        method: "POST",
        body: { decision },
      }));
      return data;
    },

    async revokeSupporterRole({ roleId } = {}) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/supporters/roles/${encodeURIComponent(roleId)}/revoke`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    async contactSupporter({ roleId, body, key } = {}) {
      requireBaseUrl();
      if (!key) {
        throw new ApiError(
          "contactSupporter requires an explicit caller-supplied idempotency key.",
          0,
          "configuration",
        );
      }
      const data = await authed(() =>
        request(`/api/v1/supporters/roles/${encodeURIComponent(roleId)}/contact`, {
          method: "POST",
          idempotencyKey: key,
          body: { body },
        }),
      );
      return data;
    },

    async listSupporterCommitments() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/supporters/commitments"));
      return data && Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    },

    // ----------------------- F12: Lịch hẹn & đầu mối trường ----------------
    async getSchoolDirectory() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/appointments/directory"));
      return data && Array.isArray(data.results) ? data.results : [];
    },

    async listAppointmentRequests() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/appointments/requests"));
      return data && Array.isArray(data.results) ? data.results : [];
    },

    async createAppointmentRequest({ topic, note = "" } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/appointments/requests", {
        method: "POST",
        body: { topic, note },
      }));
      return data;
    },

    async getAppointmentRequest(requestId) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}`));
      return data;
    },

    async claimAppointmentRequest(requestId) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}/claim`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    async proposeAppointmentSlot({ requestId, startAt } = {}) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}/slots`, {
        method: "POST",
        body: { start_at: startAt },
      }));
      return data;
    },

    async acceptAppointmentSlot({ requestId, slotId } = {}) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}/slots/${encodeURIComponent(slotId)}/accept`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    async declineAppointmentSlot({ requestId, slotId } = {}) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}/slots/${encodeURIComponent(slotId)}/decline`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    async cancelAppointmentRequest(requestId) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}/cancel`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    async completeAppointmentRequest(requestId) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/appointments/requests/${encodeURIComponent(requestId)}/complete`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    async getAppointmentQueue() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/appointments/queue"));
      return data && Array.isArray(data.results) ? data.results : [];
    },


    // -------- F02 chương trình bốn tuần (US-036/US-044, additive) --------

    /** GET /api/v1/program/catalog — chỉ chương trình đã publish (B16). */
    async programCatalog() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/program/catalog"));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** POST /api/v1/program/enroll — tham gia tự nguyện, pin revision. */
    async programEnroll({ programKey, programRevision }) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/program/enroll", {
        method: "POST",
        body: { program_key: programKey, program_revision: programRevision },
      }));
      return data;
    },

    /** POST /api/v1/program/opt-out — tự nguyện, không áp lực. */
    async programOptOut(programKey) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/program/opt-out", {
        method: "POST",
        body: { program_key: programKey },
      }));
      return data;
    },

    /** POST /api/v1/program/progress — tiến độ CỦA MÌNH (done|skipped|reset). */
    async programProgress({ programKey, weekNo, activityKey, status }) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/program/progress", {
        method: "POST",
        body: {
          program_key: programKey, week_no: weekNo,
          activity_key: activityKey, status,
        },
      }));
      return data;
    },

    /** POST /api/v1/program/agreement/accept — chấp nhận cá nhân template. */
    async programAgreementAccept(programKey) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/program/agreement/accept", {
          method: "POST",
          body: { program_key: programKey },
        }));
      return data;
    },

    /** GET /api/v1/program/agreement?program_key= — thỏa ước gia đình của
     * cặp mình (generation hiện tại) + template đã pin; null khi chưa có. */
    async programAgreement(programKey) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/program/agreement", {
        query: { program_key: programKey },
      }));
      return data || { agreement: null };
    },

    /** POST /api/v1/program/agreement/propose — một bên đề xuất. */
    async programAgreementPropose(programKey) {
      requireBaseUrl();
      const data = await authed(() =>
        request("/api/v1/program/agreement/propose", {
          method: "POST",
          body: { program_key: programKey },
        }));
      return data;
    },

    /** POST .../confirm — mỗi người tự xác nhận cho mình. */
    async programAgreementConfirm(agreementId) {
      requireBaseUrl();
      const data = await authed(() => request(
        `/api/v1/program/agreement/${encodeURIComponent(agreementId)}/confirm`,
        { method: "POST", body: {} }));
      return data;
    },

    /** POST .../withdraw — chỉ người đề xuất, khi còn proposed. */
    async programAgreementWithdraw(agreementId) {
      requireBaseUrl();
      const data = await authed(() => request(
        `/api/v1/program/agreement/${encodeURIComponent(agreementId)}/withdraw`,
        { method: "POST", body: {} }));
      return data;
    },

    // ------------------- F09 lời mời hoạt động chung -------------------

    /** GET /api/v1/activities/invites — lời mời liên quan tới tôi (2 chiều). */
    async activitiesInvites() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/activities/invites"));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** POST /api/v1/activities/invites — mời người ĐÃ kết nối cùng làm. */
    async activitiesInvite({ inviteeId, contentKey, contentRevision }) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/activities/invites", {
        method: "POST",
        body: {
          invitee_id: inviteeId, content_key: contentKey,
          content_revision: contentRevision,
        },
      }));
      return data;
    },

    /** POST .../respond — CHỈ người được mời accept|decline. */
    async activitiesRespond(inviteId, decision) {
      requireBaseUrl();
      const data = await authed(() => request(
        `/api/v1/activities/invites/${encodeURIComponent(inviteId)}/respond`,
        { method: "POST", body: { decision } }));
      return data;
    },

    // ----------------- F08: Nhật ký riêng và nhật ký song hành -----------------

    /** GET /api/v1/journal/prompts — các chủ đề gợi ý đã phát hành. */
    async listJournalPrompts() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/journal/prompts"));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** GET /api/v1/journal/pages — các trang nhật ký của chính mình (cursor + search). */
    async listJournalPages({ cursor = null, limit = null, search = null } = {}) {
      requireBaseUrl();
      const query = {
        ...(cursor ? { cursor } : {}),
        ...(limit ? { page_size: String(limit) } : {}),
        ...(search ? { search: String(search).trim() } : {}),
      };
      const data = await authed(() => request("/api/v1/journal/pages", { query }));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
        nextCursor: (data && data.next) || null,
      };
    },

    /** POST /api/v1/journal/pages — tạo trang riêng mới (mặc định chỉ mình bạn). */
    async createJournalPage({ topicCode = "", title = "", content } = {}) {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/journal/pages", {
        method: "POST",
        body: {
          topic_code: topicCode || "",
          title: title || "",
          content,
        },
      }));
      return data;
    },

    /** GET /api/v1/journal/pages/{id} — đọc trang của chính mình. */
    async getJournalPage(pageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/journal/pages/${encodeURIComponent(pageId)}`));
      return data;
    },

    /** PATCH /api/v1/journal/pages/{id} — sửa trang có chống ghi đè (expectedRevision). */
    async editJournalPage(pageId, { title, content, expectedRevision } = {}) {
      requireBaseUrl();
      const body = {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        expected_revision: expectedRevision,
      };
      const data = await authed(() => request(`/api/v1/journal/pages/${encodeURIComponent(pageId)}`, {
        method: "PATCH",
        body,
      }));
      return data;
    },

    /** DELETE /api/v1/journal/pages/{id} — xóa trang và cascade quyền + phản hồi. */
    async deleteJournalPage(pageId) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/journal/pages/${encodeURIComponent(pageId)}`, {
        method: "DELETE",
        body: {},
      }));
      return data;
    },

    /** GET /api/v1/journal/pages/{id}/shares — danh sách người đang được chia sẻ trang này. */
    async listJournalPageShares(pageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/journal/pages/${encodeURIComponent(pageId)}/shares`));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** POST /api/v1/journal/pages/{id}/share — chia sẻ ĐÚNG một trang tại revision hiện tại. */
    async shareJournalPage(pageId, { recipientId, expectedRevision = null } = {}) {
      requireBaseUrl();
      const body = {
        recipient_id: recipientId,
        ...(expectedRevision !== null && expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
      };
      const data = await authed(() => request(`/api/v1/journal/pages/${encodeURIComponent(pageId)}/share`, {
        method: "POST",
        body,
      }));
      return data;
    },

    /** POST /api/v1/journal/shares/{share_id}/revoke — thu hồi quyền xem trang này. */
    async revokeJournalShare(shareId) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/journal/shares/${encodeURIComponent(shareId)}/revoke`, {
        method: "POST",
        body: {},
      }));
      return data;
    },

    /** GET /api/v1/journal/pages/{id}/replies — phản hồi song hành nhận được trên trang của mình. */
    async listJournalPageReplies(pageId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/journal/pages/${encodeURIComponent(pageId)}/replies`));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** GET /api/v1/journal/shared — danh sách các trang đang được chia sẻ với mình. */
    async listSharedJournalPages() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/journal/shared"));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },

    /** GET /api/v1/journal/shared/{share_id} — đọc trang được chia sẻ (live re-check). */
    async getSharedJournalPage(shareId) {
      requireBaseUrl();
      const data = await authed(() =>
        request(`/api/v1/journal/shared/${encodeURIComponent(shareId)}`));
      return data;
    },

    /** POST /api/v1/journal/shared/{share_id}/replies — viết/sửa phản hồi song hành. */
    async replySharedJournalPage(shareId, { body } = {}) {
      requireBaseUrl();
      const data = await authed(() => request(`/api/v1/journal/shared/${encodeURIComponent(shareId)}/replies`, {
        method: "POST",
        body: { body },
      }));
      return data;
    },

    /** GET /api/v1/journal/my-replies — danh sách phản hồi mình đã viết. */
    async listMyJournalReplies() {
      requireBaseUrl();
      const data = await authed(() => request("/api/v1/journal/my-replies"));
      return {
        results: data && Array.isArray(data.results) ? data.results : [],
      };
    },
  };
}
