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

function renderCompose(body, ctx, { connections, draft, listServerTimeIso, aiEnabled = false, aiStatusUnknown = false, stale = () => false }) {
  clear(body);

  const guarded = busyGuard();
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
  const changePill = h("button", {
    class: "fb-compose__change-btn",
    type: "button",
    onclick: () => guarded("recipient", () => openRecipientSheet(body, ctx, state, ui)),
  },
    h("span", {}, "Đổi"),
    createIcon({ name: "expand_more", size: 16 }),
  );
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
      h("span", {}, "Lời con muốn gửi"),
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
    placeholder: "Chia sẻ suy nghĩ chân thật nhất của con lúc này...",
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

function refreshRecipientUi(state, ui) {
  clear(ui.recipientAvatar);
  const active = state.connections.find(
    (connection) => connection && connection.status === "active",
  );
  const selected = state.connections.find(
    (connection) => connection
      && (connection.other_party_id === state.recipientId
        || connection.connection_id === state.recipientId),
  ) || active;

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

function openRecipientSheet(root, ctx, state, ui) {
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
          sheet.remove();
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
    } else {
      const updated = await ctx.adapter.editDraft(state.draftId, {
        body: text,
        recipientId: state.recipientId || undefined,
      });
      state.revision = updated.revision;
      state.status = updated.status;
      state.pause = updated.pause || null;
      state.serverTimeIso = updated.server_time || null;
      state.fetchedAtMs = Date.now();
      state.syncedBody = text; // R01: máy chủ đang giữ đúng text này
    }
    ui.statusNote.textContent = "Bản nháp đã nằm trên máy chủ, chỉ bạn nhìn thấy.";
    refreshPauseUi(state, ui);
  };
  run().catch((error) => {
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
  ui.statusNote.textContent = "Đang lấy bản xem trước từ máy chủ…";
  const run = async () => {
    // R01 (QA F04 18/10 — P1 “gửi sai bản đã duyệt”): AI suggestion chỉ
    // đổ vào textarea (không tự lưu). Preview phải bám đúng text đang
    // hiển thị trong sheet xác nhận — khác bản máy chủ giữ thì TỰ ĐỒNG
    // BỘ (editDraft) trước, nếu không confirm sẽ gửi original cũ.
    const pendingText = currentBodyText(ui).trim();
    if (pendingText !== state.syncedBody) {
      ui.statusNote.textContent = "Đang đồng bộ nội dung mới lên máy chủ…";
      const updated = await ctx.adapter.editDraft(state.draftId, {
        body: pendingText,
        recipientId: state.recipientId || undefined,
      });
      state.revision = updated.revision;
      state.status = updated.status;
      state.pause = updated.pause || null;
      state.serverTimeIso = updated.server_time || null;
      state.fetchedAtMs = Date.now();
      state.syncedBody = pendingText;
      refreshPauseUi(state, ui);
    }
    ui.statusNote.textContent = "Đang lấy bản xem trước từ máy chủ…";
    const preview = await ctx.adapter.previewDraft(state.draftId);
    ui.statusNote.textContent = "";
    openConfirmSheet(ctx, state, ui, preview);
  };
  run().catch((error) => {
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
    ui.statusNote.textContent = describeError(error, "Chưa lấy được bản xem trước. Vui lòng thử lại sau.");
  });
}

function openConfirmSheet(ctx, state, ui, preview) {
  const recipientName = ui.recipientName.textContent || "người nhận";
  const sheetError = h("div", { role: "alert" });

  const confirmBtn = createButton({
    label: `Gửi cho ${recipientName}`,
    variant: "primary",
    onClick: () => {
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

  const content = h("div", {},
    h("p", {}, "Xem lại lời nhắn trước khi gửi. Đây là bước xác nhận cuối cùng — bạn vẫn có thể giữ lại làm nháp."),
    h("div", { class: "fb-compose__preview-body" }, String(ui.textarea.value || "")),
    h("p", { class: "fb-page__note" },
      "Máy chủ đã chốt bản xem trước với người nhận và nội dung hiện tại — sửa nội dung sau bước này sẽ cần xem trước lại."),
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

/* --------------------------- Hiển thị trạng thái dừng --------------------------- */

function refreshPauseUi(state, ui) {
  // w12 niêm phong: paused -> làm mờ body nháp + hiện ghi chú (presentation).
  const isPaused = state.status === "paused";
  if (ui.textarea) ui.textarea.classList.toggle("fb-compose__textarea--sealed", isPaused);
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
    ui.previewBtn.disabled = !serverAllowsPreview;
    ui.previewBtn.title = serverAllowsPreview
      ? ""
      : "Máy chủ chưa mở xem trước — còn khoảng dừng.";
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
  ui.previewBtn.disabled = !state.draftId;
  ui.previewBtn.title = state.draftId
    ? ""
    : "Chưa có bản nháp để xem trước — hãy lưu nháp trước.";
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
