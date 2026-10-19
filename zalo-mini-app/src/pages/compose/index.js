// U34 — Soạn Thư Cảm Xúc / Khoảng dừng 5 phút (Stitch upgrade 2026-10).
// Tham chiếu: docs/design/stitch-reference/u34_so_n_l_i_t_m_d_ng_5_ph_t/.
//
// Hợp đồng nghiệp vụ GIỮ NGUYÊN (backend family_bridge_features.f06_drafts,
// WF-13/DEC-03; QA cấm tự-gửi):
// - Khoảng dừng là 300 giây CỐ ĐỊNH do MÁY CHỦ quyết (deadline + server_time
//   từ API). Client KHÔNG tự đếm bằng timer nội bộ (DSA-10 và test QA
//   cấm hàm đếm lặp trong src; thời gian còn lại được tính lại từ dữ liệu
//   máy chủ mỗi lần tải/làm mới — không polling).
// - Hết giờ KHÔNG tự gửi. Gửi = chọn người nhận + xem trước (preview) +
//   xác nhận cuối cùng của người dùng (confirm-send). Không tự retry thao
//   tác ghi; kết quả không rõ ràng được báo "CHƯA XÁC ĐỊNH".
// - Nháp riêng tư: chỉ tác giả nhìn thấy; sửa nội dung làm preview cũ hết
//   giá trị (revision). Giới hạn body 4000 ký tự theo backend.
// Ngoại lệ so với prototype (ghi trong docs/design/stitch-ui-upgrade/):
// - "An toàn 100%" chưa chứng minh -> "Riêng tư theo thiết kế".
// - Đồng hồ đếm giây chạy liên tục -> badge tính từ dữ liệu máy chủ + nút
//   làm mới (không polling); thanh tiến trình chạy bằng CSS transition.
// - "Tổng đài tham vấn 111 & chuyên gia luôn sẵn sàng" -> dẫn về trang Trợ
//   giúp (nguồn liên hệ được xác minh ở đó), không tự nhét hotline.
//
// M4 restyle (w11/w12 Stitch — CHỈ PRESENTATION, hành vi giữ nguyên):
// - Desktop >=1024px: bố cục 2 cột (.fb-compose-grid) — soạn thảo trái;
//   panel phải = thẻ đang chọn (link #/cards) + AI + dải an toàn.
// - w12: SVG vòng đếm pause (stroke --fb-accent, đổi --fb-success khi hết)
//   TÍNH TỪ remainingFromServer()/deadline máy chủ — KHÔNG timer lặp
//   (DSA-10); body nháp bị làm mờ (niêm phong) trong lúc paused.
// - AI (F04) là cổng THẬT: aiStatus() bật/tắt; aiRefine({text,key,inputRevision})
//   -> thẻ gợi ý; "Dùng gợi ý" -> aiAccept + chỉ điền VÀO TEXTAREA (không auto-save,
//   không tự gửi — mọi thao tác ghi chờ người dùng xác nhận); "Bỏ" -> aiDiscard.
//   Không có key -> không gọi.
//
// F04 hợp đồng v1 (coordinator freeze — US-029/US-033):
// - Response DTO NGUYÊN từ máy chủ, field text duy nhất là `suggested_text`
//   (không có refined_text). Gợi ý render qua textContent — KHÔNG innerHTML.
// - inputRevision (C4): mỗi ô soạn giữ revision bắt đầu từ 1, tăng MỖI input
//   event; gửi kèm aiRefine. Gợi ý gắn với revision lúc tạo: người dùng sửa
//   text trước/trong/sau khi response về -> gợi ý STALE (frame zalo_f04_07):
//   cảnh báo + nút "Dùng gợi ý" DISABLED, chỉ còn viết tay / tạo gợi ý mới.
// - Consent (C5): trước lần gọi refine đầu tiên khi chưa có consent
//   `ai_processing` active -> sheet disclosure: nói rõ dữ liệu gì được gửi,
//   Gemini là BÊN XỬ LÝ KỸ THUẬT (không phải người thân đọc tin), từ chối vẫn
//   viết/lưu/gửi tay. Không precheck-bọc-gộp với gửi tin.
// - Không auto-generate (C6): AI chỉ chạy khi bấm nút; loading không chặn gõ
//   tay/lưu nháp/help; AI off/503/timeout/quota -> thông báo trung thực,
//   KHÔNG fallback giả gợi ý.
//
// N01 (QA 19/10 — P1 "gửi sai bản đã duyệt", US-033; tái hiện browser thật
// @ e0ee388, FAIL 2/2 client):
// - Bấm "Xem trước nội dung" -> request preview bị trì hoãn -> textarea VẪN
//   sửa được, author đổi thành B -> request đi tiếp, server bind bản A ->
//   sheet xác nhận đọc LIVE textarea hiển thị B -> xác nhận -> người nhận
//   nhận A (khác B đã duyệt). Hợp đồng fix (freeze toàn đội):
//   1) previewSeq token — sau MỖI await so lại token, lệch -> ABORT im lặng;
//   2) snapshot (body/recipient/revision) chốt TRƯỚC await preview;
//   3) đang bay: khóa textarea + chọn người nhận + nút preview (rào cản 1);
//   4) sau await: body/recipient/revision đổi -> KHÔNG mở sheet + thông báo
//      trung thực + mở khóa (rào cản 2);
//   5) sheet hiển thị preview.body ?? snapshotBody (hợp đồng mới của máy chủ
//      có `body` — parity backend A2/mock A1) — TUYỆT ĐỐI không đọc live text;
//   6) Gửi: re-verify trước confirmDraftSend; lệch -> lỗi trong sheet, không
//      gửi, không đóng sheet ép;
//   7) sync editDraft lỗi -> dừng flow, không preview, mở khóa.
//
// N03 (QA 19/10 — P1 "duyệt A gửi B", hai chiều web-review/mini-edit và
// mini-review/web-edit): N01 chỉ so snapshot với LOCAL; sheet còn lấy tên
// người nhận từ state cũ. Fix: sau await previewDraft thêm rào cản
// SERVER-TRUTH — đối chiếu preview.revision/recipient_id/body với snapshot;
// lệch -> KHÔNG mở sheet, getDraft refresh + note trung thực; sheet resolve
// tên TỪ preview.recipient_id qua connections, không resolve được -> fail
// closed (khóa gửi, không fallback tên cũ); re-verify lúc bấm Gửi gồm cả
// state.revision === preview.revision.
//
// N04 (QA 19/10 — P2): copy vùng soạn chọn theo role MÁY CHỦ đã xác minh
// (store.role — server trả role lúc đăng nhập lớp, login setRole ngay;
// role-select chỉ là lựa chọn xem trước demo). Parity chuỗi TUYỆT ĐỐI với
// web/src/pages/compose/index.js: caregiver = "Lời bạn muốn gửi" + placeholder
// trung tính; student giữ chuỗi cũ. Chỉ là copy UI — quyền vẫn backend.
//
// N06 (QA 19/10 — P2): MỌI editDraft (lưu nháp thủ công, auto-sync trước
// preview) truyền expectedRevision: state.revision. 409 revision_conflict ->
// panel xung đột: giữ text người dùng, fetch bản server, 2 lựa chọn rõ
// ("Cập nhật theo bản trên máy chủ" / "Ghi đè bằng bản của tôi" — lần ghi đè
// gửi expectedRevision = current_revision). Không auto-retry/merge/mất text.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import { POLICY_PURPOSES } from "../../core/policy.js";
import {
  createButton,
  createSheet,
  createEmptyState,
  createErrorState,
  createDemoBanner,
  createTopBar,
  createIcon,
  createSkeleton,
} from "../../components/index.js";

const BODY_MAX = 4000; // ràng buộc backend (f06 _content_fields)
const PAUSE_SECONDS = 300; // hiển thị khoảng dừng chuẩn (máy chủ quyết thật)
const DRAFT_KIND = "text"; // backend KINDS chỉ nhận ("text","emotion_card")

// R2A3-04: aiStatus LỖI (mạng/phiên) ≠ AI OFF thật — sentinel để note không
// tuyên bố sai "chưa được bật trên máy chủ" khi thực ra là không kiểm tra được.
const AI_STATUS_UNREACHABLE = { unreachable: true };

// N01: copy trung thực cho trạng thái preview-locked + invalidate (dùng chung
// một nguồn để status note + title nút không lệch nhau).
const PREVIEW_BUSY_NOTE = "Đang lấy bản xem trước từ máy chủ…";
const PREVIEW_INVALIDATE_NOTE =
  "Nội dung hoặc người nhận đã thay đổi trong khi lấy bản xem trước — hãy bấm “Xem trước nội dung” lại.";

// N03: máy chủ trả bản preview KHÁC snapshot client (revision/recipient/body)
// -> không mở sheet; refresh từ server + note trung thực cho cả hai kết cục.
const PREVIEW_SERVER_CHANGED_NOTE =
  "Bản nháp đã thay đổi ở nơi khác (nội dung/người nhận). Đã tải bản mới — hãy xem lại trước khi gửi.";
const PREVIEW_SERVER_REFRESH_FAILED_NOTE =
  "Bản nháp đã thay đổi ở nơi khác nhưng chưa tải được bản mới từ máy chủ — chưa mở xác nhận gửi. Vui lòng thử lại.";

// N04: copy vùng soạn theo vai trò MÁY CHỦ đã xác minh. Chuỗi parity TUYỆT
// ĐỐI với web/src/pages/compose/index.js (editorCopy) — KHÔNG tự chế xưng hô;
// role nguồn: store.role (server trả lúc đăng nhập lớp; role-select chỉ là
// xem trước demo). Thiếu role -> mặc định student như web (state.role || "student").
const EDITOR_COPY = {
  caregiver: {
    label: "Lời bạn muốn gửi",
    placeholder: "Chia sẻ điều bạn muốn nhắn gửi một cách nhẹ nhàng…",
  },
  student: {
    label: "Lời con muốn gửi",
    placeholder: "Chia sẻ suy nghĩ chân thật nhất của con lúc này...",
  },
};

// Vòng đếm pause SVG (w12): stroke chạy theo tỷ lệ remaining/PAUSE_SECONDS.
const RING_RADIUS = 28;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

/** Khóa idempotency cho lượt gọi ghi — client tạo tại nút bấm. */
function newIdemKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `fb-${Date.now().toString(36)}-`
    + `${Math.random().toString(36).slice(2, 12)}-`
    + `${Math.random().toString(36).slice(2, 12)}`;
}

/** ctx.store có thể là snapshot hoặc module store — đọc state an toàn. */
function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

function busyGuard() {
  const busy = new Set();
  return function guarded(key, fn) {
    if (busy.has(key)) return;
    busy.add(key);
    Promise.resolve()
      .then(fn)
      .finally(() => busy.delete(key));
  };
}

