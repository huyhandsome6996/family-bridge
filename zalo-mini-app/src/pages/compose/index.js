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
// - Gợi ý AI: cổng provider chưa được nối (thiết kế) -> nút disabled trung
//   thực, không giả lập gợi ý.
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

const BODY_MAX = 4000; // ràng buộc backend (f06 _content_fields)
const PAUSE_SECONDS = 300; // hiển thị khoảng dừng chuẩn (máy chủ quyết thật)
const DRAFT_KIND = "letter"; // ≤16 ký tự theo backend

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
          demo,
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

function renderCompose(body, ctx, { connections, draft }) {
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
  };

  const state = {
    draftId: draft ? draft.draft_id : null,
    revision: draft ? draft.revision : null,
    status: draft ? draft.status : "editing",
    pause: draft ? draft.pause : null,
    serverTimeIso: draft ? draft.server_time : null,
    fetchedAtMs: draft ? Date.now() : null,
    recipientId: draft ? draft.recipient_id : null,
    connections,
  };

  // ---- Dòng trạng thái riêng tư ----
  const privacyRow = h("div", { class: "fb-compose__privacy-row" });
  privacyRow.appendChild(
    h("span", { class: "fb-chip fb-chip--high" },
      createIcon({ name: "lock", size: 16 }),
      h("span", {}, state.status === "paused" ? "Bản nháp riêng tư • Đang tạm dừng" : "Bản nháp riêng tư • Chưa gửi"),
    ),
  );
  privacyRow.appendChild(
    h("span", { class: "fb-compose__safety" },
      createIcon({ name: "verified_user", size: 18, className: "fb-stitch-primary-icon" }),
      h("span", {}, "Riêng tư theo thiết kế"),
    ),
  );
  body.appendChild(privacyRow);

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
  recipientRow.appendChild(
    createButton({
      label: "Đổi",
      variant: "ghost",
      onClick: () => guarded("recipient", () => openRecipientSheet(body, ctx, state, ui)),
    }),
  );
  recipientCard.appendChild(recipientRow);
  body.appendChild(recipientCard);

  // ---- Thẻ định hướng cảm xúc (thư viện thẻ F03 chưa nối — trung thực) ----
  const intent = h("div", { class: "fb-compose__intent" });
  const intentHead = h("div", { class: "fb-sec__row" });
  intentHead.appendChild(
    h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-1);color:var(--fb-primary);font-weight:500;" },
      createIcon({ name: "psychology_alt", size: 20 }),
      h("span", {}, "Mong muốn khi chia sẻ"),
    ),
  );
  intentHead.appendChild(h("span", { class: "fb-sec__sub" }, "Thư viện thẻ sắp có"));
  intent.appendChild(intentHead);
  const intentChip = h("div", { class: "fb-compose__intent-chip" });
  intentChip.appendChild(createIcon({ name: "hearing", size: 22, fill: true, className: "fb-stitch-primary-icon" }));
  intentChip.appendChild(
    h("div", { style: "flex:1;min-width:0;" },
      h("p", { class: "fb-compose__intent-title" }, "Con muốn được lắng nghe trước khi nhận lời khuyên"),
      h("p", { class: "fb-sec__sub" }, "Người nhận sẽ thấy ghi chú này ở đầu thư để chuẩn bị tâm thế dịu dàng nhất."),
    ),
  );
  intentChip.appendChild(
    createIcon({ name: "tune", size: 20, className: "fb-compose__tune" }),
  );
  intent.appendChild(intentChip);
  body.appendChild(intent);

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
  ui.textarea.addEventListener("input", () => {
    ui.counter.textContent = `${ui.textarea.value.length} ký tự`;
  });
  editor.appendChild(ui.textarea);

  // Khối AI — cổng chưa nối (thiết kế): nút disabled + giải thích trung thực.
  const aiBox = h("div", { class: "fb-compose__ai" });
  const aiRow = h("div", { class: "fb-sec__row" });
  aiRow.appendChild(
    createButton({
      label: "AI gợi ý cách diễn đạt êm ái hơn",
      variant: "primary",
      disabled: true,
      title: "Tính năng gợi ý AI chưa được bật ở bản này.",
    }),
  );
  aiRow.appendChild(
    h("span", { class: "fb-sec__sub", style: "display:inline-flex;align-items:center;gap:4px;" },
      createIcon({ name: "shield", size: 14 }),
      "Riêng tư",
    ),
  );
  aiBox.appendChild(aiRow);
  aiBox.appendChild(
    h("p", { class: "fb-compose__ai-note" },
      createIcon({ name: "info", size: 16, className: "fb-stitch-tertiary-icon" }),
      h("span", {}, " Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời nhắn của mình."),
    ),
  );
  editor.appendChild(aiBox);
  body.appendChild(editor);

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
  const pauseBtn = h("button", { class: "fb-btn fb-btn--primary fb-compose__pause-btn", type: "button" });
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
  body.appendChild(pauseCard);

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
  body.appendChild(footer);

  const helpCard = h("div", { class: "fb-scard fb-compose__help-card" });
  helpCard.appendChild(
    h("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:var(--fb-space-2);" },
      h("div", { style: "display:flex;align-items:center;gap:var(--fb-space-3);min-width:0;" },
        h("span", { class: "fb-compose__hourglass", "aria-hidden": "true" },
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
  body.appendChild(helpCard);

  // ---- Khởi tạo trạng thái hiển thị ----
  refreshRecipientUi(state, ui);
  refreshPauseUi(state, ui);
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
  ui.statusNote.textContent = "Đang lấy bản xem trước từ máy chủ…";
  const run = async () => {
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
        ui.textarea.value = "";
        ui.counter.textContent = "0 ký tự";
        refreshPauseUi(state, ui);
        refreshRecipientUi(state, ui);
      };
      run().catch((error) => {
        confirmBtn.disabled = false;
        ui.statusNote.textContent = describeError(
          error,
          "KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận lời nhắn. Kiểm tra hộp thư của người nhận trước khi thử lại — không gửi lại ngay.",
        );
      });
    },
  });

  const content = h("div", {},
    h("p", {}, "Xem lại lời nhắn trước khi gửi. Đây là bước xác nhận cuối cùng — bạn vẫn có thể giữ lại làm nháp."),
    h("div", { class: "fb-compose__preview-body" }, String(preview.body || "")),
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
  const remaining = state.pause && state.pause.deadline && state.serverTimeIso
    ? remainingFromServer({
      deadlineIso: state.pause.deadline,
      serverTimeIso: state.serverTimeIso,
      fetchedAtMs: state.fetchedAtMs,
    })
    : null;

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
    ui.previewBtn.disabled = remaining > 0;
    ui.previewBtn.title = remaining > 0
      ? "Máy chủ chưa mở xem trước — còn khoảng dừng."
      : "";
    return;
  }

  // Chưa tạm dừng
  ui.timerBadge.textContent = formatRemaining(PAUSE_SECONDS);
  ui.timerBadge.title = "Khoảng dừng chuẩn 5 phút — thời gian thật do máy chủ ghi khi bạn bắt đầu.";
  ui.progressFill.style.width = "0%";
  ui.previewBtn.disabled = true;
  ui.previewBtn.title = "Cần lưu nháp và hoàn thành khoảng dừng trước khi xem trước.";
  ui.pauseBtnIcon.remove();
  ui.pauseBtnIcon = createIcon({ name: "play_arrow", size: 20 });
  ui.pauseBtnLabel.textContent = "Bắt đầu 5 phút nghỉ";
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
