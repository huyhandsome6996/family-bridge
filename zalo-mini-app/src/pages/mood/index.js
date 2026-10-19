// F07 — Tâm trạng của mình (US-015/US-026): ghi nhận cảm xúc hằng ngày
// (một mục/ngày, ngày do MÁY CHỦ quyết), ghi chú tùy chọn RIÊNG TƯ MẶC ĐỊNH,
// lịch sử có phân trang, sửa mục (revision mới KHÔNG tự chia sẻ lại),
// tổng hợp mô tả cá nhân, và chia sẻ TỪNG MỤC cho ĐÚNG MỘT người đang kết
// nối qua preview + xác nhận tường minh; quản lý/thu hồi từng quyền.
//
// Hợp đồng backend (packages/family_bridge_features/f07_mood):
//   GET/POST /api/v1/mood/entries; GET/PATCH /api/v1/mood/entries/{id};
//   GET /api/v1/mood/entries/summary; GET .../{id}/shares (status thật);
//   POST .../{id}/share {recipient_id, expected_revision} (lệch -> 409 stale);
//   POST /api/v1/mood/shares/{id}/revoke.
//
// TRUNG THỰC + AN TOÀN:
// - Mặc định "Chỉ mình bạn" hiển thị rõ trước khi lưu; KHÔNG tự chia sẻ khi
//   lưu/kết nối/đăng nhập (không có cơ chế tự gửi ở bất kỳ nhánh nào).
// - Preview hiển thị ĐẦY ĐỦ phần sẽ chia sẻ (cả ghi chú) + revision; xác nhận
//   gửi đúng revision đã xem (expected_revision); 409 stale -> mời xem lại.
// - Ngày của mục do máy chủ ghi (VN); client không tự suy ngày từ đồng hồ.
// - Trạng thái grant hiển thị theo máy chủ: active/stale_revision/revoked/
//   unlinked — không "chữa" trạng thái ở client.
// - Thu hồi chặn lần đọc mới; bản sao ngoài ứng dụng không thu hồi được.
// - Lỗi giữ nguyên nội dung đang nhập; không tự retry thao tác ghi.
// - Mọi text từ API render qua textContent/h() (SEC-12) — không innerHTML.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createDialog, createEmptyState, createSheet,
  createStatusBadge, createTextarea, createTopBar,
} from "../../components/index.js";

const HISTORY_PAGE_SIZE = 20;
const SUMMARY_WINDOW_DAYS = 90;

const GRANT_STATUS = {
  active: { label: "Đang chia sẻ", tone: "success" },
  stale_revision: { label: "Bản cũ — cần chia sẻ lại", tone: "warning" },
  revoked: { label: "Đã thu hồi", tone: "neutral" },
  unlinked: { label: "Kết nối đã kết thúc", tone: "neutral" },
};

function grantBadge(status) {
  const meta = GRANT_STATUS[status] || { label: status, tone: "neutral" };
  return createStatusBadge({ tone: meta.tone, label: meta.label });
}

function errorText(error) {
  if (error && error.kind === "timeout") {
    return "Kết nối quá thời gian chờ. Vui lòng thử lại.";
  }
  if (error && error.kind === "stale_session") {
    return "Phiên đã đổi khi yêu cầu đang chạy — kiểm tra trạng thái mới nhất trước khi thử lại.";
  }
  const reason = error && error.details && error.details.reason;
  if (reason === "entry_already_exists_use_edit") {
    return "Ngày này đã có mục rồi — hãy sửa mục hiện có trong lịch sử.";
  }
  if (reason === "stale_revision") {
    return "Mục này vừa đổi sau khi bạn xem trước. Hãy xem lại bản mới rồi xác nhận lại.";
  }
  if (reason === "no_active_connection") {
    return "Chưa có kết nối đang hoạt động với người này. Hãy kết nối trước ở trang Cá nhân.";
  }
  return "Chưa thao tác được với máy chủ. Vui lòng thử lại.";
}

