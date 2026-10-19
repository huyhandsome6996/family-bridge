// Mock adapter — fixtures synthetic, CHỈ chạy khi demo mode bật rõ ràng.
// Dữ liệu minh họa có nhãn "Dữ liệu minh họa" ở tầng UI (demo-banner).
// Không lưu token/session giả như session thật; không phát sinh connection
// hoặc grant thật khi hiển thị trạng thái "đã kết nối".

import { ApiError } from "../api/client.mjs";
import { fixtures } from "../fixtures/index.js";
import {
  clearSession, getSession, hasLiveSession, setSession,
} from "../session.js";
// POLICY_PURPOSES = bản mirror client của CURRENT_POLICY_VERSIONS (f01
// services/policy.py: service-v1 / ai-v1 / research-v1) — cùng nguồn so sánh
// `current` như evaluateAiConsent của web/zalo (không hardcode riêng).
import { CONSENT_ORDER, POLICY_PURPOSES } from "../policy.js";

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
  const drafts = new Map(); // fixture F06: bản nháp minh họa trong bộ nhớ
  const messages = new Map(); // fixture Web: thư đã "gửi" trong demo
  const sentCards = 1;
  const sentSignals = 1;
  // F04 fixture: gợi ý theo idempotency key — replay cùng key trả CÙNG gợi ý
  // (không "gọi provider" lần 2), cùng key khác payload → 409 như backend.
  const aiSuggestions = new Map(); // key -> { payload, view }
  const aiSuggestionsById = new Map(); // suggestion_id -> view (để decide)
  const moodEntries = 1;
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
  // F15 demo: một grant minh họa (thật thì từ grant registry của máy chủ);
  // revoke chỉ ĐÁNH DẤU revoked:true — danh sách vẫn liệt kê (giống backend).
  const privacyGrants = [
    {
      item_type: "mood_entry",
      item_id: "demo-mood-grant-1",
      recipient_id: "demo-peer-fixture",
      approved_revision: 1,
      revoked: false,
    },
  ];
  // Yêu cầu xóa demo (trạng thái trong bộ nhớ adapter, giống dữ liệu thật).
  let deletionRequest = null;

  /**
   * Giây còn lại của khoảng dừng ĐANG ÁP DỤNG (null khi guard không chặn).
   * Nguồn sự thật: `_deadline_guard` (f06_drafts/services/drafts.py:73-94) —
   * cooldown là OPT-IN: chỉ chặn khi draft ĐANG paused (status=="paused" VÀ có
   * deadline). Edit trong lúc pause đưa draft về "editing" (deadline cố tình
   * KHÔNG xóa — drafts.py edit) → preview/send CHO QUA; paused mà đã quá
   * deadline cũng CHO QUA (t=299 chặn, t=300 qua; không auto-send). (F1)
   */
  function remainingPauseSeconds(draft) {
    if (!draft.pause || draft.status !== "paused") return null;
    return Math.max(0, Math.round((Date.parse(draft.pause.deadline) - Date.now()) / 1000));
  }

  /**
   * Shape `pause` GIỐNG HỆT Draft.view() backend (f06_drafts/models.py:70-92):
   * remaining_seconds/can_preview chỉ được tính khi status=="paused"; editing
   * dù còn lưu deadline (edit-during-pause) → remaining null + can_preview
   * false; không chọn pause bao giờ → null. (F1)
   */
  function pauseViewOf(draft, nowMs) {
    if (!draft.pause) return null;
    const paused = draft.status === "paused";
    return {
      ...draft.pause,
      remaining_seconds: paused
        ? Math.max(0, Math.round((Date.parse(draft.pause.deadline) - nowMs) / 1000))
        : null,
      can_preview: Boolean(paused && Date.parse(draft.pause.deadline) <= nowMs),
    };
  }

  /**
   * F3: decide (accept/discard) GIỐNG express.decide (f04 express.py:226-237)
   * — one-way idempotent: chỉ "suggested" mới chuyển trạng thái và đóng dấu
   * decided_at; gọi lại (hoặc chiều kia) trả nguyên trạng. Id chưa qua
   * aiRefine của phiên này vẫn trả ĐỦ shape view() (fixture) thay vì stub để
   * demo không lệch serializer thật.
   */
  function decideSuggestion(suggestionId, status) {
    const id = String(suggestionId || "");
    let view = aiSuggestionsById.get(id);
    if (!view) {
      view = {
        suggestion_id: id,
        purpose: "refine_expression",
        status: "suggested",
        original_text: "(minh họa)",
        suggested_text: "(minh họa)",
        model_revision: "demo-model-1",
        prompt_revision: "demo-prompt-1",
        input_revision: null,
        created_at: new Date().toISOString(),
        decided_at: null,
        source: "fixture",
      };
      aiSuggestionsById.set(id, view);
    }
    if (view.status === "suggested") {
      view.status = status;
      view.decided_at = new Date().toISOString();
    }
    return { ...view };
  }

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
      // F2: shape GIỐNG HỆT ConsentView.get (f01_identity/api.py:191-211) —
      // mỗi purpose đã biết đều có row; decision ∈ {accepted, declined, none}
      // (enum backend; KHÔNG có "withdrawn"); withdrawn là bool THẬT từ sổ cái
      // (rút giữ nguyên decision — ConsentRecord.withdraw); current =
      // policy_version == phiên bản hiện hành (CURRENT_POLICY_VERSIONS, mục
      // ai_processing = "ai-v1") — false khi chưa có bản ghi.
      return CONSENT_ORDER.map((purpose) => {
        const recorded = consents.get(purpose);
        if (!recorded) {
          return { purpose, decision: "none", policy_version: null, withdrawn: false, current: false };
        }
        const currentVersion = POLICY_PURPOSES[purpose]?.version;
        return {
          purpose,
          decision: recorded.decision,
          policy_version: recorded.version,
          withdrawn: Boolean(recorded.withdrawn),
          current: Boolean(recorded.version) && recorded.version === currentVersion,
        };
      });
    },

    async recordConsent({ purpose, policyVersion, decision }) {
      await wait(150);
      // POST mới = bản ghi MỚI NHẤT của purpose (latest-wins) — đè cả trạng
      // thái withdrawn cũ (accept sau rút là hành động mới, có hiệu lực lại
      // như has_active_consent).
      consents.set(purpose, { version: policyVersion ?? null, decision, withdrawn: false });
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
      // A09: envelope giống adapter thật ({ results, nextCursor }).
      return {
        results: Array.from(invites.values()).map((invite) => ({ ...invite })),
        nextCursor: null,
      };
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
      // A09: envelope giống adapter thật ({ results, nextCursor }).
      return {
        results: connections.map((connection) => ({ ...connection })),
        nextCursor: null,
      };
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

    // ------------------- F06 demo: nháp + tạm dừng máy chủ -------------------
    // Fixture minh họa hợp đồng drafts (kind ≤16 ký tự, body ≤4000, pause
    // 300 giây "máy chủ" mô phỏng trong bộ nhớ adapter). KHÔNG gửi gì thật,
    // không lưu storage, mất khi rebuildAdapter. Dùng cho demo/visual test.

    async listDrafts() {
      await wait(150);
      const now = new Date();
      return {
        results: Array.from(drafts.values()).map((draft) => ({
          ...draft,
          // F1: đúng Draft.view() — remaining/can_preview CHỈ khi đang paused;
          // edit-during-pause (status=editing) phải trả null/false dù deadline
          // còn lưu trong bộ nhớ.
          pause: pauseViewOf(draft, now.getTime()),
        })),
        nextCursor: null,
        server_time: now.toISOString(),
        pause_seconds: 300,
        source: "fixture",
      };
    },

    async createDraft({ kind, body, title = "", recipientId = null } = {}) {
      await simulate({ kind: "drafts", fallback: "ok" });
      // Backend KINDS chỉ nhận ("text","emotion_card") — mock phải từ chối
      // giống hệt để không che lỗi hợp đồng ở demo (QA fix 1).
      const allowedKinds = ["text", "emotion_card"];
      if (!allowedKinds.includes(String(kind || ""))) {
        throw new ApiError("Loại thư không được hỗ trợ (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "kind", reason: "kind_not_allowed" } });
      }
      const text = String(body || "");
      if (!text.trim()) {
        throw new ApiError("Lời nhắn không được bỏ trống (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "body", reason: "too_short" } });
      }
      if (text.length > 4000) {
        throw new ApiError("Lời nhắn vượt 4000 ký tự (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "body", reason: "too_long" } });
      }
      const id = `demo-draft-${drafts.size + 1}`;
      const nowIso = new Date().toISOString();
      const draft = {
        draft_id: id,
        kind: String(kind || "letter").slice(0, 16),
        title: String(title || "").slice(0, 200),
        body: text,
        recipient_id: recipientId,
        revision: 1,
        status: "editing",
        pause: null,
        source: "fixture",
        updated_at: nowIso,
      };
      drafts.set(id, draft);
      return { ...draft };
    },

    async getDraft(draftId) {
      await wait(150);
      const draft = drafts.get(draftId);
      if (!draft) {
        throw new ApiError("Không tìm thấy bản nháp (dữ liệu minh họa).", 404, "http", { code: "not_found" });
      }
      // F1: view tính TẠI thời điểm đọc như backend (không echo số liệu cũ
      // từ lúc pause).
      return { ...draft, pause: pauseViewOf(draft, Date.now()), server_time: new Date().toISOString() };
    },

    async editDraft(draftId, { body, title = "", recipientId = null } = {}) {
      await simulate({ kind: "drafts", fallback: "ok" });
      const draft = drafts.get(draftId);
      if (!draft) {
        throw new ApiError("Không tìm thấy bản nháp (dữ liệu minh họa).", 404, "http", { code: "not_found" });
      }
      const text = String(body || "");
      if (!text.trim() || text.length > 4000) {
        throw new ApiError("Lời nhắn phải 1..4000 ký tự (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "body" } });
      }
      draft.body = text;
      draft.title = String(title || "").slice(0, 200);
      draft.recipient_id = recipientId;
      draft.revision += 1; // sửa nội dung làm preview cũ hết giá trị (contract)
      // Backend: edit đặt lại status=editing, deadline CỐ TÌNH không xóa
      // (sửa nội dung không reset khoảng dừng). F1: view trả remaining null +
      // can_preview false vì guard chỉ áp dụng khi ĐANG paused.
      draft.status = "editing";
      return { ...draft, pause: pauseViewOf(draft, Date.now()) };
    },

    async discardDraft(draftId) {
      await wait(150);
      drafts.delete(draftId);
      return { draft_id: draftId, status: "discarded", source: "fixture" };
    },

    async pauseDraft(draftId) {
      await simulate({ kind: "drafts", fallback: "ok" });
      const draft = drafts.get(draftId);
      if (!draft) {
        throw new ApiError("Không tìm thấy bản nháp (dữ liệu minh họa).", 404, "http", { code: "not_found" });
      }
      if (draft.status === "paused" && draft.pause) {
        // re-pause giữ nguyên deadline — không reset (contract backend).
        return { ...draft, pause: pauseViewOf(draft, Date.now()), server_time: new Date().toISOString() };
      }
      const deadline = Date.now() + 300 * 1000; // 300 giây cố định
      draft.status = "paused";
      draft.pause = {
        started_at: new Date().toISOString(),
        deadline: new Date(deadline).toISOString(),
        remaining_seconds: 300,
        can_preview: false,
      };
      return { ...draft, pause: pauseViewOf(draft, Date.now()), server_time: new Date().toISOString(), source: "fixture" };
    },

    async cancelDraftPause(draftId) {
      await wait(150);
      const draft = drafts.get(draftId);
      if (!draft) {
        throw new ApiError("Không tìm thấy bản nháp (dữ liệu minh họa).", 404, "http", { code: "not_found" });
      }
      draft.status = "editing";
      draft.pause = null;
      return { ...draft, server_time: new Date().toISOString(), source: "fixture" };
    },

    /** Giây còn lại của khoảng dừng đã chọn (null khi không chọn pause). */
    async previewDraft(draftId) {
      await simulate({ kind: "drafts", fallback: "ok" });
      const draft = drafts.get(draftId);
      if (!draft) {
        throw new ApiError("Không tìm thấy bản nháp (dữ liệu minh họa).", 404, "http", { code: "not_found" });
      }
      // C8 + F1: gate OPT-IN đúng _deadline_guard (drafts.py:73-94) — chỉ
      // chặn khi draft ĐANG paused còn deadline. KHÔNG chọn pause → hợp lệ
      // ngay; pause→edit (status về "editing") → CHO QUA; paused hết hạn →
      // CHO QUA (không auto-send, chỉ là không còn chặn).
      const remaining = remainingPauseSeconds(draft);
      if (remaining !== null && remaining > 0) {
        throw new ApiError(
          "Chưa hết 5 phút tạm dừng nên chưa xem trước được (dữ liệu minh họa).",
          409, "http",
          // details khớp CooldownActive backend (drafts.py:89-94):
          // {reason:"pause_in_progress", deadline, remaining_seconds}.
          { code: "cooldown_active", details: {
            reason: "pause_in_progress",
            deadline: draft.pause.deadline,
            remaining_seconds: remaining,
          } },
        );
      }
      const nowIso = new Date().toISOString();
      // N01 (QA 19/10 — P1 "gửi sai bản đã duyệt"): preview response PHẢI kèm
      // `body` = snapshot nội dung mà MÁY CHỦ vừa chốt (bản của draft tại thời
      // điểm preview, sau mọi editDraft). Client bắt buộc hiển thị preview.body
      // trong sheet xác nhận (fallback snapshot chốt trước await) — TUYỆT ĐỐI
      // không đọc lại live textarea. Parity với make_preview backend
      // (f06_drafts/services/drafts.py) sau khi A2 thêm field `body`.
      return {
        preview_id: `demo-preview-${draftId}-${draft.revision}`,
        revision: draft.revision,
        recipient_id: draft.recipient_id,
        body: draft.body,
        deadline: draft.pause ? draft.pause.deadline : null,
        server_time: nowIso,
        source: "fixture",
      };
    },

    async confirmDraftSend(draftId, previewId) {
      await simulate({ kind: "drafts", fallback: "ok" });
      const draft = drafts.get(draftId);
      if (!draft) {
        throw new ApiError("Không tìm thấy bản nháp (dữ liệu minh họa).", 404, "http", { code: "not_found" });
      }
      // C8 + F1: gate OPT-IN giống preview — chỉ paused+còn deadline mới chặn;
      // không chọn pause → gửi thẳng; pause→edit/hết hạn → cho qua tay.
      // Không bao giờ auto-send t=300.
      const remaining = remainingPauseSeconds(draft);
      if (remaining !== null && remaining > 0) {
        throw new ApiError(
          "Còn thời gian tạm dừng đã chọn, chưa thể gửi (dữ liệu minh họa).",
          409, "http",
          // details khớp CooldownActive backend (drafts.py:89-94).
          { code: "cooldown_active", details: {
            reason: "pause_in_progress",
            deadline: draft.pause.deadline,
            remaining_seconds: remaining,
          } },
        );
      }
      const expected = `demo-preview-${draftId}-${draft.revision}`;
      if (previewId !== expected) {
        throw new ApiError("Bản xem trước đã cũ, cần xem lại trước khi gửi (dữ liệu minh họa).", 409, "http", { code: "preview_stale" });
      }
      if (!draft.recipient_id) {
        throw new ApiError("Thiếu người nhận (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "recipient_id" } });
      }
      drafts.delete(draftId); // gửi xong nháp rời danh sách đang soạn
      // F3: shape GIỐNG confirm_send backend (f06 drafts.py:247-248):
      // {message_id, draft_id, status:"sent"} — KHÔNG có preview_id.
      return { message_id: `demo-message-${draftId}`, draft_id: draftId, status: "sent", source: "fixture" };
    },

    // ------------------ Web (Task 2): demo counterparts ---------------------
    // Dữ liệu minh họa trung lập, KHÔNG dùng tên/ảnh người thật. Các method
    // GỬI echo thành công sau resolve (vẫn yêu cầu key như production để demo
    // không che lỗi hợp đồng).

    async loginWithCredentials({ code, password } = {}) {
      await wait(200);
      if (!code || !password) {
        throw new ApiError("Vui lòng nhập đủ mã tài khoản và mật khẩu (dữ liệu minh họa).", 400, "http", { code: "input_invalid" });
      }
      setSession({
        token: "demo-token-not-real",
        userId: "demo-user-fixture",
        expiresAt: Date.now() + 24 * 3600 * 1000,
        consentsRequired: ["service", "ai_processing", "research"],
      });
      return {
        userId: "demo-user-fixture",
        displayName: myDisplayName || "Thành viên minh họa",
        expiresAt: getSession().expiresAt,
        consentsRequired: ["service", "ai_processing", "research"],
        role: "student",
        classRef: "DEMO",
        source: "fixture",
      };
    },

    async getCapabilities() {
      await wait(100);
      return {
        login_methods: { local_class: true, zalo: true },
        settings: { change_password: true, change_code: true, change_display_name: true },
        policy: { no_forced_password_change: true },
        source: "fixture",
      };
    },

    async changeClassPassword({ currentPassword, newPassword } = {}) {
      await wait(150);
      if (!currentPassword || !newPassword) {
        throw new ApiError("Thiếu mật khẩu hiện tại hoặc mật khẩu mới (dữ liệu minh họa).", 400, "http", { code: "input_invalid" });
      }
      // Sentinel "wrong-password" mô phỏng 403 reauth_failed của backend.
      if (currentPassword === "wrong-password") {
        throw new ApiError("Mật khẩu hiện tại chưa đúng (dữ liệu minh họa).", 403, "http", { code: "not_authorized", details: { reason: "reauth_failed" } });
      }
      if (newPassword === currentPassword) {
        throw new ApiError("Mật khẩu mới trùng mật khẩu hiện tại (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "same_password" } });
      }
      if (newPassword.length < 8) {
        throw new ApiError("Mật khẩu mới quá yếu (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "weak_password", messages: ["Mật khẩu cần ít nhất 8 ký tự."] } });
      }
      return { changed: true, sessions_revoked_other: 0, source: "fixture" };
    },

    async changeClassCode({ currentPassword, newCode } = {}) {
      await wait(150);
      if (!currentPassword || !newCode) {
        throw new ApiError("Thiếu mật khẩu hiện tại hoặc mã mới (dữ liệu minh họa).", 400, "http", { code: "input_invalid" });
      }
      if (!/^[A-Za-z0-9]{4,32}$/.test(String(newCode))) {
        throw new ApiError("Mã mới sai định dạng (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "invalid_code_format" } });
      }
      // Sentinel mô phỏng lỗi trùng/thay mã của backend.
      if (String(newCode) === "SAMECODE") {
        throw new ApiError("Mã mới trùng mã hiện tại (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "same_code" } });
      }
      if (String(newCode) === "DUPCODE1") {
        throw new ApiError("Mã đã được tài khoản khác dùng (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "duplicate_code" } });
      }
      return { login_code: String(newCode), changed: true, source: "fixture" };
    },

    async changeClassDisplayName({ currentPassword, displayName } = {}) {
      await wait(150);
      if (!currentPassword) {
        throw new ApiError("Cần mật khẩu hiện tại để đổi tên (dữ liệu minh họa).", 403, "http", { code: "not_authorized", details: { reason: "reauth_failed" } });
      }
      const text = String(displayName || "").trim().slice(0, 80);
      if (!text) {
        throw new ApiError("Tên gọi không được bỏ trống (dữ liệu minh họa).", 400, "http", { code: "input_invalid" });
      }
      myDisplayName = text;
      return { display_name: text, identity_basis: "self_declared", source: "fixture" };
    },

    async listClassProposals() {
      await wait(200);
      return {
        results: [
          {
            proposal_id: "demo-proposal-1",
            status: "proposed",
            my_role: "student",
            my_confirmed: false,
            counterpart_confirmed: false,
            counterpart: { display_name: "Người đồng hành (minh họa)", identity_basis: "self_declared" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        source: "fixture",
      };
    },

    async confirmClassProposal(proposalId) {
      await simulate({ kind: "proposal", fallback: "ok" });
      return {
        proposal_id: proposalId,
        status: "connected",
        my_confirmed: true,
        counterpart_confirmed: true,
        connection: {
          connection_id: "demo-connection-1",
          status: "active",
          relationship_kind: "primary",
          generation: 1,
        },
        source: "fixture",
      };
    },

    async declineClassProposal(proposalId, { reason = "wrong_pair" } = {}) {
      await wait(150);
      return { proposal_id: proposalId, status: "declined", reason, source: "fixture" };
    },

    async cancelClassProposal(proposalId) {
      await wait(150);
      return { proposal_id: proposalId, status: "canceled", source: "fixture" };
    },

    async listMessages() {
      await wait(150);
      const nowIso = new Date().toISOString();
      return {
        results: [
          {
            message_id: "demo-message-1",
            kind: "text",
            direction: "received",
            counterparty_id: "demo-peer-fixture",
            title: "Lời nhắn từ người đồng hành (minh họa)",
            created_at: nowIso,
            read: false,
            reply_to: null,
          },
        ],
        nextCursor: null,
        source: "fixture",
      };
    },

    async getMessage(messageId) {
      await wait(120);
      return {
        message_id: messageId,
        kind: "text",
        direction: "received",
        counterparty_id: "demo-peer-fixture",
        title: "Lời nhắn từ người đồng hành (minh họa)",
        created_at: new Date().toISOString(),
        read: false,
        reply_to: null,
        body: "Đây là nội dung minh họa trong bộ nhớ demo — không phải tin nhắn thật.",
        connection_generation: 1,
        source: "fixture",
      };
    },

    async markMessageRead(messageId) {
      await wait(100);
      return { read: true, source: "fixture" };
    },

    async sendMessage({ kind, recipientId, body, title = "", replyTo = null, key } = {}) {
      await simulate({ kind: "messages", fallback: "ok" });
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (dữ liệu minh họa).", 0, "configuration");
      }
      if (!body || !recipientId) {
        throw new ApiError("Thiếu nội dung hoặc người nhận (dữ liệu minh họa).", 400, "http", { code: "input_invalid" });
      }
      const id = `demo-message-${messages.size + 1}`;
      messages.set(id, { id, kind, recipientId, title, replyTo, key });
      return { message_id: id, created_at: new Date().toISOString(), state: "sent", source: "fixture" };
    },

    async quickReplies({ audience } = {}) {
      await wait(100);
      // Giống backend khi thư viện chưa cấu hình: rỗng + ghi chú (trung thực).
      return { results: [], note: "library_not_configured", source: "fixture" };
    },

    async lookupOperation(key) {
      await wait(100);
      return { status: "sent", key, source: "fixture" };
    },

    async listCards({ group = null } = {}) {
      await wait(150);
      const all = [
        { card_id: "demo-card-1", version: 1, group_code: "ap_luc", title: "Khi thấy áp lực điểm số", body: "Con cảm thấy hơi ngợp vì một số dự định tuần này. Khi nào rảnh, con muốn được ngồi uống nước với bố mẹ một chút...", audience: "student", status: "published" },
        { card_id: "demo-card-2", version: 1, group_code: "ranh_gioi", title: "Cần khoảng lặng riêng", body: "Hôm nay năng lượng của con hơi thấp, con xin phép được ở trong phòng một lúc để nghỉ ngơi trước khi nói chuyện cả nhà nhé.", audience: "student", status: "published" },
        { card_id: "demo-card-3", version: 1, group_code: "mong_thau_hieu", title: "Mong được lắng nghe", body: "Có một chuyện con muốn tâm sự với bố mẹ, nhưng con mong bố mẹ chỉ lắng nghe trọn vẹn trước mà chưa cần đưa ra lời khuyên vội...", audience: "student", status: "published" },
      ];
      const results = group ? all.filter((c) => c.group_code === group) : all;
      return { results, truncated: false, maxWindow: 50, source: "fixture" };
    },

    async previewCard({ cardId, version, recipientId } = {}) {
      await wait(120);
      if (!cardId || !recipientId) {
        throw new ApiError("Thiếu thẻ hoặc người nhận (dữ liệu minh họa).", 400, "http", { code: "input_invalid" });
      }
      return {
        preview_id: `demo-card-preview-${cardId}-v${version}`,
        card_id: cardId,
        version,
        recipient_id: recipientId,
        server_time: new Date().toISOString(),
        source: "fixture",
      };
    },

    async sendCard({ cardId, version, recipientId, authorNote = "", key } = {}) {
      await simulate({ kind: "cards", fallback: "ok" });
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (dữ liệu minh họa).", 0, "configuration");
      }
      return {
        message_id: `demo-card-message-${sentCards}`,
        state: "sent",
        card: { card_id: cardId, version, group_code: "", title: "", body: "" },
        source: "fixture",
      };
    },

    async cardSnapshot(messageId) {
      await wait(100);
      return { message_id: messageId, card: { card_id: "demo-card-1", version: 1, group_code: "ap_luc", title: "Khi thấy áp lực điểm số", body: "..." }, source: "fixture" };
    },

    async cardReplySuggestions() {
      await wait(100);
      return { results: [], source: "fixture" };
    },

    async signalMeta() {
      await wait(100);
      return {
        needs: [
          { need: "muon_tro_chuyen", label: "Con muốn trò chuyện với bố mẹ" },
          { need: "muon_duoc_o_ben", label: "Con muốn có bố mẹ ở bên" },
          { need: "muon_hen_gio", label: "Con muốn hẹn thời gian trao đổi" },
        ],
        source: "fixture",
      };
    },

    async signalPreview({ need, recipientId } = {}) {
      await wait(120);
      const labels = {
        muon_tro_chuyen: "Con muốn trò chuyện với bố mẹ",
        muon_duoc_o_ben: "Con muốn có bố mẹ ở bên",
        muon_hen_gio: "Con muốn hẹn thời gian trao đổi",
      };
      if (!labels[need]) {
        throw new ApiError("Nhu cầu không hợp lệ (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "need", reason: "invalid_need" } });
      }
      return { need, label: labels[need], body: `Con cần được lắng nghe — ${labels[need].toLowerCase()}.`, recipient_id: recipientId, source: "fixture" };
    },

    async signalSend({ need, recipientId, key } = {}) {
      await simulate({ kind: "signals", fallback: "ok" });
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (dữ liệu minh họa).", 0, "configuration");
      }
      return { message_id: `demo-signal-${sentSignals}`, state: "sent", need, recipient_id: recipientId, source: "fixture" };
    },

    async signalDetail(messageId) {
      await wait(100);
      return { message_id: messageId, need: "muon_tro_chuyen", label: "Con muốn trò chuyện với bố mẹ", body: "Con cần được lắng nghe — con muốn trò chuyện với bố mẹ.", source: "fixture" };
    },

    async signalAck(messageId) {
      await wait(100);
      return { acknowledged: true, message_id: messageId, source: "fixture" };
    },

    async aiStatus() {
      await wait(80);
      return { ai_enabled: true, source: "fixture" };
    },

    /**
     * F04 demo (C2/C3/C6): shape GIỐNG serializer thật AiSuggestion.view() +
     * echo `input_revision` (int hoặc null) — text duy nhất là `suggested_text`,
     * KHÔNG BAO GIỜ `refined_text` (mock phải khớp serializer thật, không che
     * lỗi schema — handoff 01 §6.1). input_revision cùng ràng buộc backend:
     * số nguyên dương ≤ 2147483647, thiếu/vẫn hợp lệ (legacy).
     */
    async aiRefine({ text, purpose = "refine_expression", key, inputRevision } = {}) {
      await wait(300);
      if (!key) {
        throw new ApiError("Thiếu khóa lượt gửi (dữ liệu minh họa).", 0, "configuration");
      }
      let revision = null;
      if (inputRevision !== undefined && inputRevision !== null) {
        if (!Number.isInteger(inputRevision) || inputRevision < 1
          || inputRevision > 2147483647) {
          throw new ApiError("input_revision phải là số nguyên dương (dữ liệu minh họa).",
            400, "http", { code: "input_invalid",
              details: { field: "input_revision", reason: "must_be_positive_int" } });
        }
        revision = inputRevision;
      }
      const original = String(text || "");
      const payload = { original_text: original, purpose, input_revision: revision };
      const existing = aiSuggestions.get(String(key));
      if (existing) {
        // F4: payload hash backend (send_payload_hash —
        // family_bridge_core/idempotency.py) = {kind:"ai_refine",
        // recipient_id:"", body, reply_to:null, context_revision} — KHÔNG có
        // `purpose`, nên so khớp replay chỉ (text, input_revision). Cùng key +
        // text + revision nhưng purpose khác → backend REPLAY, không 409. Biên
        // này hiện unreachable (allowlist purpose backend chỉ có 1 giá trị —
        // f04 express.py PURPOSES → 400 purpose_not_allowed trước replay) nhưng
        // mock phải cùng semantics: khi backend thêm purpose thứ 2, mock không
        // được tự nghiêm hơn hash thật.
        if (existing.payload.original_text !== payload.original_text
          || existing.payload.input_revision !== payload.input_revision) {
          throw new ApiError("Khóa đã dùng cho nội dung khác (dữ liệu minh họa).",
            409, "http", { code: "duplicate_key_payload_mismatch" });
        }
        return { ...existing.view }; // replay: KHÔNG tạo gợi ý thứ hai
      }
      // Thứ tự field = CHÍNH XÁC AiSuggestion.view() (f04_ai/models.py:69-82)
      // để test shape contract (f04-contract.test.mjs — F5) pin được thứ tự;
      // `source:"fixture"` là quy ước mock-wide đã ghi nhận trong peer-review.
      const view = {
        suggestion_id: `demo-suggestion-${aiSuggestions.size + 1}`,
        purpose,
        status: "suggested", // đúng STATUS_SUGGESTED của model (không "pending")
        original_text: original,
        suggested_text: `Bản diễn đạt êm hơn (minh họa): ${original}`,
        model_revision: "demo-model-1",
        prompt_revision: "demo-prompt-1",
        input_revision: revision,
        created_at: new Date().toISOString(),
        decided_at: null,
        source: "fixture",
      };
      aiSuggestions.set(String(key), { payload, view });
      aiSuggestionsById.set(view.suggestion_id, view);
      return { ...view };
    },

    /**
     * F3: accept/discard trả ĐỦ view() như backend `_decide` (f04 api.py:
     * 122-129 → suggestion.view() gồm decided_at), one-way idempotent: hủy
     * sau accept không đổi trạng thái (express.decide). Không tự sinh
     * Message, không gửi.
     */
    async aiAccept(suggestionId) {
      await wait(100);
      return decideSuggestion(suggestionId, "accepted");
    },

    async aiDiscard(suggestionId) {
      await wait(100);
      return decideSuggestion(suggestionId, "discarded");
    },

    async helpDirectory() {
      await wait(120);
      return {
        contacts: [],
        source: "fallback",
        fallback: true,
        source_note: "Dữ liệu minh họa — danh bạ đầy đủ hiển thị sau khi máy chủ cấu hình.",
      };
    },

    async privacyOverview() {
      await wait(150);
      return { shared_by_me: privacyGrants.map((grant) => ({ ...grant })), connections: connections.map((c) => ({ ...c })), source: "fixture" };
    },

    async revokeGrant({ itemType, itemId, recipientId } = {}) {
      await wait(120);
      const grant = privacyGrants.find(
        (row) => row.item_type === itemType && row.item_id === itemId,
      );
      if (grant) grant.revoked = true;
      return { item_type: itemType, item_id: itemId, recipient_id: recipientId || null, revoked: true, source: "fixture" };
    },

    async requestDeletion({ categories } = {}) {
      await wait(150);
      if (!Array.isArray(categories) || !categories.length) {
        throw new ApiError("Chọn ít nhất một phạm vi (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { reason: "must_be_non_empty_list" } });
      }
      if (deletionRequest && deletionRequest.status !== "cancelled") {
        return { request_id: deletionRequest.request_id, status: deletionRequest.status, duplicate: true, source: "fixture" };
      }
      deletionRequest = {
        request_id: "demo-deletion-1",
        status: "requested",
        scope_categories: categories.slice(),
        requested_at: new Date().toISOString(),
        completed_at: null,
        failure_detail: null,
      };
      return { request_id: deletionRequest.request_id, status: deletionRequest.status, receipt: "demo-receipt-not-real", duplicate: false, source: "fixture" };
    },

    async getDeletionRequest(requestId) {
      await wait(100);
      if (!deletionRequest || deletionRequest.request_id !== requestId) {
        throw new ApiError("Không thấy yêu cầu xóa (dữ liệu minh họa).", 404, "http", { code: "not_found", details: { reason: "deletion_request_not_found" } });
      }
      return { ...deletionRequest, source: "fixture" };
    },

    async cancelDeletionRequest(requestId, { expectedRevision = null } = {}) {
      await wait(120);
      if (expectedRevision === 999) {
        // Sentinel mô phỏng 409 revision_conflict (trạng thái đã đổi trên máy chủ).
        throw new ApiError("Xung đột trạng thái (dữ liệu minh họa).", 409, "http", { code: "revision_conflict", details: { current_revision: 2 } });
      }
      if (deletionRequest && deletionRequest.request_id === requestId) {
        deletionRequest.status = "cancelled";
      }
      return { request_id: requestId, status: "cancelled", source: "fixture" };
    },

    async withdrawConsent({ purpose } = {}) {
      await wait(120);
      // F2: rút đúng sổ cái backend (ConsentRecord.withdraw — f01 models.py:
      // chỉ ĐÁNH DẤU withdrawn_at, giữ nguyên decision + policy_version) để
      // GET sau đó trả decision cũ + withdrawn:true + current theo version
      // (giống ConsentView.get). Chưa có bản ghi thì không bịa row — GET vẫn
      // trả {decision:"none", policy_version:null, withdrawn:false,
      // current:false} như backend khi sổ trống.
      const recorded = consents.get(purpose);
      if (recorded) recorded.withdrawn = true;
      return { purpose, withdrawn: true, source: "fixture" };
    },

    async createMoodEntry({ emotion, note = "" } = {}) {
      await simulate({ kind: "mood", fallback: "ok" });
      if (!emotion) {
        throw new ApiError("Thiếu cảm xúc (dữ liệu minh họa).", 400, "http", { code: "input_invalid", details: { field: "emotion" } });
      }
      return {
        entry_id: `demo-mood-${moodEntries}`,
        emotion,
        note: note || "",
        entry_date: new Date().toISOString().slice(0, 10),
        revision: 1,
        source: "fixture",
      };
    },

    async listMoodEntries() {
      await wait(100);
      return { results: [], nextCursor: null, source: "fixture" };
    },

    async programMy() {
      await wait(100);
      return { results: [], source: "fixture" };
    },

    async programWeeks(programKey) {
      await wait(100);
      return { results: [], program_key: programKey, source: "fixture" };
    },

    async activitiesCatalog({ kind = null } = {}) {
      await wait(100);
      return { results: [], kind, source: "fixture" };
    },
  };
}
