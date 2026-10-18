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
// - AI (F04) là cổng THẬT qua createAiAssist (components/ai-assist.js) dùng
//   CHUNG với khung phản hồi thư — hợp đồng đóng băng v1: aiRefine({text, key,
//   inputRevision}) + consent gate "ai_processing" trước lần dùng đầu; field
//   text duy nhất là suggested_text; stale guard inputRevision (tăng mỗi input
//   event, response/apply lệch revision -> chặn); apply/discard KHÔNG gửi tin,
//   KHÔNG tạo Message; lỗi AI -> manual path (viết, lưu nháp, preview, gửi,
//   help) luôn dùng được; render gợi ý bằng textContent.
// - Biến thể caregiver: cùng component, copy xưng hô khác theo vai trò.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
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
import { createAiAssist, AI_COPY } from "../../components/ai-assist.js";

const BODY_MAX = 4000; // ràng buộc backend (f06 _content_fields)
const PAUSE_SECONDS = 300; // hiển thị khoảng dừng chuẩn (máy chủ quyết thật)
const DRAFT_KIND = "text"; // backend KINDS chỉ nhận ("text","emotion_card")

// Vòng đếm pause SVG (w12): stroke chạy theo tỷ lệ remaining/PAUSE_SECONDS.
const RING_RADIUS = 28;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

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
  // R04 (QA F04 18/10): desktop 1440px trước đây render BARE -> .fb-page
  // bị cap 480px (mobile contract), grid co còn 84px/340px, textarea 52px,
  // không có app shell. Bật chrome "app" như các trang web desktop khác
  // (home/mailbox/cards/signal/settings/privacy/message/proposal).
  chrome: "app",
  showBottomNav: true,

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const demo = Boolean(state.demoMode);

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "f06-compose" } });

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
    const destroyHooks = []; // F04: gỡ listener/đóng sheet của component con
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      destroyHooks.splice(0).forEach((fn) => {
        try { fn(); } catch { /* unmount không được chặn nhau */ }
      });
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    // Production cần phiên sống (nháp là dữ liệu riêng của tác giả).
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để soạn thư",
          description:
            "Bản nháp là nội dung riêng tư của bạn nên cần phiên đăng nhập. " +
            "Đăng nhập để tiếp tục.",
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
    ])
      .then(([connectionsPage, draftsPage]) => {
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
          // F04: trạng thái cổng AI do createAiAssist tự kiểm (aiStatus) —
          // lỗi/off không chặn trang, manual path luôn hiển thị.
          role: state.role || "student",
          destroyHooks,
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

function renderCompose(body, ctx, { connections, draft, listServerTimeIso, role = "student", destroyHooks = [] }) {
  clear(body);

  const guarded = busyGuard();
  const isCaregiver = String(role) === "caregiver";
  const editorCopy = isCaregiver
    ? {
        label: "Lời bạn muốn gửi",
        placeholder: "Chia sẻ điều bạn muốn nhắn gửi một cách nhẹ nhàng…",
      }
    : {
        label: "Lời con muốn gửi",
        placeholder: "Chia sẻ suy nghĩ chân thật nhất của con lúc này...",
      };
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
    mainCol: null,
  };

  const state = {
    draftId: draft ? draft.draft_id : null,
    revision: draft ? draft.revision : null,
    status: draft ? draft.status : "editing",
    pause: draft ? draft.pause : null,
    // R01 (QA F04 18/10): nội dung máy chủ ĐANG GIỮ cho bản nháp này.
    // AI suggestion chỉ sửa textarea (không tự lưu) — preview phải so
    // sánh với syncedBody để tự đồng bộ trước khi chốt bản gửi.
    syncedBody: draft && draft.body ? String(draft.body) : "",
    // Ưu tiên dữ liệu máy chủ gắn sẵn trên từng row (remaining_seconds /
    // can_preview); server_time của envelope list dùng khi cần tính lại.
    rowRemainingSeconds: draft && draft.pause ? draft.pause.remaining_seconds : null,
    rowCanPreview: draft && draft.pause ? Boolean(draft.pause.can_preview) : false,
    serverTimeIso: draft ? (draft.server_time || listServerTimeIso || null) : (listServerTimeIso || null),
    fetchedAtMs: draft || listServerTimeIso ? Date.now() : null,
    recipientId: draft ? draft.recipient_id : null,
    connections,
  };

  // ---- Bố cục desktop 2 cột (w11): <1024px vẫn 1 cột (CSS) ----
  const grid = h("div", { class: "fb-compose-grid" });
  const mainCol = h("div", { class: "fb-compose-grid__main" });
  const sideCol = h("div", { class: "fb-compose-grid__side" });
  grid.appendChild(mainCol);
  grid.appendChild(sideCol);
  body.appendChild(grid);
  ui.mainCol = mainCol;

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
    "aria-label": editorCopy.label,
  });
  if (draft && draft.body) ui.textarea.value = String(draft.body);
  const syncCounter = () => {
    ui.counter.textContent = `${ui.textarea.value.length} ký tự`;
  };
  ui.textarea.addEventListener("input", syncCounter);
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

  // ---- Khối AI (F04) — panel phải: cổng THẬT qua createAiAssist ----
  // Consent gate + loading không chặn gõ + stale guard + lỗi trung thực,
  // dùng CHUNG semantics với khung phản hồi thư (components/ai-assist.js).
  const aiAssist = createAiAssist({
    adapter: ctx.adapter,
    textarea: ui.textarea,
    copy: isCaregiver ? AI_COPY.caregiver : AI_COPY.student,
  });
  const aiCard = h("div", { class: "fb-scard fb-compose__ai-card" });
  aiCard.appendChild(aiAssist.el);
  sideCol.appendChild(aiCard);

  // Lưu handler để cleanupFn gỡ listener + đóng sheet consent khi unmount.
  if (typeof destroyHooks.push === "function") destroyHooks.push(aiAssist.destroy);
  ui.aiAssistDestroy = aiAssist.destroy;

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