export const page = {
  id: "mood",
  title: "Tâm trạng của mình",
  requiresRole: true,
  requiresAuth: true, // dữ liệu riêng theo phiên (router M1)
  showBottomNav: true,
  chrome: "app",

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "mood" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(createTopBar({ title: "Tâm trạng của mình" }));
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    const openDialogs = new Set();
    // R01 fix: một lifecycle duy nhất cho mọi bất đồng bộ của trang.
    // - Mọi sheet/dialog TỰ ĐĂNG KÝ vào openDialogs (đóng thật khi rời trang:
    //   close() gỡ overlay khỏi body + gỡ listener Esc — không chỉ ẩn CSS).
    // - Mọi callback muộn kiểm tra cancelled/generation trước khi đụng DOM
    //   hoặc điều hướng — không ghi dữ liệu riêng lên trang/phiên khác.
    const lc = {
      cancelled: false,
      generation: 0,
      register(handle) { openDialogs.add(handle); },
      unregister(handle) { openDialogs.delete(handle); },
    };
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      lc.cancelled = true;
      lc.generation += 1;
      const dialogs = Array.from(openDialogs);
      openDialogs.clear();
      for (const dialog of dialogs) {
        try { dialog.close(); } catch { /* đã đóng */ }
      }
    };

    const demo = Boolean(ctx.store.getState().demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(createEmptyState({
        title: "Cần đăng nhập để ghi tâm trạng",
        description:
          "Ghi chú cảm xúc là dữ liệu riêng của bạn. Đăng nhập để tiếp tục.",
        action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
      }));
      return root;
    }

    const state = {
      demo,
      editing: null,          // entry đang sửa trong editor (null = tạo hôm nay)
      selectedEmotion: null,
      historyNextCursor: null,
      _lc: lc,
    };

    const editor = renderEditorCard(ctx, state);
    const summaryCard = h("section", { class: "fb-scard" });
    const historyCard = h("section", { class: "fb-scard" });
    body.appendChild(editor.card);
    body.appendChild(summaryCard);
    body.appendChild(historyCard);
    state._editor = editor;
    state._summaryCard = summaryCard;
    state._historyCard = historyCard;

    const reloadAll = () => {
      loadSummary(ctx, state, summaryCard);
      loadHistory(ctx, historyCard, state, { reset: true });
      syncEditorWithToday(ctx, editor, state);
    };
    state.reloadAll = reloadAll;
    reloadAll();

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* ------------------------------- Editor ---------------------------------- */

function renderEditorCard(ctx, state) {
  const card = h("section", { class: "fb-scard" });
  card.appendChild(h("h2", { class: "fb-scard__title" }, "Cảm xúc hôm nay"));
  card.appendChild(h("p", { class: "fb-sec__sub" },
    "Không có cảm xúc nào là đúng hay sai. Đây là nhật ký của riêng bạn."));

  card.appendChild(h("div", { class: "fb-sec__row" },
    h("span", { class: "fb-chip" }, "Chỉ mình bạn — mặc định riêng tư")));

  const chips = h("div", {
    class: "fb-mood-grid fb-mood-grid--4",
    role: "radiogroup",
    "aria-label": "Chọn cảm xúc",
  });
  card.appendChild(chips);

  const noteField = createTextarea({
    id: "mood-note",
    label: "Ghi chú (không bắt buộc)",
    hint: "Tối đa 2000 ký tự. Chỉ mình bạn thấy cho đến khi bạn chọn chia sẻ.",
    maxlength: 2000,
    rows: 3,
  });
  card.appendChild(noteField);

  const feedback = h("p", { class: "fb-sec__sub", role: "status", "aria-live": "polite" });
  // editor parts phải tồn tại TRƯỚC khi nút Lưu được tạo (closure tham chiếu
  // đúng đối tượng; handler chỉ chạy sau khi gán saveBtn).
  const editor = { card, chips, feedback, saveBtn: null, noteField };
  const saveBtn = createButton({
    label: "Lưu tâm trạng hôm nay",
    variant: "cta",
    onClick: () => saveEntry(ctx, state, editor),
  });
  editor.saveBtn = saveBtn;
  card.appendChild(saveBtn);
  card.appendChild(feedback);

  return editor;
}