/** mm:ss từ số giây (badge tĩnh theo dữ liệu máy chủ). */
function formatRemaining(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Giây còn lại theo dữ liệu MÁY CHỦ: (deadline - server_time) trừ phần thời
 * gian trôi trên thiết bị kể từ lúc fetch (chỉ để hiển thị; quyết định mở
 * preview luôn thuộc máy chủ).
 */
function remainingFromServer({ deadlineIso, serverTimeIso, fetchedAtMs }) {
  if (!deadlineIso) return null;
  const total = (Date.parse(deadlineIso) - Date.parse(serverTimeIso)) / 1000;
  const elapsed = (Date.now() - fetchedAtMs) / 1000;
  return Math.max(0, Math.ceil(total - elapsed));
}

export const page = {
  id: "f06-compose",
  title: "Soạn Thư Cảm Xúc",
  requiresRole: true,
  showBottomNav: false,

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const demo = Boolean(state.demoMode);

    const root = h("div", { class: "fb-page", dataset: { page: "f06-compose" } });

    // Top bar: back + tiêu đề + pill Trợ giúp bên trái vùng capsule Zalo.
    const helpPill = h("a", {
      class: "fb-top-bar__help-pill",
      href: "#/help",
      "aria-label": "Trợ giúp khẩn cấp và tâm lý",
    },
      createIcon({ name: "support_agent", size: 18 }),
      h("span", {}, "Trợ giúp"),
    );
    root.appendChild(createTopBar({
      title: "Soạn Thư Cảm Xúc",
      showBack: true,
      actions: [helpPill],
    }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    // Production cần phiên sống (nháp là dữ liệu riêng của tác giả).
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để soạn thư",
          description:
            "Bản nháp là nội dung riêng tư của bạn nên cần phiên đăng nhập. " +
            "Đăng nhập bằng Zalo để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải bản soạn…"));

    const currentRun = ++runId;

    Promise.all([
      Promise.resolve().then(() => ctx.adapter.listConnections({ limit: 20 })).catch(() => null),
      Promise.resolve().then(() => ctx.adapter.listDrafts({ limit: 20 })).catch(() => null),
      // F04 AI: trạng thái cổng gợi ý THẬT — lỗi/không bật không chặn trang;
      // nút AI chỉ mở khi máy chủ báo bật (ai_enabled). Lỗi mạng → sentinel
      // riêng (R2A3-04): không được nuốt thành "AI off".
      Promise.resolve().then(() => ctx.adapter.aiStatus()).catch(() => AI_STATUS_UNREACHABLE),
    ])
      .then(([connectionsPage, draftsPage, aiStatus]) => {
        if (cancelled || currentRun !== runId) return;
        const connections = (connectionsPage && connectionsPage.results) || [];
        const drafts = (draftsPage && draftsPage.results) || [];
        const activeDraft = drafts.find(
          (draftRow) => draftRow && (draftRow.status === "editing" || draftRow.status === "paused"),
        );
        renderCompose(body, ctx, {
          connections,
          draft: activeDraft || null,
          // Envelope list của backend kèm server_time — dùng để tính thời gian
          // còn lại của bản nháp đang paused khi tải lại trang (QA fix 3).
          listServerTimeIso: draftsPage && draftsPage.serverTime ? draftsPage.serverTime : null,
          demo,
          // Hợp đồng C1: máy chủ trả {ai_enabled} (express.py status()) — đọc
          // đúng shape, không fallback shape lạ (R2A3-05).
          aiEnabled: Boolean(aiStatus && aiStatus.ai_enabled === true),
          aiStatusUnknown: aiStatus === AI_STATUS_UNREACHABLE,
          // N04: role nguồn = store.role (server trả lúc đăng nhập lớp ->
          // setRole; role-select chỉ là xem trước demo). Parity web compose:
          // state.role || "student". Chỉ dùng cho copy UI — quyền vẫn backend.
          role: state.role || "student",
          // F04 (C7): mọi async AI phải bỏ qua kết quả khi đã rời trang/phiên cũ.
          stale: () => cancelled || currentRun !== runId,
        });
      })
      .catch(() => {
        if (cancelled || currentRun !== runId) return;
        renderLoadError(body);
      });

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

function renderLoadError(body) {
  clear(body);
  body.appendChild(
    createErrorState({
      title: "Không tải được màn soạn thư",
      description: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      retryLabel: "Thử lại",
      onRetry: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
}

/* ------------------------------ Màn soạn chính ------------------------------ */

function renderCompose(body, ctx, { connections, draft, listServerTimeIso, aiEnabled = false, aiStatusUnknown = false, role = "student", stale = () => false }) {
  clear(body);

  const guarded = busyGuard();
  // N04: copy theo vai (caregiver = chuỗi web parity; mặc định student).
  const editorCopy = EDITOR_COPY[String(role) === "caregiver" ? "caregiver" : "student"];
  const ui = {
    root: body,
    counter: null,
    textarea: null,
    timerBadge: null,
    progressFill: null,
    pauseBtnLabel: null,
    pauseBtnIcon: null,
    previewBtn: null,
    statusNote: null,
    recipientChangeBtn: null, // N01: nút "Đổi" người nhận — khóa khi preview đang bay
    pauseInfo: null,
    recipientName: null,
    recipientAvatar: null,
    privacyChipText: null,
    ringProgress: null, // w12: vòng đếm pause SVG (stroke theo remaining)
    sealedNote: null, // w12: ghi chú niêm phong khi paused
    aiPill: null,
    aiMsg: null,
    aiSuggestion: null,
    aiCancel: null, // F04: hủy CHỜ gợi ý (local, không tự retry)
  };

  const state = {
    draftId: draft ? draft.draft_id : null,
    revision: draft ? draft.revision : null,
    status: draft ? draft.status : "editing",
    pause: draft ? draft.pause : null,
    // R01 (QA F04 18/10): nội dung máy chủ ĐANG GIỮ cho bản nháp này —
    // preview phải tự đồng bộ nếu textarea (sau AI suggestion) khác bản này.
    syncedBody: draft && draft.body ? String(draft.body) : "",
    // R1B P1-1 (parity web): người nhận máy chủ ĐANG GIỮ — đổi CHỈ người nhận
    // (body nguyên) cũng phải tự đồng bộ editDraft trước preview, nếu không
    // preview bind người cũ -> drift check revert lựa chọn user + note sai
    // nguyên nhân ("thay đổi ở nơi khác" trong khi thay đổi là của user).
    syncedRecipientId: draft && draft.recipient_id != null ? String(draft.recipient_id) : null,
    // Ưu tiên dữ liệu máy chủ gắn sẵn trên từng row (remaining_seconds /
    // can_preview); server_time của envelope list dùng khi cần tính lại.
    rowRemainingSeconds: draft && draft.pause ? draft.pause.remaining_seconds : null,
    rowCanPreview: draft && draft.pause ? Boolean(draft.pause.can_preview) : false,
    serverTimeIso: draft ? (draft.server_time || listServerTimeIso || null) : (listServerTimeIso || null),
    fetchedAtMs: draft || listServerTimeIso ? Date.now() : null,
    recipientId: draft ? draft.recipient_id : null,
    connections,
    aiEnabled,
    aiStatusUnknown, // R2A3-04: không kiểm tra được trạng thái AI ≠ AI off
    // N01: token phiên preview (tăng ở ĐẦU mỗi lượt chạy) + cờ "đang bay" để
    // refreshPauseUi giữ nút preview khóa giữa các lần gọi phụ.
    previewSeq: 0,
    previewInFlight: false,
  };

  // F04 hợp đồng v1 — trạng thái riêng của cổng AI trên trang này.
  // inputRevision (C4): bắt đầu 1, tăng MỖI input event trên textarea.
  const ai = {
    revision: 1,
    suggestion: null, // { dto, key, boundRevision } — dto là response NGUYÊN
    consentChecked: false, // đã đọc GET /consents trong phiên trang này
    consentChecking: false, // R2A3-02: đang bay lượt listConsents — chặn double-click
    consentActive: false, // ai_processing: accepted + current + không withdrawn
    policyVersion: POLICY_PURPOSES.ai_processing.version,
    busy: false, // refine đang chạy
    gen: 0, // generation — dùng để HỦY CHỜ local (không hủy request máy chủ)
    applying: false, // accept đang chạy (chống double-click)
    discarding: false, // discard đang chạy
  };

  // ---- Bố cục desktop 2 cột (w11): <1024px vẫn 1 cột (CSS) ----
  const grid = h("div", { class: "fb-compose-grid" });
  const mainCol = h("div", { class: "fb-compose-grid__main" });
  const sideCol = h("div", { class: "fb-compose-grid__side" });
  grid.appendChild(mainCol);
  grid.appendChild(sideCol);
  body.appendChild(grid);

  // ---- Dòng trạng thái riêng tư ----
  const privacyRow = h("div", { class: "fb-compose__privacy-row" });
  ui.privacyChipText = h("span", {},
    state.status === "paused" ? "Bản nháp riêng tư • Đang tạm dừng" : "Bản nháp riêng tư • Chưa gửi");
  privacyRow.appendChild(
    h("span", { class: "fb-chip fb-chip--high" },
      createIcon({ name: "lock", size: 16 }),
      ui.privacyChipText,
    ),
  );
  privacyRow.appendChild(
    h("span", { class: "fb-compose__safety" },
      createIcon({ name: "verified_user", size: 18, className: "fb-stitch-primary-icon" }),
      h("span", {}, "Riêng tư theo thiết kế"),
    ),
  );
  mainCol.appendChild(privacyRow);

  // ---- Thẻ người nhận ----
  const recipientCard = h("div", { class: "fb-scard fb-compose__recipient" });
  const recipientRow = h("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:var(--fb-space-2);min-width:0;" });
  const recipientWho = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-3);min-width:0;" });
  ui.recipientAvatar = h("span", { class: "fb-compose__avatar", "aria-hidden": "true" });
  recipientWho.appendChild(ui.recipientAvatar);
  const recipientText = h("div", { style: "display:flex;flex-direction:column;min-width:0;" });
  recipientText.appendChild(h("span", { class: "fb-sec__sub" }, "Gửi đến"));
  ui.recipientName = h("span", { class: "fb-compose__recipient-name" }, "…");
  recipientText.appendChild(ui.recipientName);
  recipientWho.appendChild(recipientText);
  recipientRow.appendChild(recipientWho);
  // N01 (test N01-3): nút "Đổi" mở sheet ĐỒNG BỘ trong nhịp click — đường đổi
  // người nhận phải luôn sẵn sàng (kể cả khi preview đang bay; rào cản 2 trong
  // onPreview là chốt chặn thật). busyGuard đẩy handler xuống vi mô-task nên
  // không dùng ở đây; chặn mở chồng sheet bằng cờ đồng bộ.
  let recipientSheetOpen = false;
  const changePill = h("button", {
    class: "fb-compose__change-btn",
    type: "button",
    onclick: () => {
      if (recipientSheetOpen) return;
      recipientSheetOpen = true;
      openRecipientSheet(body, ctx, state, ui, {
        onClosed: () => { recipientSheetOpen = false; },
      });
    },
  },
    h("span", {}, "Đổi"),
    createIcon({ name: "expand_more", size: 16 }),
  );
  // N01: nút "Đổi" người nhận KHÔNG bị khóa khi preview đang bay — đường đổi
  // qua sheet vẫn phải mở được (test N01-3 "đường khác qua sheet đang mở");
  // rào cản 2 (so snapshot sau await trong onPreview) là chốt chặn thật cho
  // thay đổi người nhận giữa chừng. Khi đang bay chỉ gắn giải thích trung
  // thực (title) cho control này.
  ui.recipientChangeBtn = changePill;
  recipientRow.appendChild(changePill);
  recipientCard.appendChild(recipientRow);
  mainCol.appendChild(recipientCard);

  // ---- Thẻ đang chọn (w11 panel phải): link tới thư viện thẻ F03 (M4) ----
  const intent = h("div", { class: "fb-compose__intent" });
  const intentHead = h("div", { class: "fb-sec__row" });
  intentHead.appendChild(
    h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);color:var(--fb-primary);font-weight:500;" },
      createIcon({ name: "style", size: 20 }),
      h("span", {}, "Thẻ đang chọn"),
    ),
  );
  intentHead.appendChild(
    h("a", { class: "fb-compose__cards-link", href: "#/cards" }, "Chọn từ thư viện thẻ"),
  );
  intent.appendChild(intentHead);
  const intentChip = h("div", { class: "fb-compose__intent-chip" });
  intentChip.appendChild(createIcon({ name: "edit_note", size: 22, fill: true, className: "fb-stitch-primary-icon" }));
  intentChip.appendChild(
    h("div", { style: "flex:1;min-width:0;" },
      h("p", { class: "fb-compose__intent-title" }, "Chưa chọn thẻ — bạn đang tự viết lời nhắn"),
      h("p", { class: "fb-sec__sub" }, "Thẻ cảm xúc từ Thư viện được gửi qua luồng riêng của thư viện; ô soạn này là lời nhắn tự viết của bạn."),
    ),
  );
  intent.appendChild(intentChip);
  sideCol.appendChild(intent);

  // ---- Vùng soạn thảo ----
  const editor = h("div", { class: "fb-scard" });
  const editorHead = h("div", { class: "fb-sec__row" });
  editorHead.appendChild(
    h("label", { class: "fb-compose__label", for: "fb-compose-body" },
      h("span", {}, editorCopy.label),
      h("span", { class: "fb-compose__required", "aria-hidden": "true" }, "*"),
    ),
  );
  ui.counter = h("span", { class: "fb-sec__sub", id: "fb-compose-counter" }, "0 ký tự");
  editorHead.appendChild(ui.counter);
  editor.appendChild(editorHead);

  ui.textarea = h("textarea", {
    id: "fb-compose-body",
    class: "fb-compose__textarea",
    rows: "5",
    maxlength: String(BODY_MAX),
    placeholder: editorCopy.placeholder,
    "aria-describedby": "fb-compose-counter",
  });
  if (draft && draft.body) ui.textarea.value = String(draft.body);
  const syncCounter = () => {
    ui.counter.textContent = `${ui.textarea.value.length} ký tự`;
  };
  ui.textarea.addEventListener("input", () => {
    // C4: MỖI input event tăng inputRevision — gợi ý AI gắn với revision lúc
    // tạo; sửa nội dung làm gợi ý cũ thành STALE (render lại thẻ ngay).
    ai.revision += 1;
    syncCounter();
    if (ai.suggestion) renderAiSuggestion(ctx, ai, ui, state, stale);
  });
  syncCounter(); // đếm đúng cả khi tải lại bản nháp đã có nội dung
  editor.appendChild(ui.textarea);

  // w12: ghi chú niêm phong — hiện khi trạng thái paused (refreshPauseUi).
  ui.sealedNote = h("p", { class: "fb-compose__sealed-note", hidden: true },
    createIcon({ name: "lock", size: 16 }),
    h("span", {},
      " Nội dung đang được làm mờ trong lúc tạm dừng để tránh kích hoạt lại cảm xúc. "
      + "Bản nháp được lưu trên máy chủ, chỉ bạn và người nhận (sau khi gửi) xem được."),
  );
  editor.appendChild(ui.sealedNote);
  mainCol.appendChild(editor);

  // ---- Khoảng dừng bình tâm (máy chủ quyết) ----
  const pauseCard = h("div", { class: "fb-scard" });
  const pauseHead = h("div", { class: "fb-sec__row" });
  const pauseWho = h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-2);min-width:0;" });
  const hourglass = h("span", { class: "fb-compose__hourglass", "aria-hidden": "true" });
  hourglass.appendChild(createIcon({ name: "hourglass_top", size: 20 }));
  pauseWho.appendChild(hourglass);
  pauseWho.appendChild(
    h("div", {},
      h("h2", { class: "fb-scard__title" }, "Khoảng dừng bình tâm"),
      h("p", { class: "fb-sec__sub" }, "Lắng nghe nhịp thở trước khi gửi gắm"),
    ),
  );
  pauseHead.appendChild(pauseWho);
  // w12: vòng đếm pause SVG — stroke --fb-accent, đổi --fb-success khi hết giờ;
  // chỉ là HIỂN THỊ của remaining máy chủ (refreshPauseUi), không timer.
  const ringWrap = h("span", { class: "fb-compose__ring", "aria-hidden": "true" });
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ringSvg = document.createElementNS(SVG_NS, "svg");
  ringSvg.setAttribute("viewBox", "0 0 64 64");
  ringSvg.setAttribute("width", "44");
  ringSvg.setAttribute("height", "44");
  ringSvg.setAttribute("focusable", "false");
  const ringTrack = document.createElementNS(SVG_NS, "circle");
  ringTrack.setAttribute("cx", "32");
  ringTrack.setAttribute("cy", "32");
  ringTrack.setAttribute("r", String(RING_RADIUS));
  ringTrack.setAttribute("fill", "none");
  ringTrack.setAttribute("stroke", "var(--fb-surface-high)");
  ringTrack.setAttribute("stroke-width", "6");
  ringSvg.appendChild(ringTrack);
  const ringProgress = document.createElementNS(SVG_NS, "circle");
  ringProgress.setAttribute("cx", "32");
  ringProgress.setAttribute("cy", "32");
  ringProgress.setAttribute("r", String(RING_RADIUS));
  ringProgress.setAttribute("fill", "none");
  ringProgress.setAttribute("stroke", "var(--fb-accent)");
  ringProgress.setAttribute("stroke-width", "6");
  ringProgress.setAttribute("stroke-linecap", "round");
  ringProgress.setAttribute("stroke-dasharray", String(RING_CIRC));
  ringProgress.setAttribute("stroke-dashoffset", String(RING_CIRC));
  ringProgress.setAttribute("transform", "rotate(-90 32 32)");
  ringProgress.setAttribute("class", "fb-compose__ring-progress");
  ringSvg.appendChild(ringProgress);
  ringWrap.appendChild(ringSvg);
  ui.ringProgress = ringProgress;
  pauseHead.appendChild(ringWrap);
  ui.timerBadge = h("span", { class: "fb-timer-badge", role: "timer", "aria-label": "Thời gian tạm dừng còn lại theo máy chủ" });
  pauseHead.appendChild(ui.timerBadge);
  pauseCard.appendChild(pauseHead);

  const progress = h("div", { class: "fb-progress", "aria-hidden": "true" });
  ui.progressFill = h("div", { class: "fb-progress__fill" });
  progress.appendChild(ui.progressFill);
  pauseCard.appendChild(progress);

  ui.pauseInfo = h("div", { class: "fb-compose__pause-info" });
  pauseCard.appendChild(ui.pauseInfo);

  const pauseButtons = h("div", { class: "fb-compose__pause-buttons" });
  const pauseBtn = h("button", { class: "fb-btn fb-btn--neutral fb-compose__pause-btn", type: "button" });
  ui.pauseBtnIcon = createIcon({ name: "play_arrow", size: 20 });
  ui.pauseBtnLabel = h("span", {}, "Bắt đầu 5 phút nghỉ");
  pauseBtn.appendChild(ui.pauseBtnIcon);
  pauseBtn.appendChild(ui.pauseBtnLabel);
  pauseBtn.addEventListener("click", () => guarded("pause", () => onTogglePause(ctx, state, ui)));
  pauseButtons.appendChild(pauseBtn);

  const saveBtn = h("button", { class: "fb-btn fb-btn--primary fb-compose__pause-btn", type: "button" });
  saveBtn.appendChild(createIcon({ name: "bookmark_add", size: 20 }));
  saveBtn.appendChild(h("span", {}, "Lưu nháp riêng"));
  saveBtn.addEventListener("click", () => guarded("save", () => onSaveDraft(ctx, state, ui)));
  pauseButtons.appendChild(saveBtn);
  pauseCard.appendChild(pauseButtons);

  ui.statusNote = h("p", { class: "fb-page__note", role: "status" }, "");
  pauseCard.appendChild(ui.statusNote);
  mainCol.appendChild(pauseCard);

  // ---- CTA xem trước + trợ giúp ----
  const footer = h("div", { class: "fb-compose__footer" });
  ui.previewBtn = h("button", { class: "fb-btn-hero", type: "button" },
    h("span", {}, "Xem trước nội dung"),
    createIcon({ name: "arrow_forward", size: 22 }),
  );
  ui.previewBtn.addEventListener("click", () => guarded("preview", () => onPreview(ctx, state, ui)));
  footer.appendChild(ui.previewBtn);
  footer.appendChild(
    h("div", { class: "fb-compose__footer-note" },
      createIcon({ name: "check_circle", size: 16, className: "fb-compose__check" }),
      h("span", {}, "Bước đệm xem trước giúp bạn an tâm, không lo gửi nhầm"),
    ),
  );
  mainCol.appendChild(footer);

  // ---- Khối AI (F04) — panel phải: cổng THẬT qua aiStatus/aiRefine/... ----
  const aiCard = h("div", { class: "fb-scard fb-compose__ai-card" });
  const aiBox = h("div", { class: "fb-compose__ai" });
  const aiRow = h("div", { class: "fb-sec__row" });
  ui.aiPill = h("button", {
    class: "fb-btn fb-btn--primary fb-compose__ai-btn",
    type: "button",
    disabled: !state.aiEnabled,
    title: state.aiEnabled
      ? "Xin gợi ý diễn đạt êm ái hơn cho lời nhắn hiện tại. Bạn xem, sửa và quyết định trước khi dùng."
      : aiGateNote(state).trim(),
  },
    createIcon({ name: "auto_awesome", size: 18 }),
    h("span", {}, "AI gợi ý cách diễn đạt êm ái hơn"),
  );
  ui.aiPill.addEventListener("click", () => guarded("ai", () => onAiRefine(ctx, ai, ui, state, stale)));
  aiRow.appendChild(ui.aiPill);
  // Nhãn cạnh nút nói về SỰ KIỂM SOÁT của người dùng (C5) — không dùng nhãn
  // "Riêng tư" ngụ ý dữ liệu không rời máy chủ.
  aiRow.appendChild(
    h("span", { class: "fb-sec__sub", style: "display:inline-flex;align-items:center;gap:4px;" },
      createIcon({ name: "shield", size: 14 }),
      "Bạn duyệt trước khi dùng",
    ),
  );
  aiBox.appendChild(aiRow);
  ui.aiMsg = h("p", { class: "fb-compose__ai-note", role: "status" },
    createIcon({ name: "info", size: 16, className: "fb-stitch-tertiary-icon" }),
    h("span", {},
      state.aiEnabled
        ? " Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời nhắn của mình."
        : aiGateNote(state)),
  );
  aiBox.appendChild(ui.aiMsg);
  // Loading (frame zalo_f04_04): KHÔNG khóa soạn/lưu/help; chỉ có nút HỦY CHỜ
  // — hủy locally việc nhận kết quả, không tự retry, không hủy máy chủ.
  ui.aiCancel = h("button", {
    class: "fb-btn fb-btn--ghost fb-compose__ai-cancel",
    type: "button",
    hidden: true,
  }, "Hủy chờ gợi ý");
  ui.aiCancel.addEventListener("click", () => {
    if (!ai.busy) return;
    ai.gen += 1;
    ai.busy = false;
    setAiLoading(ui, false, state);
    setAiMsg(ui, "Bạn đã hủy chờ gợi ý — lời nhắn giữ nguyên. Bấm lại khi bạn sẵn sàng.");
  });
  aiBox.appendChild(ui.aiCancel);
  ui.aiSuggestion = h("div", { class: "fb-compose__ai-suggestion", hidden: true });
  aiBox.appendChild(ui.aiSuggestion);
  aiCard.appendChild(aiBox);
  sideCol.appendChild(aiCard);

  const helpCard = h("div", { class: "fb-scard fb-compose__help-card" });
  helpCard.appendChild(
    h("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:var(--fb-space-2);" },
      h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-3);min-width:0;" },
        h("span", { class: "fb-compose__hourglass fb-compose__help-circle", "aria-hidden": "true" },
          createIcon({ name: "support_agent", size: 22 }),
        ),
        h("div", {},
          h("p", { class: "fb-compose__recipient-name" }, "Cảm xúc đang quá tải?"),
          h("p", { class: "fb-sec__sub" }, "Xem các kênh trợ giúp đã được xác minh trong trang Trợ giúp"),
        ),
      ),
      h("a", { class: "fb-help-bar__action", href: "#/help" },
        h("span", {}, "Kết nối"),
        createIcon({ name: "chevron_right", size: 16 }),
      ),
    ),
  );
  sideCol.appendChild(helpCard);

  // ---- Khởi tạo trạng thái hiển thị ----
  refreshRecipientUi(state, ui);
  refreshPauseUi(state, ui);
}