/* ------------------ Trạng thái kết quả gửi (F04 frame 12) ------------------ */

/**
 * Bảng kết quả gửi: sending/unknown/sent theo response THẬT của
 * confirmDraftSend — không tự suy thành công, không tự retry (QA cấm copy
 * "đã gửi" mạo danh; chỉ báo khi máy chủ xác nhận hoặc báo chưa rõ).
 */
function renderSendReceipt(mountEl, { outcome, recipientName = "người nhận" }) {
  const existing = mountEl.querySelector(".fb-compose__receipt");
  if (existing) existing.remove();
  if (outcome === "sent") {
    mountEl.insertBefore(
      h("div", { class: "fb-compose__receipt fb-compose__receipt--sent", role: "status" },
        createIcon({ name: "check_circle", size: 22 }),
        h("div", { class: "fb-compose__receipt-body" },
          h("p", { class: "fb-compose__receipt-title" },
            "Máy chủ xác nhận lời nhắn đã được trao gửi"),
          h("p", { class: "fb-compose__receipt-sub" },
            `Người nhận: ${recipientName}. Người nhận chỉ thấy lời nhắn cuối cùng `
            + "— hệ thống không theo dõi việc xem thư."),
        ),
      ),
      mountEl.firstChild,
    );
    return;
  }
  if (outcome === "unknown") {
    mountEl.insertBefore(
      h("div", { class: "fb-compose__receipt fb-compose__receipt--unknown", role: "alert" },
        createIcon({ name: "cloud_off", size: 22 }),
        h("div", { class: "fb-compose__receipt-body" },
          h("p", { class: "fb-compose__receipt-title" }, "KẾT QUẢ CHƯA XÁC ĐỊNH"),
          h("p", { class: "fb-compose__receipt-sub" },
            `Máy chủ có thể đã nhận lời nhắn cho ${recipientName}. Để tránh gửi trùng, `
            + "kiểm tra trạng thái mới nhất trước khi thử lại — không gửi lại ngay."),
          h("button", {
            class: "fb-btn fb-btn--ghost fb-compose__receipt-retry",
            type: "button",
            onclick: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
          }, "Kiểm tra trạng thái mới nhất"),
        ),
      ),
      mountEl.firstChild,
    );
  }
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

/** Xem trước (chỉ sau khi máy chủ xác nhận hết giờ) + xác nhận gửi cuối. */
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
    // đổ vào textarea (không tự lưu). Nếu để preview bind BẢN CŨ trên
    // máy chủ thì confirm sẽ gửi original dù sheet hiển thị final — đúng
    // kịch bản lỗi R01. Trước khi preview, nếu nội dung đang hiển thị
    // khác bản máy chủ giữ thì TỰ ĐỒNG BỘ (editDraft) — preview/confirm
    // luôn bám đúng text trong sheet xác nhận.
    const pendingText = currentBodyText(ui).trim();
    if (pendingText && pendingText !== state.syncedBody) {
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
      ui.statusNote.textContent = remaining != null
        ? `Máy chủ báo còn ${formatRemaining(remaining)} của khoảng dừng. Khi hết giờ, bấm “Xem trước nội dung”.`
        : "Máy chủ báo khoảng dừng chưa kết thúc.";
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
      // F04 frame 12 — trạng thái "sending": chặn double-click + báo đang gửi.
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Đang gửi…";
      const run = async () => {
        await ctx.adapter.confirmDraftSend(state.draftId, preview.preview_id);
        sheet.remove();
        renderSendReceipt(ui.mainCol, { outcome: "sent", recipientName });
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
        // Không tự retry, không tự suy thành công/thất bại: báo CHƯA XÁC ĐỊNH
        // trong sheet + bảng "chưa xác định" trên trang (F04 frame 12).
        confirmBtn.disabled = false;
        confirmBtn.textContent = `Gửi cho ${recipientName}`;
        renderSendReceipt(ui.mainCol, { outcome: "unknown", recipientName });
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

  // Chưa tạm dừng — C8 (hợp đồng F04 v1, backend đã mở): khoảng dừng là
  // TUỲ CHỌN — máy chủ cho phép preview/confirm cả khi draft chưa pause
  // (chỉ 409 cooldown_active khi ĐANG paused còn deadline, onPreview báo
  // remaining trung thực). Không tự khóa preview ở client nữa.
  // Chưa lưu nháp thì chưa có gì để xem trước — khóa kèm lý do trung thực.
  ui.timerBadge.textContent = formatRemaining(PAUSE_SECONDS);
  ui.timerBadge.title = "Khoảng dừng chuẩn 5 phút — thời gian thật do máy chủ ghi khi bạn bắt đầu.";
  ui.progressFill.style.width = "0%";
  const canPreview = Boolean(state.draftId);
  ui.previewBtn.disabled = !canPreview;
  ui.previewBtn.title = canPreview
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
  if (error && error.code === "preview_stale") {
    return "Bản xem trước đã cũ sau khi bạn sửa nội dung — hãy bấm “Xem trước nội dung” lần nữa.";
  }
  if (error && error.kind === "timeout") {
    return `Kết nối quá thời gian chờ. ${fallback}`;
  }
  if (error && error.kind === "stale_session") {
    return "Phiên đã thay đổi trong lúc thực hiện. Kiểm tra trạng thái mới nhất trước khi thử lại.";
  }
  return fallback;
}