function renderChips(ctx, chipsEl, state, selectedEmotion) {
  const lc = state._lc;
  const gen = lc.generation;
  clear(chipsEl);
  state.selectedEmotion = selectedEmotion || null;
  ctx.adapter.moodSummary(SUMMARY_WINDOW_DAYS)
    .then((data) => {
      if (lc.cancelled || lc.generation !== gen) return; // phản hồi muộn
      const options = (data && data.emotions) || [];
      if (!options.length) return; // demo/lỗi: không dọa người dùng
      for (const item of options) {
        const btn = h("button", {
          class: "fb-mood fb-mood--warm",
          type: "button",
          role: "radio",
          "aria-checked": state.selectedEmotion === item.emotion ? "true" : "false",
          dataset: { emotion: item.emotion },
        }, h("span", { class: "fb-mood__label" }, item.label));
        btn.addEventListener("click", () => {
          state.selectedEmotion = item.emotion;
          for (const sibling of chipsEl.querySelectorAll(".fb-mood")) {
            sibling.setAttribute("aria-checked", "false");
          }
          btn.setAttribute("aria-checked", "true");
        });
        chipsEl.appendChild(btn);
      }
    })
    .catch(() => {
      if (lc.cancelled || lc.generation !== gen) return;
      chipsEl.appendChild(h("p", { class: "fb-sec__sub" },
        "Chưa tải được danh sách cảm xúc — thử tải lại trang nhé."));
    });
}

function markSelectedChip(chipsEl, emotion) {
  for (const chip of chipsEl.querySelectorAll(".fb-mood")) {
    chip.setAttribute("aria-checked",
      chip.dataset.emotion === emotion ? "true" : "false");
  }
}

function syncEditorWithToday(ctx, editor, state) {
  // Mở trang: nếu mục mới nhất là của HÔM NAY theo máy chủ -> chuyển sang
  // sửa đúng mục đó (một mục/ngày). Đối chiếu ngày mục với ngày hôm nay
  // (múi giờ VN) chỉ để chọn chế độ — ngày ghi nhận vẫn do backend quyết.
  const lc = state._lc;
  const gen = lc.generation;
  renderChips(ctx, editor.chips, state, null);
  editor.feedback.textContent = "";
  ctx.adapter.listMoodEntries({ limit: 1 })
    .then((data) => {
      if (lc.cancelled || lc.generation !== gen) return;
      const rows = (data && data.results) || [];
      const latest = rows[0] || null;
      if (latest && latest.entry_date === todayVnIso()) {
        state.editing = latest;
        editor.noteField.input.value = latest.note || "";
        state.selectedEmotion = latest.emotion;
        markSelectedChip(editor.chips, latest.emotion);
        editor.saveBtn.textContent = "Lưu thay đổi cho hôm nay";
        editor.feedback.textContent =
          "Hôm nay bạn đã ghi nhận rồi — lưu sẽ tạo phiên bản mới. Phiên bản "
          + "mới KHÔNG tự chia sẻ cho ai; muốn chia sẻ hãy chọn mục trong "
          + "lịch sử rồi xem trước và xác nhận.";
      } else {
        state.editing = null;
        editor.noteField.input.value = "";
        editor.saveBtn.textContent = "Lưu tâm trạng hôm nay";
      }
    })
    .catch(() => { /* giữ trạng thái tạo mới; lỗi hiện ở lịch sử/summary */ });
}