/* ------------------------ Hành vi: gợi ý AI (F04) ------------------------ */

/**
 * Đánh giá consent `ai_processing` từ GET /api/v1/consents (shape backend:
 * {purpose, decision, policy_version, withdrawn, current}; mock/demo có thể
 * thiếu `current` — khi đó đối chiếu policy_version hiện hành client-side).
 * Active = accepted + không withdrawn + phiên bản hiện hành.
 */
function evaluateAiConsent(rows) {
  const fallbackVersion = POLICY_PURPOSES.ai_processing.version;
  const row = Array.isArray(rows)
    ? rows.find((item) => item && item.purpose === "ai_processing")
    : null;
  if (!row) return { active: false, policyVersion: fallbackVersion };
  const accepted = row.decision === "accepted" && !row.withdrawn;
  let currentOk;
  if (row.current === true) currentOk = true;
  else if (row.current === false) currentOk = false;
  else currentOk = !row.policy_version || row.policy_version === fallbackVersion;
  return {
    active: Boolean(accepted && currentOk),
    policyVersion: row.current === true && row.policy_version
      ? row.policy_version
      : fallbackVersion,
  };
}

/**
 * R2A3-04: note trạng thái cổng AI trung thực theo nguyên nhân —
 * (a) máy chủ trả {ai_enabled:false} → "chưa được bật";
 * (b) không kiểm tra được (lỗi mạng/phiên) → không tuyên bố thay máy chủ.
 */
