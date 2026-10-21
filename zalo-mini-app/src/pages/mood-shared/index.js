// F07 — Được chia sẻ với bạn (phía nhận, US-026): danh sách mục CÒN ĐƯỢC
// PHÉP xem (máy chủ lọc quyền trước phân trang) + chi tiết RECHECK QUYỀN
// MỖI LẦN ĐỌC. 404 = đã thu hồi / đã sửa chưa chia sẻ lại / kết nối kết
// thúc — thông điệp rõ, không lộ dữ liệu người khác.
//
// Không cache note bền vững: nội dung chỉ nằm trong DOM trang; đóng trang /
// đăng xuất / đổi actor là hết (storage không chứa private content — SEC-10).
// Danh sách có "Tải thêm" bounded theo cursor; không tải toàn bộ lịch sử.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createEmptyState, createErrorState, createTopBar,
} from "../../components/index.js";

const PAGE_SIZE = 20;

export const page = {
  id: "mood-shared",
  title: "Được chia sẻ với bạn",
  requiresRole: true,
  requiresAuth: true, // dữ liệu chia sẻ theo phiên (router M1)
  showBottomNav: false, // trang phụ — tab dưới chỉ ở 5 trang cấp một (DESIGN.md §5)
  chrome: "app",

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "mood-shared" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(createTopBar({ title: "Được chia sẻ với bạn" }));
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    // R01: lifecycle object dùng chung cho mọi phản hồi muộn của trang —
    // callback muộn KHÔNG ghi DOM sau khi rời trang / đăng xuất / đổi actor.
    const lc = { cancelled: false, generation: 0 };
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      lc.cancelled = true;
      lc.generation += 1;
    };

    const demo = Boolean(ctx.store.getState().demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(createEmptyState({
        title: "Cần đăng nhập để xem mục được chia sẻ",
        description:
          "Danh sách này thuộc về tài khoản của bạn. Đăng nhập để tiếp tục.",
        action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
      }));
      return root;
    }

    const state = { nextCursor: null, _lc: lc };

    const listCard = h("section", { class: "fb-scard" });
    body.appendChild(listCard);

    loadList(ctx, listCard, state, { reset: true });
    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

function loadList(ctx, card, state, { reset = false } = {}) {
  const lc = state._lc;
  const gen = lc.generation;
  state._listSeq = (state._listSeq || 0) + 1;
  const seq = state._listSeq;
  if (reset) {
    clear(card);
    state.nextCursor = null;
    card.appendChild(h("h2", { class: "fb-scard__title" }, "Mục đang được chia sẻ"));
    card.appendChild(h("p", { class: "fb-sec__sub" },
      "Chỉ hiện những mục bạn CÒN được xem: không thu hồi, chưa bị sửa, "
      + "kết nối vẫn hoạt động. Máy chủ kiểm tra lại quyền mỗi lần bạn mở."));
  }
  let list = card.querySelector(".fb-list");
  if (!list) {
    list = h("ul", { class: "fb-list" });
    card.appendChild(list);
  }
  let moreBtn = card.querySelector("[data-shared-more]");
  if (!moreBtn) {
    moreBtn = createButton({
      label: "Tải thêm", variant: "ghost",
      // R09: guard kép — không gọi API khi đang tải hoặc hết cursor;
      // chặn double-click/race append trùng mục ở danh sách nhận.
      onClick: () => {
        if (state._listLoading || !state.nextCursor) return;
        loadList(ctx, card, state, {});
      },
    });
    moreBtn.dataset.sharedMore = "1";
    moreBtn.hidden = true;
    card.appendChild(moreBtn);
  }

  // R09: cờ đang-tải theo seq — chỉ lần tải mới nhất được mở khoá nút.
  state._listLoading = seq;
  const loading = h("li", { class: "fb-list__item" }, "Đang tải…");
  list.appendChild(loading);
  ctx.adapter.listSharedMoodEntries({
    cursor: reset ? null : state.nextCursor,
    limit: PAGE_SIZE,
  })
    .then((data) => {
      if (lc.cancelled || lc.generation !== gen || seq !== state._listSeq) {
        loading.remove();
        return;
      }
      loading.remove();
      const rows = (data && data.results) || [];
      state.nextCursor = (data && data.nextCursor) || null;
      if (reset && !rows.length) {
        list.appendChild(h("li", { class: "fb-list__item" },
          "Chưa có gì được chia sẻ với bạn."));
      }
      for (const row of rows) {
        const li = h("li", { class: "fb-list__item" },
          h("strong", {}, `Mục ngày ${String(row.shared_at).slice(0, 10)}`),
          h("p", { class: "fb-sec__sub" }, `Phiên bản: ${row.approved_revision}`),
        );
        li.appendChild(createButton({
          label: "Mở nội dung", variant: "secondary",
          onClick: () => openDetail(ctx, card, state, row.share_id),
        }));
        list.appendChild(li);
      }
      moreBtn.hidden = !state.nextCursor;
    })
    .catch((error) => {
      if (lc.cancelled || lc.generation !== gen || seq !== state._listSeq) {
        loading.remove();
        return;
      }
      loading.remove();
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      clear(card);
      card.appendChild(createErrorState({
        title: "Không tải được danh sách",
        description: error && error.kind === "timeout"
          ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
          : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
        retryLabel: "Thử lại",
        onRetry: () => loadList(ctx, card, state, { reset: true }),
      }));
    })
    .finally(() => {
      if (state._listLoading === seq) state._listLoading = null;
    });
}