function todayVnIso() {
  // Chỉ dùng để ĐỐI CHIẾU hiển thị với entry_date máy chủ (UTC+7 cố định),
  // không phải nguồn chân lý ngày ghi nhận.
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

function saveEntry(ctx, state, editor) {
  const emotion = state.selectedEmotion;
  if (!emotion) {
    editor.feedback.textContent = "Hãy chọn một cảm xúc trước đã.";
    return;
  }
  const lc = state._lc;
  const gen = lc.generation;
  const note = editor.noteField.input.value;
  editor.saveBtn.disabled = true;
  editor.saveBtn.title = "Đang lưu…";
  // R08: khoá đúng nhánh ghi TRƯỚC khi gọi — tạo chỉ khi thực sự chưa có
  // mục đang sửa; đã có thì PATCH ĐÚNG entry_id đó (không bao giờ đổi
  // nhánh giữa chừng dựa trên trạng thái đã bị mutation).
  const editingBefore = state.editing;
  const write = editingBefore
    ? ctx.adapter.editMoodEntry(editingBefore.entry_id, { emotion, note })
    : ctx.adapter.createMoodEntry({ emotion, note });
  write
    .then((saved) => {
      if (lc.cancelled || lc.generation !== gen) return; // phiên/trang đã đổi
      // R08: trạng thái editor theo RESPONSE máy chủ — không reset về chế
      // độ tạo sau khi lưu. Lần lưu kế tiếp tiếp tục PATCH đúng mục vừa
      // lưu (revision tăng), không bao giờ POST trùng ngày nữa.
      const entry = saved && saved.entry_id ? saved : null;
      if (entry) {
        state.editing = entry;
        editor.noteField.input.value = entry.note || ""; // nội dung máy chủ đã ghi
        state.selectedEmotion = entry.emotion;
        markSelectedChip(editor.chips, entry.emotion);
        editor.saveBtn.textContent = entry.entry_date === todayVnIso()
          ? "Lưu thay đổi cho hôm nay"
          : "Lưu thay đổi cho mục đã chọn";
        editor.feedback.textContent = editingBefore
          ? `Máy chủ đã ghi nhận phiên bản ${entry.revision} cho mục ngày `
            + `${entry.entry_date}. Bản đang chia sẻ (nếu có) ngừng đọc được `
            + "cho đến khi bạn xem trước và chia sẻ lại. Lưu tiếp sẽ cập "
            + "nhật đúng mục này, không tạo mục ngày khác."
          : `Máy chủ đã ghi nhận tâm trạng ngày ${entry.entry_date} `
            + `(phiên bản ${entry.revision}) — chỉ mình bạn thấy. Lưu tiếp `
            + "sẽ cập nhật đúng mục này thành phiên bản mới, không tạo "
            + "mục trùng ngày.";
      } else {
        // Máy chủ không trả payload entry (trường hợp ngoại lệ): hỏi lại
        // máy chủ để đặt đúng chế độ — không tự đoán, không tự xoá nháp.
        editor.feedback.textContent = "Máy chủ đã ghi nhận. Đang đồng bộ "
          + "lại trạng thái mục…";
        syncEditorWithToday(ctx, editor, state);
      }
      loadSummary(ctx, state, state._summaryCard);
      loadHistory(ctx, state._historyCard, state, { reset: true });
    })
    .catch((error) => {
      if (lc.cancelled || lc.generation !== gen) return;
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      // Giữ nguyên nháp (emotion + note) để sửa rồi lưu lại; KHÔNG tự retry.
      editor.feedback.textContent = errorText(error);
    })
    .finally(() => {
      if (lc.cancelled || lc.generation !== gen) return;
      editor.saveBtn.disabled = false;
      editor.saveBtn.title = "";
    });
}

/* ------------------------------- Summary --------------------------------- */

function loadSummary(ctx, state, card) {
  const lc = state._lc;
  const gen = lc.generation;
  clear(card);
  card.appendChild(h("h2", { class: "fb-scard__title" }, "Chút hơn 3 tháng qua"));
  card.appendChild(h("p", { class: "fb-sec__sub" },
    "Đếm mô tả cho riêng bạn — không điểm, không xếp hạng, không so sánh."));
  const list = h("ul", { class: "fb-list" });
  card.appendChild(list);
  ctx.adapter.moodSummary(SUMMARY_WINDOW_DAYS)
    .then((data) => {
      if (lc.cancelled || lc.generation !== gen) return;
      const rows = (data && data.results) || [];
      if (!rows.length) {
        list.appendChild(h("li", { class: "fb-list__item" },
          "Chưa có dữ liệu để mô tả."));
        return;
      }
      for (const row of rows) {
        list.appendChild(h("li", { class: "fb-list__item" },
          `${row.label}: ${row.count} ngày`));
      }
    })
    .catch(() => {
      if (lc.cancelled || lc.generation !== gen) return;
      clear(list);
      list.appendChild(h("li", { class: "fb-list__item" },
        "Chưa tải được thống kê. Thử tải lại trang nhé."));
    });
}

/* ------------------------------- History --------------------------------- */

function loadHistory(ctx, card, state, { reset = false } = {}) {
  const lc = state._lc;
  const gen = lc.generation;
  // Phản hồi muộn giữa các lần tải CÙNG TRANG: mỗi lần tải một số thứ tự;
  // chỉ lần mới nhất được ghi vào danh sách.
  state._histSeq = (state._histSeq || 0) + 1;
  const seq = state._histSeq;
  if (reset) {
    clear(card);
    state.historyNextCursor = null;
    card.appendChild(h("h2", { class: "fb-scard__title" }, "Lịch sử"));
    card.appendChild(h("p", { class: "fb-sec__sub" },
      "Mỗi mục riêng tư đến khi bạn chia sẻ đúng mục đó cho đúng người."));
  }
  let list = card.querySelector(".fb-list");
  if (!list) {
    list = h("ul", { class: "fb-list" });
    card.appendChild(list);
  }
  let moreBtn = card.querySelector("[data-mood-more]");
  if (!moreBtn) {
    moreBtn = createButton({
      label: "Tải thêm", variant: "ghost",
      // R09: guard kép — KHÔNG gọi API khi (1) đang có lần tải chạy hoặc
      // (2) hết cursor (máy chủ trả next=null). Chặn double-click/race
      // làm tải lại trang đầu rồi append trùng mục.
      onClick: () => {
        if (state._histLoading || !state.historyNextCursor) return;
        loadHistory(ctx, card, state, {});
      },
    });
    moreBtn.dataset.moodMore = "1";
    moreBtn.hidden = true;
    card.appendChild(moreBtn);
  }

  // R09: cờ đang-tải theo số thứ tự lần tải — chỉ lần tải MỚI NHẤT được
  // quyền mở khoá nút; lần cũ bị thay thế không tự clear cờ của lần mới.
  state._histLoading = seq;
  const loading = h("li", { class: "fb-list__item" }, "Đang tải…");
  list.appendChild(loading);
  ctx.adapter.listMoodEntries({
    cursor: reset ? null : state.historyNextCursor,
    limit: HISTORY_PAGE_SIZE,
  })
    .then((data) => {
      if (lc.cancelled || lc.generation !== gen || seq !== state._histSeq) {
        loading.remove();
        return;
      }
      loading.remove();
      const rows = (data && data.results) || [];
      state.historyNextCursor = (data && data.nextCursor) || null;
      if (reset && !rows.length) {
        list.appendChild(h("li", { class: "fb-list__item" },
          "Chưa có mục nào. Ghi nhận cảm xúc đầu tiên ở trên nhé."));
      }
      for (const entry of rows) {
        list.appendChild(historyRow(ctx, state, entry));
      }
      // hidden=true + CSS .fb-btn[hidden]{display:none} ẩn THẬT SỰ (không
      // nhận focus/click); guard onClick phía trên chặn cả trường hợp khác.
      moreBtn.hidden = !state.historyNextCursor;
    })
    .catch((error) => {
      if (lc.cancelled || lc.generation !== gen || seq !== state._histSeq) {
        loading.remove();
        return;
      }
      loading.remove();
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      // Lỗi tải thêm: giữ cursor hiện có, hiện lỗi trong danh sách; người
      // dùng bấm lại khi muốn — KHÔNG tự retry.
      list.appendChild(h("li", { class: "fb-list__item" },
        errorText(error)));
    })
    .finally(() => {
      if (state._histLoading === seq) state._histLoading = null;
    });
}

function historyRow(ctx, state, entry) {
  const row = h("li", { class: "fb-list__item" });
  row.appendChild(h("div", {},
    h("strong", {}, `${entry.entry_date} — ${entry.emotion_label || entry.emotion}`),
    entry.note ? h("p", { class: "fb-sec__sub" }, entry.note) : null,
    h("p", { class: "fb-sec__sub" }, `Phiên bản hiện tại: ${entry.revision}`),
  ));

  const actions = h("div", { class: "fb-sec__row" });
  actions.appendChild(createButton({
    label: "Sửa mục này", variant: "secondary",
    onClick: () => {
      state.editing = entry;
      state._editor.noteField.input.value = entry.note || "";
      state.selectedEmotion = entry.emotion;
      markSelectedChip(state._editor.chips, entry.emotion);
      state._editor.saveBtn.textContent = "Lưu thay đổi cho mục đã chọn";
      state._editor.feedback.textContent =
        `Đang sửa mục ngày ${entry.entry_date}. Lưu sẽ tạo phiên bản mới `
        + "KHÔNG tự chia sẻ lại — bản đang chia sẻ (nếu có) sẽ ngừng đọc được "
        + "cho đến khi bạn xem trước và chia sẻ lại.";
      window.scrollTo(0, 0);
    },
  }));
  actions.appendChild(createButton({
    label: "Chia sẻ mục này", variant: "primary",
    onClick: () => openShareSheet(ctx, state, entry),
  }));
  row.appendChild(actions);
  return row;
}

/* ------------------------- Share flow (sheet) ---------------------------- */

function openShareSheet(ctx, state, entry) {
  const lc = state._lc;
  const gen = lc.generation;
  // Preview dùng đúng dữ liệu MÀ NGƯỜI DÙNG ĐANG THẤY từ lần tải lịch sử;
  // xác nhận gửi expected_revision để máy chủ từ chối nếu bản đã đổi.
  const preview = {
    entryId: entry.entry_id,
    revision: entry.revision,
    date: entry.entry_date,
    emotionLabel: entry.emotion_label || entry.emotion,
    note: entry.note || "",
  };

  const content = h("div", {});
  content.appendChild(h("p", { class: "fb-sec__sub" },
    "Chia sẻ ĐÚNG mục này cho ĐÚNG một người — không chia sẻ cả lịch sử."));

  content.appendChild(h("h3", {}, "1) Xem trước nội dung sẽ chia sẻ"));
  // R10: thân preview giữ tham chiếu để tải lại bản mới ngay TRONG sheet
  // khi máy chủ từ chối (409 stale) — bắt buộc xem lại rồi xác nhận lại.
  const previewBody = h("div", { class: "fb-card", style: "padding:12px" });
  renderPreviewBody(previewBody, preview);
  content.appendChild(previewBody);
  content.appendChild(h("p", { class: "fb-sec__sub" },
    "Người nhận sẽ thấy NGUYÊN phần trên (bao gồm ghi chú) ở đúng phiên bản này."));

  content.appendChild(h("h3", {}, "2) Chọn người nhận đang kết nối"));
  const selectWrap = h("select", { id: "mood-share-recipient", class: "fb-input" });
  const recipientStatus = h("p", { class: "fb-sec__sub", role: "status" },
    "Đang tải kết nối…");
  content.appendChild(selectWrap);
  content.appendChild(recipientStatus);

  const grantSection = h("div", {});
  content.appendChild(grantSection);

  // R10: lỗi thao tác chia sẻ/thu hồi hiển thị ngay TRONG sheet (live
  // region assertive) — không ghi vào editor phía sau overlay nữa.
  const sheetFeedback = h("p", {
    class: "fb-sec__sub fb-sheet__feedback",
    role: "alert",
    "aria-live": "assertive",
  });
  // Đường phục hồi khi stale: tải bản mới (GET) rồi NGƯỜI DÙNG phải xem
  // lại và bấm xác nhận lại — không tự retry, không tự share revision mới.
  const refreshBtn = createButton({
    label: "Xem lại bản mới", variant: "secondary",
    onClick: () => refreshPreview(),
  });
  refreshBtn.hidden = true;

  const confirmBtn = createButton({
    label: "Xác nhận chia sẻ",
    variant: "cta",
    disabled: true,
    onClick: () => confirmShare(ctx, state, preview, selectWrap, sheetHandle),
  });
  content.appendChild(sheetFeedback);
  content.appendChild(refreshBtn);
  content.appendChild(confirmBtn);

  const sheetHandle = {
    close() { try { root.close(); } catch { /* đã đóng */ } },
    feedback: sheetFeedback, // R10: lỗi ghi vào live region trong sheet
    setBusy(value) {
      confirmBtn.disabled = value;
      confirmBtn.title = value ? "Đang gửi…" : "";
    },
    // R10: sau 409 stale — khoá xác nhận, hiện đường "Xem lại bản mới";
    // chỉ refreshPreview (đã xem bản mới) mở khoá lại.
    setStale(stale) {
      refreshBtn.hidden = !stale;
      confirmBtn.disabled = stale === true;
      confirmBtn.title = stale ? "Hãy xem lại bản mới rồi xác nhận lại" : "";
    },
  };

  function renderPreviewBody(target, data) {
    clear(target);
    target.appendChild(h("p", {},
      h("strong", {}, `${data.date} — ${data.emotionLabel}`)));
    target.appendChild(h("p", { class: "fb-sec__sub" },
      data.note ? `Ghi chú: ${data.note}` : "(Không có ghi chú)"));
    target.appendChild(h("p", { class: "fb-sec__sub" },
      `Phiên bản: ${data.revision}`));
  }

  function refreshPreview() {
    if (lc.cancelled || lc.generation !== gen) return;
    refreshBtn.disabled = true;
    sheetFeedback.textContent = "Đang tải bản mới nhất…";
    ctx.adapter.getMoodEntry(preview.entryId)
      .then((fresh) => {
        if (lc.cancelled || lc.generation !== gen) return;
        if (!fresh || !fresh.entry_id) throw new Error("missing-entry");
        preview.revision = fresh.revision;
        preview.date = fresh.entry_date;
        preview.emotionLabel = fresh.emotion_label || fresh.emotion;
        preview.note = fresh.note || "";
        renderPreviewBody(previewBody, preview);
        refreshBtn.hidden = true;
        refreshBtn.disabled = false;
        confirmBtn.disabled = false; // đã xem bản mới — xác nhận lại thủ công
        confirmBtn.title = "";
        sheetFeedback.textContent = "Đã tải bản mới nhất. Hãy đọc lại nội dung "
          + "trên rồi bấm “Xác nhận chia sẻ” để gửi đúng bản này. Chưa xác nhận "
          + "thì chưa gửi cho ai.";
      })
      .catch(() => {
        if (lc.cancelled || lc.generation !== gen) return;
        refreshBtn.disabled = false;
        sheetFeedback.textContent =
          "Chưa tải được bản mới. Vui lòng thử lại — chưa gửi gì cho ai.";
      });
  }

  const root = createSheet({
    title: "Chia sẻ mục này",
    content,
    actions: [],
    // R01: gỡ preview/ghi chú khỏi DOM khi sheet đóng, và bỏ đăng ký khỏi
    // danh sách overlay của trang.
    onClose: () => { lc.unregister(sheetHandle); clear(content); },
  });
  lc.register(sheetHandle); // rời trang/đăng xuất/đổi phiên -> đóng thật

  Promise.all([
    ctx.adapter.listConnections({ limit: 50 }).catch(() => null),
    ctx.adapter.listMoodEntryShares(preview.entryId).catch(() => null),
  ])
    .then(([connections, shares]) => {
      if (lc.cancelled || lc.generation !== gen) return; // phản hồi muộn
      const rows = (connections && connections.results) || [];
      clear(selectWrap);
      if (!rows.length) {
        selectWrap.appendChild(h("option", { value: "" },
          "— Chưa có người đồng hành đang kết nối —"));
        recipientStatus.textContent =
          "Chưa kết nối với ai. Vẫn ghi tâm trạng riêng được nhé; muốn chia sẻ "
          + "hãy mở trang Cá nhân để tạo lời mời kết nối.";
        renderGrants(ctx, state, grantSection, shares, preview, sheetFeedback);
        return;
      }
      for (const conn of rows) {
        const label = (conn.counterpart && conn.counterpart.display_name)
          || "Người đồng hành (chưa đặt tên gọi)";
        selectWrap.appendChild(h("option", { value: conn.other_party_id },
          `${label}${conn.relationship_kind === "backup" ? " (hỗ trợ dự phòng)" : ""}`));
      }
      recipientStatus.textContent =
        "Tên là tự khai báo — hãy chắc chắn bạn chọn đúng người.";
      confirmBtn.disabled = false;
      renderGrants(ctx, state, grantSection, shares, preview, sheetFeedback);
    });

  return sheetHandle;
}

function renderGrants(ctx, state, section, shares, preview, sheetFeedback) {
  const lc = state._lc;
  const gen = lc.generation;
  clear(section);
  const rows = (shares && shares.results) || [];
  section.appendChild(h("h3", {}, "Người đã nhận mục này"));
  if (!rows.length) {
    section.appendChild(h("p", { class: "fb-sec__sub" },
      "Mục này chưa chia sẻ cho ai."));
    return;
  }
  const list = h("ul", { class: "fb-list" });
  for (const grant of rows) {
    const li = h("li", { class: "fb-list__item" },
      grantBadge(grant.status),
      h("p", { class: "fb-sec__sub" },
        `Người nhận: …${String(grant.recipient_id).slice(-6)} · phiên bản ${grant.approved_revision}`),
    );
    if (grant.status !== "revoked") {
      li.appendChild(createButton({
        label: "Thu hồi quyền này", variant: "ghost",
        onClick: () => {
          if (lc.cancelled || lc.generation !== gen) return;
          const dialog = createDialog({
            title: "Thu hồi quyền xem?",
            message:
              "Người này sẽ không đọc được mục này nữa kể từ lần đọc tiếp theo. "
              + "Các mục và người nhận khác không đổi.",
            actions: [
              { label: "Để nguyên", variant: "secondary", onClick: () => dialog.close() },
              {
                label: "Thu hồi", variant: "danger",
                onClick: () => {
                  dialog.close();
                  ctx.adapter.revokeMoodShare(grant.share_id)
                    .then(() => ctx.adapter.listMoodEntryShares(preview.entryId))
                    .then((fresh) => {
                      if (lc.cancelled || lc.generation !== gen) return;
                      renderGrants(ctx, state, section, fresh, preview,
                        sheetFeedback);
                    })
                    .catch((error) => {
                      if (lc.cancelled || lc.generation !== gen) return;
                      if (error && error.status === 401) {
                        ctx.navigate("/login?reason=expired");
                        return;
                      }
                      // R10: lỗi thu hồi báo ngay trong sheet, trạng thái
                      // badge giữ nguyên — KHÔNG báo đã thu hồi.
                      if (sheetFeedback) {
                        sheetFeedback.textContent =
                          "Chưa thu hồi được quyền này — máy chủ chưa ghi "
                          + "nhận thay đổi. Vui lòng thử lại.";
                      }
                    });
                },
              },
            ],
            // R01: dialog thu hồi cũng là overlay chứa dữ liệu — đăng ký
            // để rời trang/đăng xuất đóng thật (gỡ khỏi body + listener).
            onClose: () => lc.unregister(dialog),
          });
          lc.register(dialog);
        },
      }));
    }
    list.appendChild(li);
  }
  section.appendChild(list);
}

function confirmShare(ctx, state, preview, selectWrap, sheetHandle) {
  const lc = state._lc;
  const gen = lc.generation;
  const recipientId = selectWrap.value;
  if (!recipientId) return;
  const sheetFeedback = sheetHandle && sheetHandle.feedback;
  sheetHandle.setBusy(true);
  ctx.adapter.shareMoodEntry(preview.entryId, {
    recipientId,
    expectedRevision: preview.revision,
  })
    .then(() => {
      if (lc.cancelled || lc.generation !== gen) return; // đã rời trang/đổi phiên
      sheetHandle.close();
      if (state._editor) {
        state._editor.feedback.textContent =
          "Máy chủ đã ghi nhận chia sẻ. Người nhận sẽ thấy đúng bản bạn vừa xem trước.";
      }
    })
    .catch((error) => {
      if (lc.cancelled || lc.generation !== gen) return;
      sheetHandle.setBusy(false);
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      // R10: lỗi hiện NGAY TRONG sheet đang mở (không ghi ra editor phía
      // sau overlay). Stale: khoá nút xác nhận, bắt buộc bấm “Xem lại bản
      // mới” rồi xác nhận lại — KHÔNG tự retry, KHÔNG tự share bản mới.
      const stale = error && (error.code === "preview_stale"
        || (error.details && error.details.reason === "stale_revision"));
      const baseMessage = errorText(error);
      if (sheetFeedback) {
        sheetFeedback.textContent = stale
          ? baseMessage + " Bấm “Xem lại bản mới” để tải nội dung hiện tại, "
            + "đọc lại rồi xác nhận lại. Chưa gửi gì cho ai."
          : baseMessage;
      }
      sheetHandle.setStale(stale === true);
    });
}