function aiGateNote(state) {
  return state.aiStatusUnknown
    ? " Chưa kiểm tra được trạng thái cổng gợi ý AI (mạng hoặc phiên) — bạn vẫn viết tay, lưu nháp và gửi bình thường."
    : " Cổng gợi ý AI chưa được bật trên máy chủ — bạn vẫn viết tay, lưu nháp và gửi bình thường. Nút sẽ mở khi máy chủ bật.";
}

/** Bật/tắt trạng thái loading (C6): KHÔNG khóa textarea/lưu nháp/help. */
function setAiLoading(ui, loading, state) {
  if (ui.aiPill) ui.aiPill.disabled = Boolean(loading) || !state.aiEnabled;
  if (ui.aiCancel) ui.aiCancel.hidden = !loading;
}

function setAiMsg(ui, text) {
  if (ui.aiMsg) ui.aiMsg.textContent = text;
}

/**
 * Xin gợi ý từ máy chủ (aiRefine; key idempotency + inputRevision do client tạo).
 * regenerate = nút "Tạo gợi ý mới" từ thẻ stale: bỏ lượt đang chờ (hủy chờ
 * local) rồi gọi lượt mới — vẫn giữ đúng MỘT refine inflight cho actor (C6).
 */
function onAiRefine(ctx, ai, ui, state, stale, { regenerate = false } = {}) {
  if (ai.busy) {
    if (!regenerate) return; // double-click / chồng lượt
    ai.gen += 1; // hủy CHỜ lượt cũ (không tự retry máy chủ)
    ai.busy = false;
  }
  const text = currentBodyText(ui).trim();
  if (!text) {
    setAiMsg(ui, "Hãy viết vài dòng trước khi dùng gợi ý AI.");
    return;
  }
  if (!state.aiEnabled) {
    // Nút đã disabled khi off/unknown — dòng này chỉ là rào chắn dự phòng;
    // note phải trung thực theo nguyên nhân (R2A3-04).
    setAiMsg(ui, aiGateNote(state).trim());
    return;
  }
  // C5: chốt consent `ai_processing` active TRƯỚC lần gọi refine đầu tiên.
  if (ai.consentChecked && ai.consentActive) {
    requestAiRefine(ctx, ai, ui, state, stale);
    return;
  }
  // R2A3-02: double-click trong cửa sổ listConsents đang bay → chỉ MỘT lượt
  // kiểm tra (1 sheet / tối đa 1 POST consents; server append-ledger).
  if (ai.consentChecking) return;
  setAiMsg(ui, "Đang kiểm tra thiết lập đồng ý…");
  ai.consentChecking = true;
  Promise.resolve()
    .then(() => ctx.adapter.listConsents())
    .then((rows) => {
      if (stale()) return;
      ai.consentChecking = false;
      const verdict = evaluateAiConsent(rows);
      ai.consentChecked = true;
      ai.consentActive = verdict.active;
      ai.policyVersion = verdict.policyVersion;
      if (verdict.active) {
        requestAiRefine(ctx, ai, ui, state, stale);
        return;
      }
      openAiConsentSheet(ctx, ai, ui, state, stale);
    })
    .catch(() => {
      if (stale()) return;
      ai.consentChecking = false;
      // Không đọc được trạng thái đồng ý -> hỏi người dùng; máy chủ vẫn là
      // cổng chốt cuối (refine không consent sẽ bị 403 consent_required).
      openAiConsentSheet(ctx, ai, ui, state, stale);
    });
}

/** Gọi aiRefine THẬT — chỉ chạy sau khi consent đã active (C5). */
function requestAiRefine(ctx, ai, ui, state, stale) {
  const text = currentBodyText(ui).trim();
  if (!text) {
    setAiMsg(ui, "Hãy viết vài dòng trước khi dùng gợi ý AI.");
    return;
  }
  ai.busy = true;
  ai.gen += 1;
  const myGen = ai.gen;
  setAiLoading(ui, true, state);
  setAiMsg(ui, "Đang tạo gợi ý diễn đạt… Bạn vẫn gõ tay, lưu nháp và mở Trợ giúp bình thường.");
  const key = newIdemKey();
  const revisionAtRequest = ai.revision;
  Promise.resolve()
    .then(() => ctx.adapter.aiRefine({ text, key, inputRevision: revisionAtRequest }))
    .then((suggestion) => {
      // C7: rời trang / hủy chờ -> bỏ qua kết quả cũ, không render state cũ.
      if (stale() || myGen !== ai.gen) return;
      ai.busy = false;
      setAiLoading(ui, false, state);
      if (!suggestion
        || !suggestion.suggestion_id
        || typeof suggestion.suggested_text !== "string"
        || !suggestion.suggested_text.trim()) {
        // Không fallback gợi ý giả (C6) — báo lỗi trung thực.
        throw new Error("invalid_suggestion");
      }
      // C4: gợi ý gắn với revision lúc tạo. Ưu tiên echo `input_revision`
      // của máy chủ; thiếu echo thì dùng revision client gửi kèm request.
      const echo = Number(suggestion.input_revision);
      ai.suggestion = {
        dto: suggestion,
        key,
        boundRevision: Number.isFinite(echo) && echo > 0 ? echo : revisionAtRequest,
      };
      renderAiSuggestion(ctx, ai, ui, state, stale);
      setAiMsg(ui, "Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời nhắn của mình.");
    })
    .catch((error) => {
      if (stale() || myGen !== ai.gen) return;
      ai.busy = false;
      setAiLoading(ui, false, state);
      if (error && error.code === "consent_required") {
        // Consent bị rút/đổi phiên bản giữa phiên -> mở lại sheet (C5).
        ai.consentChecked = false;
        ai.consentActive = false;
        setAiMsg(ui, "Máy chủ yêu cầu đồng ý xử lý AI trước khi tạo gợi ý.");
        openAiConsentSheet(ctx, ai, ui, state, stale);
        return;
      }
      setAiMsg(ui, describeError(error,
        "Chưa tạo được gợi ý — hệ thống hỗ trợ diễn đạt đang bận hoặc gián đoạn. "
        + "Lời nhắn của bạn giữ nguyên: bạn có thể viết tay, lưu nháp hoặc thử lại sau."));
    });
}