function openDetail(ctx, card, state, shareId) {
  const lc = state._lc;
  const gen = lc.generation;
  // Mỗi lần mở là một lần kiểm tra quyền MỚI với máy chủ: nội dung lần mở
  // trước bị GỠ khỏi màn trước khi hỏi lại — không dùng snapshot cũ làm
  // bằng chứng quyền còn hiệu lực sau thu hồi/sửa/kết nối kết thúc.
  const previous = card.querySelector("[data-shared-detail]");
  if (previous) previous.remove();
  const detail = h("section", { class: "fb-scard", dataset: { sharedDetail: "1" } });
  card.appendChild(detail);
  detail.appendChild(h("h2", { class: "fb-scard__title" }, "Nội dung"));
  const status = h("p", { class: "fb-sec__sub", role: "status" },
    "Đang kiểm tra quyền với máy chủ…");
  detail.appendChild(status);

  ctx.adapter.getSharedMoodEntry(shareId)
    .then((data) => {
      if (lc.cancelled || lc.generation !== gen) return; // phản hồi muộn
      const entry = (data && data.entry) || {};
      clear(detail);
      detail.appendChild(h("h2", { class: "fb-scard__title" },
        `${entry.entry_date} — ${entry.emotion_label || entry.emotion}`));
      detail.appendChild(h("p", { class: "fb-sec__sub" },
        `Phiên bản: ${entry.revision}`));
      // Ghi chú render qua textContent (h) — an toàn với tiếng Việt/emoji/
      // ký tự đặc biệt; không bao giờ thực thi HTML từ nội dung người dùng.
      detail.appendChild(h("p", {},
        entry.note ? entry.note : "(Không có ghi chú)"));
      detail.appendChild(h("p", { class: "fb-sec__sub" },
        "Nếu mục này bị thu hồi hoặc được sửa, lần mở sau sẽ không còn xem "
        + "được — máy chủ kiểm tra quyền mỗi lần đọc."));
      const closeBtn = createButton({
        label: "Đóng nội dung", variant: "ghost",
        onClick: () => detail.remove(),
      });
      detail.appendChild(closeBtn);
    })
    .catch((error) => {
      if (lc.cancelled || lc.generation !== gen) return;
      if (error && error.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      clear(detail);
      detail.appendChild(h("h2", { class: "fb-scard__title" }, "Không còn xem được"));
      detail.appendChild(h("p", { class: "fb-sec__sub" },
        error && error.kind === "timeout"
          ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
          : "Mục này không còn xem được: có thể đã bị thu hồi, đã được sửa "
            + "chưa chia sẻ lại, hoặc kết nối đã kết thúc."));
      detail.appendChild(createButton({
        label: "Đóng", variant: "ghost",
        onClick: () => detail.remove(),
      }));
    });
}