/** Sheet disclosure consent AI (frames zalo_f04_02/03) — C5. */
function openAiConsentSheet(ctx, ai, ui, state, stale) {
  const sheetError = h("div", { role: "alert" });

  const agreeBtn = createButton({
    label: "Đồng ý và tạo gợi ý",
    variant: "primary",
    onClick: () => {
      agreeBtn.disabled = true;
      Promise.resolve()
        .then(() => ctx.adapter.recordConsent({
          purpose: "ai_processing",
          policyVersion: ai.policyVersion || POLICY_PURPOSES.ai_processing.version,
          decision: "accepted",
        }))
        .then(() => {
          ai.consentChecked = true;
          ai.consentActive = true;
          closeSheet();
          setAiMsg(ui, "Bạn đã cho phép xử lý để tạo gợi ý — đang tạo…");
          requestAiRefine(ctx, ai, ui, state, stale);
        })
        .catch((error) => {
          agreeBtn.disabled = false;
          clear(sheetError);
          sheetError.appendChild(
            h("p", { class: "fb-compose__sheet-error", role: "alert" },
              describeError(error,
                "Chưa ghi nhận được lựa chọn đồng ý. Bạn vẫn viết tay, lưu nháp và gửi bình thường — thử lại sau."),
            ),
          );
        });
    },
  });

  const declineBtn = createButton({
    label: "Viết tay thôi",
    variant: "ghost",
    onClick: () => {
      closeSheet();
      setAiMsg(ui, "Bạn chọn không dùng gợi ý AI — bạn vẫn viết tay, lưu nháp, xem trước và gửi bình thường.");
    },
  });

  const content = h("div", { class: "fb-ai-consent" },
    h("p", { class: "fb-page__note" },
      "Để tạo gợi ý diễn đạt, bạn cần cho phép xử lý nội dung sau. Việc này riêng cho gợi ý AI — không liên quan đến bước gửi thư."),
    h("div", { class: "fb-ai-consent__block" },
      h("p", { class: "fb-ai-consent__head" }, "Dữ liệu sẽ được gửi đi:"),
      h("ul", { class: "fb-ai-consent__list" },
        h("li", {}, "Câu bạn đang soạn trong ô lời nhắn."),
        h("li", {}, "Ngữ cảnh bạn tự nguyện thêm (nếu có)."),
        h("li", {}, "Không gửi lịch sử trò chuyện, nhật ký hay thông tin của người khác."),
      ),
    ),
    h("div", { class: "fb-ai-consent__block" },
      h("p", { class: "fb-ai-consent__head" }, "Ai xử lý dữ liệu này:"),
      h("ul", { class: "fb-ai-consent__list" },
        h("li", {}, "Câu và ngữ cảnh trên được chuyển đến dịch vụ AI (Gemini của Google) — bên xử lý kỹ thuật theo chính sách của ứng dụng — để đề xuất cách diễn đạt."),
        h("li", {}, "Người thân của bạn không đọc phần này. Người nhận chỉ thấy lời nhắn cuối cùng sau khi bạn xem trước và tự bấm gửi; bản gốc và gợi ý không được gửi kèm."),
      ),
    ),
    h("div", { class: "fb-ai-consent__block" },
      h("p", { class: "fb-ai-consent__head" }, "Bạn luôn kiểm soát:"),
      h("ul", { class: "fb-ai-consent__list" },
        h("li", {}, "Gợi ý chỉ điền vào ô soạn để bạn xem và sửa; không gì được gửi đi khi thiếu bước xác nhận của bạn."),
        h("li", {}, "Từ chối cũng không sao: bạn vẫn viết tay, lưu nháp, xem trước và gửi bình thường."),
      ),
    ),
    sheetError,
    agreeBtn,
    declineBtn,
  );

  const sheet = createSheet({
    title: "Trước khi dùng gợi ý AI",
    content,
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
  // Dời sheet vào trang để destroy() dọn được theo trang (C7).
  ui.root.appendChild(sheet);
  function closeSheet() {
    if (sheet && sheet.isConnected) sheet.remove();
  }
}

/**
 * Dùng gợi ý: aiAccept rồi điền suggested_text VÀO TEXTAREA (value — không
 * innerHTML). Không lưu nháp, không gửi, không tạo Message. Chốt revision
 * TẠI THỜI ĐIỂM BẤM (C4) — gợi ý cũ không bao giờ ghi đè nội dung mới.
 */
function onAiAccept(ctx, ai, ui, state, stale) {
  const row = ai.suggestion;
  if (!row || ai.applying) return;
  if (row.boundRevision !== ai.revision) {
    renderAiSuggestion(ctx, ai, ui, state, stale);
    setAiMsg(ui, "Gợi ý đã cũ sau khi bạn sửa nội dung — hãy tạo gợi ý mới hoặc viết tay.");
    return;
  }
  const revisionAtClick = ai.revision;
  ai.applying = true;
  renderAiSuggestion(ctx, ai, ui, state, stale); // khóa nút theo ai.applying
  Promise.resolve()
    .then(() => ctx.adapter.aiAccept(row.dto.suggestion_id))
    .then(() => {
      if (stale()) return;
      ai.applying = false;
      if (ai.revision !== revisionAtClick) {
        // Người dùng sửa nội dung trong lúc chờ máy chủ ghi nhận -> không
        // điền đè; thẻ gợi ý chuyển thành STALE (C4).
        renderAiSuggestion(ctx, ai, ui, state, stale);
        setAiMsg(ui, "Bạn đã sửa nội dung trong lúc ghi nhận — gợi ý không được điền đè. Hãy tạo gợi ý mới cho nội dung hiện tại.");
        return;
      }
      const suggested = String(row.dto.suggested_text || "");
      ai.suggestion = null;
      renderAiSuggestion(ctx, ai, ui, state, stale); // ẩn thẻ TRƯỚC khi dispatch input
      ui.textarea.value = suggested; // textContent/value — CẤM innerHTML
      ui.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      setAiMsg(ui, "Bạn đã dùng gợi ý — nội dung chỉ nằm trong ô soạn, chưa lưu nháp và chưa gửi.");
    })
    .catch((error) => {
      if (stale()) return;
      ai.applying = false;
      renderAiSuggestion(ctx, ai, ui, state, stale);
      setAiMsg(ui, describeError(error, "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại."));
    });
}

/** Bỏ gợi ý: aiDiscard (gọi API thật) rồi xóa thẻ — không đụng textarea. */
function onAiDiscard(ctx, ai, ui, state, stale) {
  const row = ai.suggestion;
  if (!row || ai.discarding) return;
  ai.discarding = true;
  renderAiSuggestion(ctx, ai, ui, state, stale);
  Promise.resolve()
    .then(() => ctx.adapter.aiDiscard(row.dto.suggestion_id))
    .then(() => {
      if (stale()) return;
      ai.discarding = false;
      ai.suggestion = null;
      renderAiSuggestion(ctx, ai, ui, state, stale);
      setAiMsg(ui, "Bạn đã bỏ gợi ý — lời nhắn hiện tại giữ nguyên.");
    })
    .catch((error) => {
      if (stale()) return;
      ai.discarding = false;
      renderAiSuggestion(ctx, ai, ui, state, stale);
      setAiMsg(ui, describeError(error, "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại."));
    });
}

/**
 * Thẻ gợi ý (frames zalo_f04_05/06; stale = frame zalo_f04_07): suggested_text
 * render qua textContent; khi STALE -> cảnh báo + "Dùng gợi ý" DISABLED, chỉ
 * còn viết tay / "Tạo gợi ý mới" / "Bỏ".
 */
function renderAiSuggestion(ctx, ai, ui, state, stale) {
  const wrap = ui.aiSuggestion;
  clear(wrap);
  const row = ai.suggestion;
  if (!row) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const isStale = row.boundRevision !== ai.revision;
  wrap.appendChild(
    h("p", { class: "fb-compose__ai-suggest-label" },
      isStale ? "Gợi ý của máy chủ (đã cũ):" : "Gợi ý của máy chủ:"),
  );
  wrap.appendChild(
    h("p", { class: "fb-compose__ai-suggest-text" }, String(row.dto.suggested_text || "")),
  );
  if (isStale) {
    wrap.appendChild(
      h("div", { class: "fb-compose__ai-banner fb-compose__ai-banner--warn", role: "alert" },
        h("p", { class: "fb-compose__ai-banner-title" }, "Nội dung đã thay đổi kể từ khi tạo gợi ý"),
        h("p", { class: "fb-compose__ai-banner-text" },
          "Gợi ý này được tạo từ bản trước và có thể không còn phù hợp. Nút “Dùng gợi ý” tạm khóa để không ghi đè nội dung bạn vừa sửa — bạn vẫn viết tay bình thường."),
      ),
    );
  } else {
    wrap.appendChild(
      h("p", { class: "fb-compose__ai-suggest-note" },
        "Bản gốc và gợi ý này không được gửi cho người nhận — chỉ lời nhắn cuối cùng bạn chủ động gửi."),
    );
  }
  const actions = h("div", { class: "fb-compose__pause-buttons" });
  const useBtn = createButton({
    label: "Dùng gợi ý",
    variant: "primary",
    onClick: () => onAiAccept(ctx, ai, ui, state, stale),
  });
  useBtn.disabled = isStale || ai.applying;
  actions.appendChild(useBtn);
  if (isStale) {
    actions.appendChild(createButton({
      label: "Tạo gợi ý mới",
      variant: "ghost",
      onClick: () => onAiRefine(ctx, ai, ui, state, stale, { regenerate: true }),
    }));
  }
  actions.appendChild(createButton({
    label: "Bỏ",
    variant: "ghost",
    onClick: () => onAiDiscard(ctx, ai, ui, state, stale),
  }));
  wrap.appendChild(actions);
}

/* --------------------------- Hành vi: người nhận --------------------------- */

function recipientLabel(connection) {
  const name = connection
    && connection.counterpart
    && connection.counterpart.display_name;
  if (name) return String(name);
  if (connection && connection.relationship_kind === "backup") {
    return "Người hỗ trợ dự phòng";
  }
  return "Người đồng hành";
}

/**
 * N03: resolve tên người nhận TỪ preview.recipient_id (server-truth) qua
 * connections trong state. Trả null khi id thiếu/không khớp kết nối nào —
 * caller PHẢI fail closed (không fallback tên cũ từ state).
 */
function resolveRecipientLabel(state, recipientId) {
  const pid = recipientId == null ? null : String(recipientId);
  if (!pid) return null;
  const connection = (state.connections || []).find((row) => row && (
    String(row.other_party_id) === pid || String(row.connection_id) === pid
  ));
  return connection ? recipientLabel(connection) : null;
}

/**
 * N03: nạp lại bản nháp TỪ MÁY CHỦ (getDraft) sau khi preview phản ánh bản
 * khác snapshot client — cập nhật state + textarea + counter + người nhận +
 * UI pause. Ném lỗi cho caller xử lý (không mở sheet khi GET hỏng).
 */
async function refreshDraftFromServer(ctx, state, ui) {
  const fresh = await ctx.adapter.getDraft(state.draftId);
  if (!fresh) return null;
  state.revision = fresh.revision;
  state.status = fresh.status || state.status;
  state.pause = fresh.pause || null;
  state.serverTimeIso = fresh.server_time || state.serverTimeIso;
  state.fetchedAtMs = Date.now();
  if (typeof fresh.body === "string") {
    state.syncedBody = fresh.body;
    if (ui.textarea) ui.textarea.value = fresh.body;
    if (ui.counter) ui.counter.textContent = `${fresh.body.length} ký tự`;
  }
  if (fresh.recipient_id != null) state.recipientId = fresh.recipient_id;
  // R1B P1-1: syncedRecipientId luôn bám recipientId máy chủ vừa nạp — lượt
  // preview sau chỉ auto-sync khi user đổi người nhận TIẾP (không sync nhầm).
  state.syncedRecipientId = state.recipientId != null ? String(state.recipientId) : null;
  refreshRecipientUi(state, ui);
  refreshPauseUi(state, ui);
  return fresh;
}

function refreshRecipientUi(state, ui) {
  clear(ui.recipientAvatar);
  const active = state.connections.find(
    (connection) => connection && connection.status === "active",
  );
  // R1B P2-1 (fail-closed, parity web): khi recipientId ĐÃ CÓ nhưng không còn
  // khớp kết nối nào (người nhận bị hủy kết nối/xoá) thì KHÔNG TỰ GÁN sang
  // kết nối khác (bỏ fallback `|| active` cũ) và KHÔNG đổi recipientId —
  // hiển thị trung thực; sheet xác nhận gửi vẫn fail-closed (preview
  // .recipient_id không resolve -> khóa nút gửi). Trường hợp recipientId
  // chưa có (nháp mới) giữ hành vi cũ: kết nối active đầu tiên.
  const selected = state.recipientId
    ? state.connections.find(
        (connection) => connection
          && (connection.other_party_id === state.recipientId
            || connection.connection_id === state.recipientId),
      )
    : (active || null);

  if (state.recipientId && !selected) {
    ui.recipientAvatar.appendChild(createIcon({ name: "person", size: 22 }));
    ui.recipientName.textContent = "Người nhận không còn trong danh sách kết nối";
    return; // giữ nguyên recipientId của máy chủ — không fallback tên khác
  }
  if (!selected) {
    ui.recipientAvatar.appendChild(createIcon({ name: "person", size: 22 }));
    ui.recipientName.textContent = "Chưa chọn người nhận";
    return;
  }
  const label = recipientLabel(selected);
  ui.recipientAvatar.appendChild(
    h("span", { class: "fb-compose__avatar-initials" }, label.trim().charAt(0).toUpperCase() || "•"),
  );
  ui.recipientName.textContent = selected.relationship_kind === "backup"
    ? `${label} (hỗ trợ dự phòng)`
    : label;
  state.recipientId = selected.other_party_id || selected.connection_id;
}

function openRecipientSheet(root, ctx, state, ui, { onClosed } = {}) {
  const list = h("div", { style: "display:flex;flex-direction:column;gap:var(--fb-space-2);" });
  const active = state.connections.filter((connection) => connection && connection.status === "active");

  if (!active.length) {
    list.appendChild(
      h("p", { class: "fb-page__note" },
        "Chưa có kết nối đang hoạt động. Hãy kết nối với người đồng hành trước khi soạn thư.",
      ),
    );
    list.appendChild(
      createButton({
        label: "Đến trang Kết nối",
        variant: "primary",
        onClick: () => ctx.navigate("/connect"),
      }),
    );
  }

  active.forEach((connection) => {
    list.appendChild(
      createButton({
        label: recipientLabel(connection),
        variant: "ghost",
        onClick: () => {
          state.recipientId = connection.other_party_id || connection.connection_id;
          refreshRecipientUi(state, ui);
          // N01: đóng qua close() (không remove trực tiếp) để onClose luôn
          // chạy — nhả cờ mở sheet + trả focus đúng contract mục 3.
          sheet.close();
        },
      }),
    );
  });

  const sheet = createSheet({
    title: "Chọn người nhận",
    content: h("div", {},
      h("p", { class: "fb-page__note" }, "Chỉ những kết nối hai phía đang hoạt động mới xuất hiện ở đây."),
      list,
    ),
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
      // N01: báo lại cho caller (nhả cờ chặn mở chồng sheet).
      if (typeof onClosed === "function") onClosed();
    },
  });
  root.appendChild(sheet);
}

/* --------------------------- Hành vi: nháp + dừng --------------------------- */

function currentBodyText(ui) {
  return ui.textarea ? ui.textarea.value : "";
}

/** Lưu nháp: chưa có draft -> tạo; có -> sửa (revision bump ở máy chủ). */
function onSaveDraft(ctx, state, ui) {
  const text = currentBodyText(ui).trim();
  if (!text) {
    ui.statusNote.textContent = "Lời nhắn chưa có nội dung — hãy viết vài dòng trước khi lưu nháp.";
    return;
  }
  ui.statusNote.textContent = "Đang lưu bản nháp…";
  const run = async () => {
    if (!state.draftId) {
      const created = await ctx.adapter.createDraft({
        kind: DRAFT_KIND,
        body: text,
        recipientId: state.recipientId || undefined,
      });
      state.draftId = created.draft_id;
      state.revision = created.revision;
      state.status = created.status;
      state.pause = created.pause || null;
      state.serverTimeIso = created.server_time || null;
      state.fetchedAtMs = Date.now();
      state.syncedBody = text; // R01: máy chủ đang giữ đúng text này
      state.syncedRecipientId = state.recipientId != null ? String(state.recipientId) : null;
    } else {
      const updated = await ctx.adapter.editDraft(state.draftId, {
        body: text,
        recipientId: state.recipientId || undefined,
        // N06: chặn ghi đè im lặng — máy chủ so expected_revision với revision
        // hiện tại; lệch -> 409 revision_conflict (panel xung đột bên dưới).
        expectedRevision: state.revision,
      });
      state.revision = updated.revision;
      state.status = updated.status;
      state.pause = updated.pause || null;
      state.serverTimeIso = updated.server_time || null;
      state.fetchedAtMs = Date.now();
      state.syncedBody = text; // R01: máy chủ đang giữ đúng text này
      state.syncedRecipientId = state.recipientId != null ? String(state.recipientId) : null;
    }
    ui.statusNote.textContent = "Bản nháp đã nằm trên máy chủ, chỉ bạn nhìn thấy.";
    refreshPauseUi(state, ui);
  };
  run().catch((error) => {
    if (error && error.code === "revision_conflict") {
      // N06: xung đột phiên bản — KHÔNG ghi đè im lặng, KHÔNG auto-retry,
      // KHÔNG đụng textarea (text người dùng giữ nguyên); mở panel 2 lựa chọn.
      openRevisionConflictSheet(ctx, state, ui, { userText: text, error });
      return;
    }
    ui.statusNote.textContent = describeError(error, "Chưa rõ kết quả lưu nháp — vui lòng kiểm tra lại trước khi thử lần nữa.");
  });
}

/** Bắt đầu / hủy khoảng dừng — deadline luôn do máy chủ trả về. */
function onTogglePause(ctx, state, ui) {
  if (!state.draftId) {
    ui.statusNote.textContent = "Hãy lưu bản nháp trước khi bắt đầu khoảng dừng.";
    return;
  }
  const run = async () => {
    if (state.status === "paused") {
      const updated = await ctx.adapter.cancelDraftPause(state.draftId);
      state.status = updated.status;
      state.pause = updated.pause || null;
      state.serverTimeIso = updated.server_time || null;
      state.fetchedAtMs = Date.now();
      ui.statusNote.textContent = "Bạn đã quay lại chế độ soạn — giữ nguyên nội dung nháp.";
    } else {
      const paused = await ctx.adapter.pauseDraft(state.draftId);
      state.status = paused.status;
      state.pause = paused.pause || null;
      state.serverTimeIso = paused.server_time || null;
      state.fetchedAtMs = Date.now();
      ui.statusNote.textContent =
        "Máy chủ đã bắt đầu khoảng dừng 5 phút. Khi hết giờ, bấm “Xem trước nội dung” — không gì được gửi tự động.";
    }
    refreshPauseUi(state, ui);
  };
  run().catch((error) => {
    ui.statusNote.textContent = describeError(error, "Chưa rõ kết quả khoảng dừng — kiểm tra trạng thái bản nháp trước khi thử lại.");
  });
}

/** Xem trước (pause là TÙY CHỌN theo C8 — máy chủ vẫn là cổng chốt) + xác nhận gửi cuối. */
function onPreview(ctx, state, ui) {
  if (!state.draftId) {
    ui.statusNote.textContent = "Chưa có bản nháp để xem trước — hãy lưu nháp trước.";
    return;
  }
  // R01: textarea rỗng phải DỪNG ở đây — nếu không, preview sẽ bind bản
  // cũ trên máy chủ trong khi sheet hiển thị rỗng (biến thể gửi sai bản).
  if (!currentBodyText(ui).trim()) {
    ui.statusNote.textContent = "Lời nhắn chưa có nội dung — hãy viết vài dòng trước khi xem trước.";
    return;
  }
  // N01 (rào cản 1): phiên đang bay -> bấm lần nữa KHÔNG tạo request chồng
  // (nút đã khóa; đây là rào chắn dự phòng cho mọi đường gọi khác).
  if (state.previewInFlight) return;
  // N01: token phiên preview — tăng ở ĐẦU mỗi lần chạy; sau MỖI await so lại
  // token, lệch -> ABORT im lặng (phiên mới hơn thay thế; request cũ không mở
  // sheet, không ghi đè state/UI mới).
  const previewSeq = (state.previewSeq = (state.previewSeq || 0) + 1);
  ui.statusNote.textContent = PREVIEW_BUSY_NOTE;
  lockComposeForPreview(state, ui);
  const run = async () => {
    // R01 (QA F04 18/10 — P1 “gửi sai bản đã duyệt”): AI suggestion chỉ
    // đổ vào textarea (không tự lưu). Preview phải bám đúng text đang
    // hiển thị trong sheet xác nhận — khác bản máy chủ giữ thì TỰ ĐỒNG
    // BỘ (editDraft) trước, nếu không confirm sẽ gửi original cũ.
    const pendingText = currentBodyText(ui).trim();
    // R1B P1-1 (parity web): dirty theo CẢ body lẫn người nhận — user đổi CHỈ
    // người nhận (body nguyên) vẫn phải editDraft trước preview, nếu không
    // máy chủ bind người cũ -> recipientMismatch -> drift path refresh REVERT
    // lựa chọn user + note sai nguyên nhân -> loop vô hạn.
    const pendingRecipientId = state.recipientId != null ? String(state.recipientId) : null;
    const bodyDirty = Boolean(pendingText) && pendingText !== state.syncedBody;
    const recipientDirty = pendingRecipientId
      !== (state.syncedRecipientId != null ? String(state.syncedRecipientId) : null);
    if (bodyDirty || recipientDirty) {
      if (state.previewSeq !== previewSeq) return;
      ui.statusNote.textContent = "Đang đồng bộ nội dung mới lên máy chủ…";
      const updated = await ctx.adapter.editDraft(state.draftId, {
        body: pendingText,
        recipientId: pendingRecipientId || undefined,
        // N06: auto-sync trước preview cũng phải chống stale overwrite.
        expectedRevision: state.revision,
      });
      // N01: sau MỖI await so lại token — lệch -> abort im lặng.
      if (state.previewSeq !== previewSeq) return;
      state.revision = updated.revision;
      state.status = updated.status;
      state.pause = updated.pause || null;
      state.serverTimeIso = updated.server_time || null;
      state.fetchedAtMs = Date.now();
      state.syncedBody = pendingText;
      state.syncedRecipientId = pendingRecipientId;
      refreshPauseUi(state, ui);
    }
    if (state.previewSeq !== previewSeq) return;
    // N01: chuẩn hoá textarea == đúng bản máy chủ đang giữ (chỉ khác
    // khoảng trắng đầu/cuối) để snapshot khớp tuyệt đối với body máy chủ bind.
    if (currentBodyText(ui) !== pendingText) {
      ui.textarea.value = pendingText;
      ui.counter.textContent = `${pendingText.length} ký tự`;
    }
    // N01: chốt snapshot TRƯỚC await preview (sau bước sync dirty body
    // thành công — R01 giữ nguyên): text/recipient/revision tại thời điểm này.
    const snapshot = {
      body: currentBodyText(ui),
      recipientId: state.recipientId,
      revision: state.revision,
    };
    ui.statusNote.textContent = PREVIEW_BUSY_NOTE;
    const preview = await ctx.adapter.previewDraft(state.draftId);
    if (state.previewSeq !== previewSeq) return;
    // N01 (rào cản 2): sau await bắt buộc kiểm tra lại — body/recipient/
    // revision đổi khi preview đang bay -> KHÔNG mở sheet; báo trung thực
    // + mở khóa.
    if (currentBodyText(ui) !== snapshot.body
      || state.recipientId !== snapshot.recipientId
      || state.revision !== snapshot.revision) {
      unlockComposeForPreview(state, ui);
      ui.statusNote.textContent = PREVIEW_INVALIDATE_NOTE;
      return;
    }
    // N03 (QA 19/10 — P1 "duyệt A gửi B"): rào cản SERVER-TRUTH — đối chiếu
    // response preview với snapshot chốt trước await. Máy chủ bind bản CỦA
    // HỌ tại thời điểm preview; nếu revision/recipient_id/body lệch snapshot
    // client nghĩa là bản nháp đã đổi ở nơi khác -> KHÔNG mở sheet, refresh
    // từ server (getDraft) + cập nhật state/UI + note trung thực.
    // Tương thích shape cũ thiếu field: field nào không có thì bỏ qua field đó
    // (fallback N01 như trước); shape hợp đồng mới (A1/A2) luôn đủ 3 field
    // nên check luôn chạy đầy đủ.
    const serverRevision = Number(preview.revision);
    const revisionMismatch = Number.isFinite(serverRevision)
      && serverRevision !== Number(snapshot.revision);
    // R2B P2-1 parity web: chuẩn hoá null hai phía — server mất recipient
    // (null) trong khi snapshot đang giữ id là DRIFT thật (invalidate +
    // refresh), còn chưa-chọn-cả-hai (null vs null) là đồng nhất; sheet
    // fail-closed khi không resolve được người nhận từ preview.
    const recipientMismatch = (preview.recipient_id ?? null)
      !== (snapshot.recipientId ?? null);
    const bodyMismatch = typeof preview.body !== "string"
      || preview.body !== snapshot.body;
    if (revisionMismatch || recipientMismatch || bodyMismatch) {
      let refreshed = null;
      try {
        refreshed = await refreshDraftFromServer(ctx, state, ui);
      } catch {
        refreshed = null; // không tải được bản mới — báo trung thực, không mở sheet
      }
      if (state.previewSeq !== previewSeq) return;
      unlockComposeForPreview(state, ui);
      ui.statusNote.textContent = refreshed
        ? PREVIEW_SERVER_CHANGED_NOTE
        : PREVIEW_SERVER_REFRESH_FAILED_NOTE;
      return;
    }
    ui.statusNote.textContent = "";
    unlockComposeForPreview(state, ui);
    openConfirmSheet(ctx, state, ui, preview, snapshot);
  };
  run().catch((error) => {
    // N01: request cũ (phiên đã bị thay thế) KHÔNG ghi đè state/UI mới.
    if (state.previewSeq !== previewSeq) return;
    if (error && error.code === "revision_conflict") {
      // N06: auto-sync trước preview vấp xung đột -> dừng flow (KHÔNG
      // preview), mở khóa, mở panel 2 lựa chọn; text người dùng giữ nguyên.
      unlockComposeForPreview(state, ui);
      openRevisionConflictSheet(ctx, state, ui, {
        userText: currentBodyText(ui).trim(),
        error,
      });
      return;
    }
    unlockComposeForPreview(state, ui);
    if (error && error.code === "cooldown_active") {
      const remaining = error.details && Number.isFinite(Number(error.details.remaining_seconds))
        ? Number(error.details.remaining_seconds)
        : null;
      // R2A3-01: 409 chỉ xảy ra khi ĐANG paused còn deadline — nói đúng trạng
      // thái "đang tạm dừng" + thời gian còn lại theo máy chủ.
      ui.statusNote.textContent = remaining != null
        ? `Bản nháp đang trong khoảng dừng — máy chủ báo còn ${formatRemaining(remaining)}. Khi hết giờ, bấm “Xem trước nội dung”.`
        : "Bản nháp đang trong khoảng dừng — máy chủ chưa mở xem trước. Khi hết giờ, hãy bấm “Xem trước nội dung” lần nữa.";
      refreshPauseUi(state, ui);
      return;
    }
    // N01 mục 7: sync editDraft lỗi -> dừng flow, KHÔNG preview, đã mở khóa,
    // thông báo trung thực (nói đúng cả bước đồng bộ).
    ui.statusNote.textContent = describeError(error,
      "Chưa đồng bộ được nội dung mới hoặc chưa lấy được bản xem trước — không có gì được gửi. Vui lòng thử lại sau.");
  });
}

/* ---------------- N01: khóa soạn trong lúc preview đang bay ---------------- */

/**
 * Rào cản 1 (N01): preview đang bay -> khóa textarea (readOnly + disabled) và
 * nút preview kèm giải thích trung thực (status note do onPreview đặt + title
 * nút). Nút "Đổi" người nhận KHÔNG khóa — đường đổi qua sheet vẫn mở được
 * (test N01-3); rào cản 2 (so snapshot sau await) là chốt chặn thật cho thay
 * đổi người nhận giữa chừng. refreshPauseUi tôn trọng state.previewInFlight
 * nên việc làm mới UI giữa chừng (sau sync) không tự mở khóa.
 */
function lockComposeForPreview(state, ui) {
  state.previewInFlight = true;
  if (ui.textarea) {
    ui.textarea.readOnly = true;
    ui.textarea.disabled = true;
  }
  ui.previewBtn.disabled = true;
  ui.previewBtn.title = PREVIEW_BUSY_NOTE;
  ui.previewBtn.setAttribute("aria-busy", "true");
  if (ui.recipientChangeBtn) {
    ui.recipientChangeBtn.title =
      "Bạn vẫn có thể đổi người nhận — nếu người nhận thay đổi, bản xem trước này sẽ bị hủy.";
  }
}

/** Mở khóa khi preview xong hoặc bị invalidate — trả trạng thái nút preview
 * đúng theo dữ liệu máy chủ (refreshPauseUi). */
function unlockComposeForPreview(state, ui) {
  state.previewInFlight = false;
  if (ui.textarea) {
    ui.textarea.readOnly = false;
    ui.textarea.disabled = false;
  }
  ui.previewBtn.removeAttribute("aria-busy");
  if (ui.recipientChangeBtn) ui.recipientChangeBtn.title = "";
  refreshPauseUi(state, ui);
}

function openConfirmSheet(ctx, state, ui, preview, snapshot) {
  // N03: tên người nhận trong sheet bind TỪ preview.recipient_id (server-truth)
  // qua connections trong state — KHÔNG dùng tên từ state cũ (nguồn lỗi N03
  // "duyệt A gửi B"). Có id nhưng không resolve được -> FAIL CLOSED: cảnh báo
  // + khóa nút gửi, KHÔNG fallback tên cũ. Chỉ khi response shape cũ KHÔNG có
  // recipient_id thì mới fallback tên đang hiển thị (như N01 trước đó).
  const previewRecipientId = preview && preview.recipient_id != null
    ? String(preview.recipient_id)
    : null;
  const previewRecipientName = previewRecipientId
    ? resolveRecipientLabel(state, previewRecipientId)
    : null;
  const serverRecipientUnknown = Boolean(previewRecipientId) && !previewRecipientName;
  const confirmLabel = previewRecipientName
    ? `Gửi cho ${previewRecipientName}`
    : (serverRecipientUnknown
      ? "Gửi thư"
      : `Gửi cho ${ui.recipientName.textContent || "người nhận"}`);
  // N01: sheet hiển thị BẢN MÁY CHỦ BIND — `preview.body` khi response mới có
  // (server-bound snapshot — parity backend A2/mock A1), fallback snapshot đã
  // sync cho response cũ chưa trả body. TUYỆT ĐỐI KHÔNG đọc live textarea
  // (`String(ui.textarea.value || "")` cũ là nguồn lỗi N01: preview đang bay
  // sửa nội dung -> sheet hiện bản khác bản máy chủ bind).
  const serverBoundBody = preview && typeof preview.body === "string" && preview.body.length > 0
    ? preview.body
    : snapshot.body;
  // Máy chủ có thể chuẩn hoá text khi bind mà không bump revision — nhận bản
  // máy chủ làm chuẩn (textarea + syncedBody) để re-verify bên dưới không chặn
  // nhầm lượt gửi hợp lệ; nếu không có khác biệt thì không đụng gì.
  if (serverBoundBody !== snapshot.body) {
    state.syncedBody = serverBoundBody;
    snapshot.body = serverBoundBody;
    ui.textarea.value = serverBoundBody;
    ui.counter.textContent = `${serverBoundBody.length} ký tự`;
  }
  const displayedSnapshot = String(serverBoundBody);
  const sheetError = h("div", { role: "alert" });

  const confirmBtn = createButton({
    label: confirmLabel,
    variant: "primary",
    onClick: () => {
      // N03 mục re-verify: state.revision phải vẫn khớp revision máy chủ bind
      // trong preview — nếu ai đó/lưu nháp nơi khác đã bump revision sau khi
      // sheet mở thì bản xem trước này đã cũ -> KHÔNG gửi.
      const previewRevision = Number(preview.revision);
      if (Number.isFinite(previewRevision)
        && Number(state.revision) !== previewRevision) {
        clear(sheetError);
        const staleCopy =
          "Bản xem trước đã cũ (máy chủ đã có phiên bản mới hơn) — hãy bấm “Xem trước nội dung” lại.";
        sheetError.appendChild(
          h("p", { class: "fb-compose__sheet-error", role: "alert" }, staleCopy),
        );
        ui.statusNote.textContent = `${staleCopy} Bấm “Xem trước nội dung” để lấy bản mới.`;
        return;
      }
      // N01 mục 6: re-verify TRƯỚC khi gọi confirmDraftSend — nội dung đang
      // hiển thị phải vẫn là bản snapshot máy chủ + người nhận không đổi;
      // lệch -> lỗi trung thực TRONG sheet, KHÔNG gửi, không đóng sheet ép.
      if (currentBodyText(ui) !== displayedSnapshot
        || state.recipientId !== snapshot.recipientId) {
        const changedCopy = state.recipientId !== snapshot.recipientId
          ? "Người nhận đã thay đổi sau khi xem trước — hãy chọn lại người nhận rồi bấm “Xem trước nội dung” lại."
          : "Nội dung đã thay đổi sau khi xem trước — hãy bấm “Xem trước nội dung” lại.";
        clear(sheetError);
        sheetError.appendChild(
          h("p", { class: "fb-compose__sheet-error", role: "alert" }, changedCopy),
        );
        ui.statusNote.textContent = `${changedCopy} Bấm “Xem trước nội dung” để lấy bản mới.`;
        return;
      }
      confirmBtn.disabled = true;
      const run = async () => {
        await ctx.adapter.confirmDraftSend(state.draftId, preview.preview_id);
        sheet.remove();
        ui.statusNote.textContent =
          "Lời nhắn đã được gửi qua xác nhận của bạn. Bản soạn giờ trống để bạn viết lần tới.";
        // Reset về bản soạn mới sau khi gửi thành công.
        state.draftId = null;
        state.revision = null;
        state.status = "editing";
        state.pause = null;
        state.syncedBody = ""; // R01: bản nháp mới — chưa có gì trên máy chủ
        ui.textarea.value = "";
        ui.counter.textContent = "0 ký tự";
        refreshPauseUi(state, ui);
        refreshRecipientUi(state, ui);
      };
      run().catch((error) => {
        confirmBtn.disabled = false;
        // Thông báo an toàn QUAN TRỌNG NHẤT phải nằm TRONG sheet (nơi người
        // dùng đang nhìn), không chỉ ở statusNote phía sau overlay.
        clear(sheetError);
        sheetError.appendChild(
          h("p", { class: "fb-compose__sheet-error", role: "alert" },
            describeError(error,
              "KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận lời nhắn. Kiểm tra hộp thư của người nhận trước khi thử lại — không gửi lại ngay."),
          ),
        );
        ui.statusNote.textContent = "Gửi thư chưa rõ kết quả — xem thông báo trong khung xác nhận.";
      });
    },
  });

  // N03 fail closed: preview.recipient_id có nhưng không resolve được qua
  // connections -> cảnh báo + khóa nút gửi (KHÔNG fallback tên cũ từ state).
  if (serverRecipientUnknown) confirmBtn.disabled = true;

  const content = h("div", {},
    h("p", {}, "Xem lại lời nhắn trước khi gửi. Đây là bước xác nhận cuối cùng — bạn vẫn có thể giữ lại làm nháp."),
    h("div", { class: "fb-compose__preview-body" }, displayedSnapshot),
    ...(serverRecipientUnknown ? [h("p", { class: "fb-compose__sheet-error", role: "alert" },
      "Không xác định được người nhận từ dữ liệu máy chủ cho lần xem trước này. Để tránh gửi nhầm, nút gửi bị khóa — hãy chọn lại người nhận rồi bấm “Xem trước nội dung” lần nữa.")] : []),
    h("p", { class: "fb-page__note" },
      "Bản hiển thị phía trên là bản máy chủ đã chốt cho lần xem trước này — sửa nội dung hoặc đổi người nhận sau bước này sẽ cần xem trước lại."),
    sheetError,
    confirmBtn,
    createButton({
      label: "Giữ lại làm nháp",
      variant: "ghost",
      onClick: () => sheet.remove(),
    }),
  );

  const sheet = createSheet({
    title: "Xem trước nội dung",
    content,
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
  ui.root.appendChild(sheet);
}

/**
 * N06 (QA 19/10): panel xung đột revision — editDraft trả 409
 * revision_conflict {details:{reason:"draft_conflict", current_revision}}.
 * Nguyên tắc: KHÔNG auto-retry, KHÔNG merge, KHÔNG mất text người dùng
 * (textarea giữ nguyên; panel hiển thị CẢ HAI bản để đối chiếu). Đúng 2 lựa
 * chọn rõ ràng:
 *  - "Cập nhật theo bản trên máy chủ" (adopt): nạp bản server vào ô soạn
 *    (getDraft mới nhất tại thời điểm bấm — không dùng dữ liệu panel cũ).
 *  - "Ghi đè bằng bản của tôi" (deliberate): gọi lại editDraft ĐÚNG MỘT lần
 *    với expectedRevision = current_revision (phiên bản mới nhất đã biết);
 *    nếu lại 409 thì chỉ cập nhật thông tin trong panel, KHÔNG tự gọi nữa.
 */
function openRevisionConflictSheet(ctx, state, ui, { userText = "", error = null } = {}) {
  if (state.conflictSheetOpen) return; // chặn mở chồng panel
  state.conflictSheetOpen = true;

  const detail = (error && error.details) || {};
  // current_revision từ 409 — dùng luôn cho "Ghi đè" khi getDraft hỏng.
  let currentRevision = Number.isFinite(Number(detail.current_revision))
    ? Number(detail.current_revision)
    : null;

  const conflictNote = h("p", { class: "fb-page__note", role: "status" });
  const mineBlock = h("div", { class: "fb-compose__conflict-block" });
  mineBlock.appendChild(
    h("p", { class: "fb-compose__conflict-head" }, "Bản bạn đang soạn (giữ nguyên trong ô soạn):"),
  );
  mineBlock.appendChild(
    h("p", { class: "fb-compose__conflict-body" }, String(userText || "")),
  );
  const serverBlock = h("div", { class: "fb-compose__conflict-block", hidden: true });
  const serverBody = h("p", { class: "fb-compose__conflict-body" });
  serverBlock.appendChild(
    h("p", { class: "fb-compose__conflict-head" }, "Bản hiện đang có trên máy chủ:"),
  );
  serverBlock.appendChild(serverBody);
  const sheetError = h("div", { role: "alert" });

  const adoptBtn = createButton({
    label: "Cập nhật theo bản trên máy chủ",
    variant: "primary",
    onClick: () => {
      adoptBtn.disabled = true;
      overwriteBtn.disabled = true;
      Promise.resolve()
        .then(() => ctx.adapter.getDraft(state.draftId))
        .then((serverDraft) => {
          if (!serverDraft) throw new Error("no_draft");
          // Adopt: nạp TOÀN BỘ trạng thái máy chủ vào state + ô soạn.
          state.revision = serverDraft.revision;
          state.status = serverDraft.status || state.status;
          state.pause = serverDraft.pause || null;
          state.serverTimeIso = serverDraft.server_time || state.serverTimeIso;
          state.fetchedAtMs = Date.now();
          state.syncedBody = serverDraft.body != null ? String(serverDraft.body) : "";
          if (serverDraft.recipient_id != null) {
            state.recipientId = serverDraft.recipient_id;
          }
          // R1B P1-1: adopt = nhận nguyên bản máy chủ (kèm người nhận) —
          // syncedRecipientId cập nhật theo để lần preview sau không sync nhầm.
          state.syncedRecipientId = state.recipientId != null ? String(state.recipientId) : null;
          ui.textarea.value = state.syncedBody;
          ui.counter.textContent = `${state.syncedBody.length} ký tự`;
          refreshRecipientUi(state, ui);
          refreshPauseUi(state, ui);
          closeSheet();
          ui.statusNote.textContent =
            "Đã cập nhật theo bản trên máy chủ — hãy xem lại nội dung trước khi gửi.";
        })
        .catch(() => {
          if (!sheet.isConnected) return;
          adoptBtn.disabled = false;
          overwriteBtn.disabled = currentRevision == null;
          clear(sheetError);
          sheetError.appendChild(
            h("p", { class: "fb-compose__sheet-error", role: "alert" },
              "Chưa tải được bản mới từ máy chủ. Bạn vẫn giữ nguyên bản của mình — thử lại sau."),
          );
        });
    },
  });

  const overwriteBtn = createButton({
    label: "Ghi đè bằng bản của tôi",
    variant: "ghost",
    onClick: () => {
      if (currentRevision == null) return;
      adoptBtn.disabled = true;
      overwriteBtn.disabled = true;
      const text = currentBodyText(ui).trim(); // text người dùng, không đụng textarea
      Promise.resolve()
        .then(() => ctx.adapter.editDraft(state.draftId, {
          body: text,
          recipientId: state.recipientId || undefined,
          // Deliberate overwrite: dùng đúng current_revision mới nhất đã biết.
          expectedRevision: currentRevision,
        }))
        .then((updated) => {
          state.revision = updated.revision;
          state.status = updated.status;
          state.pause = updated.pause || null;
          state.serverTimeIso = updated.server_time || null;
          state.fetchedAtMs = Date.now();
          state.syncedBody = text;
          state.syncedRecipientId = state.recipientId != null ? String(state.recipientId) : null;
          closeSheet();
          ui.statusNote.textContent =
            "Đã ghi đè bản trên máy chủ bằng bản của bạn (một lần, theo lựa chọn của bạn).";
          refreshPauseUi(state, ui);
        })
        .catch((overwriteError) => {
          if (!sheet.isConnected) return;
          if (overwriteError && overwriteError.code === "revision_conflict") {
            // Lần ghi đè chủ động lại 409: chỉ cập nhật thông tin trong panel
            // + nạp lại bản server để đối chiếu — KHÔNG tự gọi editDraft nữa.
            const freshDetail = (overwriteError.details || {});
            if (Number.isFinite(Number(freshDetail.current_revision))) {
              currentRevision = Number(freshDetail.current_revision);
            }
            clear(sheetError);
            sheetError.appendChild(
              h("p", { class: "fb-compose__sheet-error", role: "alert" },
                "Máy chủ vừa lại báo bản nháp đã thay đổi — đã cập nhật phiên bản mới nhất trong khung này. Bấm “Ghi đè bằng bản của tôi” lần nữa nếu bạn vẫn muốn ghi đè."),
            );
            Promise.resolve()
              .then(() => ctx.adapter.getDraft(state.draftId))
              .then((serverDraft) => {
                if (!sheet.isConnected || !serverDraft) return;
                currentRevision = Number(serverDraft.revision);
                serverBody.textContent = String(serverDraft.body ?? "");
                serverBlock.hidden = false;
                adoptBtn.disabled = false;
                overwriteBtn.disabled = currentRevision == null;
              })
              .catch(() => {
                if (!sheet.isConnected) return;
                adoptBtn.disabled = false;
                overwriteBtn.disabled = currentRevision == null;
              });
            return;
          }
          adoptBtn.disabled = false;
          overwriteBtn.disabled = false;
          clear(sheetError);
          sheetError.appendChild(
            h("p", { class: "fb-compose__sheet-error", role: "alert" },
              describeError(overwriteError,
                "Chưa ghi đè được — không rõ kết quả. Bản của bạn vẫn giữ nguyên trong ô soạn; kiểm tra lại trước khi thử lần nữa.")),
          );
        });
    },
  });

  const sheet = createSheet({
    title: "Bản nháp đã thay đổi trên máy chủ",
    content: h("div", {},
      conflictNote,
      mineBlock,
      serverBlock,
      sheetError,
      adoptBtn,
      overwriteBtn,
    ),
    onClose: () => {
      state.conflictSheetOpen = false;
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
  ui.root.appendChild(sheet);
  // R1B P1-2: đóng CHỈ qua createSheet.close() (parity sheet người nhận,
  // đường "Chọn người nhận") — sheet.remove() trực tiếp BYPASS onClose làm
  // state.conflictSheetOpen kẹt TRUE -> MỌI revision_conflict sau đó bị nuốt
  // im lặng ở openRevisionConflictSheet + leak listener Esc/mất trả focus.
  function closeSheet() {
    if (sheet && typeof sheet.close === "function") sheet.close();
  }

  // Tải bản máy chủ để đối chiếu ngay khi mở panel (một lần, không tự retry).
  adoptBtn.disabled = true;
  overwriteBtn.disabled = true;
  conflictNote.textContent = "Đang tải bản mới nhất trên máy chủ để đối chiếu…";
  Promise.resolve()
    .then(() => ctx.adapter.getDraft(state.draftId))
    .then((serverDraft) => {
      if (!sheet.isConnected) return;
      if (!serverDraft) throw new Error("no_draft");
      currentRevision = Number(serverDraft.revision);
      serverBody.textContent = String(serverDraft.body ?? "");
      serverBlock.hidden = false;
      adoptBtn.disabled = false;
      overwriteBtn.disabled = currentRevision == null;
      conflictNote.textContent =
        `Máy chủ báo bản nháp đang ở phiên bản ${currentRevision} — nội dung của bạn chưa bị ghi đè. Chọn một trong hai cách dưới đây.`;
    })
    .catch(() => {
      if (!sheet.isConnected) return;
      // Không tải được bản server: "Cập nhật theo máy chủ" khóa (chưa có bản
      // để nạp); "Ghi đè" vẫn mở khi 409 đã báo current_revision.
      serverBlock.hidden = false;
      serverBody.textContent = "(Chưa tải được nội dung bản trên máy chủ.)";
      conflictNote.textContent =
        "Chưa tải được bản mới nhất trên máy chủ. Bạn vẫn có thể ghi đè bằng bản của mình vì máy chủ đã báo phiên bản hiện tại.";
      adoptBtn.disabled = false;
      overwriteBtn.disabled = currentRevision == null;
    });
}

/* --------------------------- Hiển thị trạng thái dừng --------------------------- */

function refreshPauseUi(state, ui) {
  // w12 niêm phong: paused -> làm mờ body nháp + hiện ghi chú (presentation).
  // N01: preview đang bay -> textarea khóa hẳn (readOnly + disabled tạm thời);
  // khóa do lockComposeForPreview đặt, refreshPauseUi chỉ GIỮ nguyên trạng
  // thái khóa giữa các lần làm mới UI (sau sync editDraft).
  const isPaused = state.status === "paused";
  if (ui.textarea) {
    ui.textarea.classList.toggle("fb-compose__textarea--sealed", isPaused);
    ui.textarea.disabled = Boolean(state.previewInFlight);
  }
  if (ui.sealedNote) ui.sealedNote.hidden = !isPaused;

  if (ui.privacyChipText) {
    ui.privacyChipText.textContent = state.status === "paused"
      ? "Bản nháp riêng tư • Đang tạm dừng"
      : "Bản nháp riêng tư • Chưa gửi";
  }
  // Ưu tiên remaining_seconds do máy chủ trả gắn trên row/pause; nếu chỉ có
  // (deadline, server_time) thì tính elapsed từ lúc fetch.
  let remaining = null;
  if (state.status === "paused" && state.pause) {
    if (Number.isFinite(state.rowRemainingSeconds)) {
      remaining = Math.max(0, Math.ceil(state.rowRemainingSeconds));
    } else if (state.pause.deadline && state.serverTimeIso) {
      remaining = remainingFromServer({
        deadlineIso: state.pause.deadline,
        serverTimeIso: state.serverTimeIso,
        fetchedAtMs: state.fetchedAtMs,
      });
    }
  }

  clear(ui.pauseInfo);
  ui.pauseInfo.appendChild(
    h("p", { class: "fb-compose__pause-copy" },
      createIcon({ name: "spa", size: 18, className: "fb-stitch-primary-icon" }),
      h("span", {},
        "Trong lúc tạm dừng, bản nháp vẫn được giữ an toàn. Khi hết 5 phút, hệ thống ",
        h("strong", {}, "không tự gửi"),
        " — bạn luôn là người ấn xác nhận cuối cùng.",
      ),
    ),
  );

  if (state.status === "paused" && remaining != null) {
    ui.timerBadge.textContent = remaining > 0 ? formatRemaining(remaining) : "Hết giờ";
    ui.pauseBtnIcon.remove();
    ui.pauseBtnIcon = createIcon({ name: "close", size: 20 });
    ui.pauseBtnLabel.textContent = "Hủy khoảng dừng";
    const percent = Math.min(100, Math.max(0, ((PAUSE_SECONDS - remaining) / PAUSE_SECONDS) * 100));
    ui.progressFill.style.width = `${percent}%`;
    ui.pauseInfo.appendChild(
      h("p", { class: "fb-compose__refresh-row" },
        h("span", {}, remaining > 0
          ? `Còn ${formatRemaining(remaining)} theo máy chủ. `
          : "Đã hết 5 phút — máy chủ cho phép xem trước. "),
        h("button", {
          class: "fb-compose__refresh",
          type: "button",
          onclick: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
        }, "Làm mới"),
      ),
    );
    const serverAllowsPreview = Boolean(state.rowCanPreview) || remaining === 0;
    // N01: đang bay -> giữ nút preview khóa kèm giải thích trung thực.
    ui.previewBtn.disabled = state.previewInFlight ? true : !serverAllowsPreview;
    ui.previewBtn.title = state.previewInFlight
      ? PREVIEW_BUSY_NOTE
      : (serverAllowsPreview ? "" : "Máy chủ chưa mở xem trước — còn khoảng dừng.");
    // w12 vòng đếm: stroke chạy theo remaining máy chủ (không timer);
    // đổi sang xanh success khi máy chủ báo hết giờ (remaining === 0).
    if (ui.ringProgress) {
      const ratio = Math.max(0, Math.min(1, remaining / PAUSE_SECONDS));
      ui.ringProgress.style.strokeDashoffset = String(RING_CIRC * (1 - ratio));
      ui.ringProgress.style.stroke = remaining > 0 ? "var(--fb-accent)" : "var(--fb-success)";
    }
    return;
  }

  // Chưa tạm dừng (hoặc paused nhưng máy chủ chưa trả remaining — khi đó
  // guard cooldown_active của máy chủ là cổng chốt, thông báo 409 trung thực).
  // C8 đã freeze: khoảng dừng là TÙY CHỌN — draft không pause vẫn preview/
  // confirm hợp lệ ngay, UI KHÔNG tự khóa preview (R2A3-01).
  ui.timerBadge.textContent = formatRemaining(PAUSE_SECONDS);
  ui.timerBadge.title = "Khoảng dừng chuẩn 5 phút — thời gian thật do máy chủ ghi khi bạn bắt đầu.";
  ui.progressFill.style.width = "0%";
  // N01: đang bay -> giữ nút preview khóa kèm giải thích trung thực.
  ui.previewBtn.disabled = state.previewInFlight ? true : !state.draftId;
  ui.previewBtn.title = state.previewInFlight
    ? PREVIEW_BUSY_NOTE
    : (state.draftId ? "" : "Chưa có bản nháp để xem trước — hãy lưu nháp trước.");
  ui.pauseBtnIcon.remove();
  ui.pauseBtnIcon = createIcon({ name: "play_arrow", size: 20 });
  ui.pauseBtnLabel.textContent = "Bắt đầu 5 phút nghỉ";
  if (ui.ringProgress) {
    ui.ringProgress.style.strokeDashoffset = String(RING_CIRC);
    ui.ringProgress.style.stroke = "var(--fb-accent)";
  }
}

function describeError(error, fallback) {
  // R2A3-03: quota thật của backend = 503 temporarily_unavailable +
  // details.reason="provider_quota_exceeded" (express.py) — đọc
  // details.reason trước, giữ status/code làm fallback.
  const quotaReason = error && error.details && error.details.reason;
  if (error && error.code === "preview_stale") {
    return "Bản xem trước đã cũ sau khi bạn sửa nội dung — hãy bấm “Xem trước nội dung” lần nữa.";
  }
  if (error && error.code === "consent_required") {
    return "Cần đồng ý xử lý AI trước khi tạo gợi ý. Bạn vẫn viết tay, lưu nháp và gửi bình thường.";
  }
  if (error && (error.status === 429
    || quotaReason === "provider_quota_exceeded"
    || error.code === "provider_quota_exceeded"
    || error.code === "quota_exceeded")) {
    return "Hết lượt gợi ý AI trong thời gian này. Lời nhắn của bạn giữ nguyên — bạn viết tay bình thường và thử lại sau.";
  }
  if (error && (error.status === 503 || error.code === "ai_disabled" || error.code === "provider_disabled")) {
    return "Tính năng gợi ý AI đang tắt hoặc bảo trì trên máy chủ. Lời nhắn của bạn giữ nguyên — bạn viết tay bình thường.";
  }
  if (error && error.kind === "timeout") {
    return `Kết nối quá thời gian chờ. ${fallback}`;
  }
  if (error && error.kind === "stale_session") {
    return "Phiên đã thay đổi trong lúc thực hiện. Kiểm tra trạng thái mới nhất trước khi thử lại.";
  }
  return fallback;
}
