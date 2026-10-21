// M08 — Hộp thư trao đổi thấu cảm (w14 → restyle Stitch 2026-10-21).
// Frame tham chiếu: m08_h_p_th_danh_s_ch_c_chi_ti_t + m08_h_p_th_c_c_trang_
// thai_ngo_i_l (đã loại khối Handover Spec, "bảo mật tuyệt đối", offline-
// cache SQLite/IndexedDB theo DESIGN-REVIEW.md — giữ no-polling, no-cache).
// Master (danh sách) + detail (tóm tắt metadata) theo mẫu; dữ liệu
// thật qua adapter F05 (packages/family_bridge_features/f05_inbox):
//
//   GET /api/v1/messages?cursor&limit
//        → { results:[{ message_id, kind, direction ("sent"|"received"),
//            counterparty_id, title, created_at, read, reply_to }], next }
//        Envelope f05 dùng "next" — zalo-adapter map về nextCursor cho UI.
//        LIST KHÔNG CÓ body/snippet → hàng chỉ có tiêu đề thật từ máy chủ,
//        KHÔNG bịa đoạn xem trước.
//
// Quy tắc trung thực (DSA + QA, worklog Task 19):
// - markRead KHÔNG nằm ở trang này: chỉ trang chi tiết #/messages/{id} (w15)
//   gọi, và CHỈ khi direction === "received".
// - KHÔNG xác nhận xem hai chiều: không hiển thị trạng thái mở thư của người
//   nhận, không báo bất cứ gì về việc người kia xem thư. Chip "Mới" chỉ dựa
//   trên dữ liệu đã tải của chính mình (received && !read).
// - Tìm kiếm + nhóm lọc + bộ đếm chỉ chạy trên CỬA SỔ ĐÃ TẢI (ghi rõ
//   "trong số thư đã tải") — không tuyên bố về toàn bộ hộp thư.
// - Không polling (DSA-10): dữ liệu mới hơn chỉ khi người dùng tải lại trang
//   hoặc bấm "Tải thêm" (cursor thật từ máy chủ).
// - Desktop ≥1024px: cột phải là tóm tắt metadata của thư được chọn qua
//   #/mailbox?sel=<id>; nội dung thư luôn mở bằng trang #/messages/{id} (w15).
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton,
  createEmptyState,
  createErrorState,
  createDemoBanner,
  createIcon,
  createSkeleton,
} from "../../components/index.js";

const PAGE_LIMIT = 20; // kích thước mỗi lần tải (máy chủ vẫn quyết thật)
const MAX_WINDOW = 200; // trần cửa sổ client (pattern f05 mobile reference)

// Nhóm lọc theo hợp đồng: kind text|emotion_card → "note";
// listening_signal → "signal"; còn lại (journal_reply/mood_reply/quick_reply)
// hoặc bất kỳ thư có reply_to → "reply".
const GROUPS = [
  { key: "all", label: "Tất cả" },
  { key: "note", label: "Lời nhắn & Thẻ cảm xúc" },
  { key: "signal", label: "Tín hiệu kết nối" },
  { key: "reply", label: "Lời hồi âm" },
];

const KIND_LABELS = {
  text: "Lời nhắn",
  emotion_card: "Thẻ cảm xúc",
  listening_signal: "Tín hiệu kết nối",
  journal_reply: "Lời hồi âm",
  mood_reply: "Lời hồi âm",
  quick_reply: "Lời hồi âm",
};

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/** Nhãn thời gian ngắn gọn, trung thực theo dữ liệu máy chủ đã tải. */
function timeLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "numeric",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function kindGroupOf(row) {
  if (row && row.reply_to) return "reply";
  const kind = row && row.kind ? String(row.kind) : "";
  if (kind === "listening_signal") return "signal";
  if (kind === "text" || kind === "emotion_card") return "note";
  return "reply";
}

function kindLabelOf(row) {
  const kind = row && row.kind ? String(row.kind) : "";
  return KIND_LABELS[kind] || "Thư";
}

function counterpartNameOf(row, namesById) {
  const id = row && row.counterparty_id ? String(row.counterparty_id) : "";
  return (id && namesById.get(id)) || "Thành viên Family Bridge";
}

export const page = {
  id: "mailbox",
  title: "Hộp thư",
  requiresRole: true,
  requiresAuth: true, // hộp thư là dữ liệu phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "mailbox" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    const state = readState(ctx.store);
    const demo = Boolean(state.demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để mở hộp thư",
          description:
            "Hộp thư là dữ liệu riêng của tài khoản bạn. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 3 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải hộp thư…"));

    const currentRun = ++runId;

    // Kết nối chỉ để hiện tên người đối diện; lỗi kết nối không chặn danh sách.
    Promise.all([
      Promise.resolve().then(() => ctx.adapter.listMessages({ limit: PAGE_LIMIT })),
      Promise.resolve()
        .then(() => ctx.adapter.listConnections({ limit: 20 }))
        .catch(() => null),
    ])
      .then(([messagesPage, connectionsPage]) => {
        if (cancelled || currentRun !== runId) return;
        const rows = (messagesPage && Array.isArray(messagesPage.results))
          ? messagesPage.results.slice()
          : [];
        const connections = (connectionsPage && Array.isArray(connectionsPage.results))
          ? connectionsPage.results
          : [];
        const namesById = new Map();
        connections.forEach((connection) => {
          if (!connection) return;
          const id = connection.other_party_id
            || (connection.counterpart && connection.counterpart.user_id)
            || null;
          const name = connection.counterpart && connection.counterpart.display_name;
          if (id && name) namesById.set(String(id), String(name));
        });
        renderMailbox(body, ctx, {
          demo,
          rows,
          namesById,
          nextCursor: (messagesPage && messagesPage.nextCursor) || null,
          selectedId: ctx.params ? ctx.params.get("sel") : null,
        });
      })
      .catch((error) => {
        if (cancelled || currentRun !== runId) return;
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
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
      title: "Không tải được hộp thư",
      description:
        "Máy chủ chưa phản hồi (lần khởi động đầu có thể mất tới một phút). "
        + "Không có thư nào bị mất — thử lại sau ít phút.",
      retryLabel: "Thử lại",
      onRetry: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
  body.appendChild(
    createButton({
      label: "Kiểm tra kết nối máy chủ",
      variant: "ghost",
      onClick: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
}

/* ------------------------------ Màn chính (w14) ------------------------------ */

function renderMailbox(body, ctx, { demo, rows, namesById, nextCursor, selectedId }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());

  const breadcrumb = h("nav", { class: "fb-breadcrumb", "aria-label": "Vị trí trang" });
  breadcrumb.appendChild(h("a", { class: "fb-breadcrumb__link", href: "#/home" }, "Trang chủ"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__sep", "aria-hidden": "true" }, "›"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__current" }, "Hộp thư"));
  body.appendChild(breadcrumb);

  body.appendChild(
    h("header", { class: "fb-sec" },
      h("div", { class: "fb-sec__row" },
        h("span", { class: "fb-journey__kicker" }, "Trao đổi thấu cảm"),
      ),
      h("div", { class: "fb-mx__title-row" },
        h("h1", { class: "fb-sec__greeting" }, "Hộp thư trao đổi thấu cảm"),
        h("a", {
          class: "fb-btn fb-btn--primary fb-btn--md fb-mx__compose",
          href: "#/compose",
        },
          createIcon({ name: "edit_note", size: 18, className: "fb-mx__compose-icon" }),
          "Soạn thư",
        ),
      ),
      h("p", { class: "fb-sec__sub" },
        "Không áp lực trả lời ngay • Chỉ người nhận được cấp quyền mới thấy nội dung",
      ),
    ),
  );

  // Trạng thái rỗng thật của máy chủ — giữ nguyên copy pin cũ (pages.test).
  if (!rows.length) {
    body.appendChild(
      createEmptyState({
        title: "Chưa có tin nhắn nào",
        description:
          "Khi hai bên đã kết nối, lời nhắn và phản hồi nhanh sẽ xuất hiện ở đây.",
        action: { label: "Soạn thư cảm xúc", onClick: () => ctx.navigate("/compose") },
      }),
    );
    body.appendChild(
      createButton({
        label: "Kiểm tra kết nối máy chủ",
        variant: "ghost",
        onClick: () => ctx.navigate("/connection-check"),
      }),
    );
    return;
  }

  // ---- Trạng thái tương tác: cửa sổ đã tải + bộ lọc + tìm kiếm ----
  const view = {
    rows: rows.slice(0, MAX_WINDOW),
    nextCursor: nextCursor || null,
    group: "all",
    query: "",
    loadingMore: false,
  };

  // ---- Bộ lọc nhóm + tìm kiếm (chỉ trên cửa sổ đã tải) ----
  const toolbar = h("section", { class: "fb-scard fb-mx-toolbar" });
  const pills = h("div", { class: "fb-cards-pills", role: "group", "aria-label": "Lọc theo loại thư" });
  const pillButtons = new Map();
  GROUPS.forEach(({ key, label }) => {
    const pill = h("button", {
      class: `fb-cards-pill${key === view.group ? " fb-cards-pill--active" : ""}`,
      type: "button",
      "aria-pressed": key === view.group ? "true" : "false",
      dataset: { group: key },
      onclick: () => {
        view.group = key;
        pillButtons.forEach((btn, btnKey) => {
          btn.classList.toggle("fb-cards-pill--active", btnKey === key);
          btn.setAttribute("aria-pressed", btnKey === key ? "true" : "false");
        });
        renderListSection();
      },
    }, label);
    pillButtons.set(key, pill);
    pills.appendChild(pill);
  });
  toolbar.appendChild(pills);

  const searchWrap = h("div", { class: "fb-mx-search" });
  const searchInput = h("input", {
    class: "fb-input",
    type: "search",
    placeholder: "Tìm trong số thư đã tải",
    "aria-label": "Tìm thư trong số thư đã tải",
    oninput: () => {
      view.query = searchInput.value.trim().toLowerCase();
      renderListSection();
    },
  });
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(
    h("span", { class: "fb-sec__sub" }, "Tìm theo tiêu đề hoặc tên người gửi — trong số thư đã tải"),
  );
  toolbar.appendChild(searchWrap);
  body.appendChild(toolbar);

  // ---- Bố cục master–detail: 1 cột <1024px, 2 cột ≥1024px (shell.css) ----
  const grid = h("div", { class: "fb-mx-grid" });
  const listCol = h("div", { class: "fb-mx-grid__master" });
  const detailCol = h("div", { class: "fb-mx-grid__detail" });
  grid.appendChild(listCol);
  grid.appendChild(detailCol);
  body.appendChild(grid);

  const listMeta = h("p", { class: "fb-sec__sub", role: "status" }, "");
  const listWrap = h("div", { class: "fb-mx-list" });
  listCol.appendChild(listMeta);
  listCol.appendChild(listWrap);

  const loadMoreBtn = createButton({
    label: "Tải thêm",
    variant: "ghost",
    onClick: () => onLoadMore(),
  });
  loadMoreBtn.hidden = !view.nextCursor;
  listCol.appendChild(loadMoreBtn);

  const detailNote = h("p", { class: "fb-sec__sub" },
    "Danh sách chỉ chứa tiêu đề — nội dung thư mở khi bạn bấm xem từng thư.");
  detailCol.appendChild(detailNote);
  const detailWrap = h("div", { class: "fb-mx-detail" });
  detailCol.appendChild(detailWrap);

  function filteredRows() {
    return view.rows.filter((row) => {
      if (view.group !== "all" && kindGroupOf(row) !== view.group) return false;
      if (!view.query) return true;
      const name = counterpartNameOf(row, namesById).toLowerCase();
      const title = row && row.title ? String(row.title).toLowerCase() : "";
      return title.includes(view.query) || name.includes(view.query);
    });
  }

  function renderListSection() {
    clear(listWrap);
    const visible = filteredRows();
    listMeta.textContent = `${visible.length} thư trong số đã tải`;

    if (!visible.length) {
      listWrap.appendChild(
        h("p", { class: "fb-mx-empty-note" },
          "Không có thư nào khớp bộ lọc trong số thư đã tải. Xóa bộ lọc hoặc tìm từ khác."),
      );
      return;
    }

    visible.forEach((row) => {
      listWrap.appendChild(renderRow(row));
    });
  }

  function renderRow(row) {
    const messageId = row && row.message_id ? String(row.message_id) : "";
    const name = counterpartNameOf(row, namesById);
    const isSelected = selectedId && messageId && messageId === String(selectedId);

    const rowEl = h("a", {
      class: `fb-mx-row${isSelected ? " fb-mx-row--active" : ""}`,
      href: `#/messages/${encodeURIComponent(messageId)}`,
      dataset: { messageId },
      "aria-label": `${kindLabelOf(row)}: ${String((row && row.title) || "")}`,
      onclick: (event) => {
        // Desktop ≥1024px: chọn thư hiển thị tóm tắt bên phải (#/mailbox?sel=).
        // Mobile: điều hướng mặc định sang trang chi tiết #/messages/{id}.
        const mq = typeof window.matchMedia === "function"
          ? window.matchMedia("(min-width: 1024px)")
          : null;
        if (mq && mq.matches) {
          event.preventDefault();
          ctx.navigate(`/mailbox?sel=${encodeURIComponent(messageId)}`);
        }
      },
    });

    const who = h("div", { class: "fb-mx-row__who" });
    who.appendChild(
      h("span", { class: "fb-mx-row__icon", "aria-hidden": "true" },
        createIcon({ name: kindGroupOf(row) === "signal" ? "hearing" : kindGroupOf(row) === "reply" ? "forum" : "mail", size: 20 })),
    );
    const text = h("div", { class: "fb-mx-row__text" });
    text.appendChild(h("span", { class: "fb-mx-row__name" }, name));
    // listMessages KHÔNG có body → tiêu đề thật từ máy chủ, không bịa xem trước.
    text.appendChild(
      h("span", { class: "fb-mx-row__title" }, String((row && row.title) || "(Không có tiêu đề)")),
    );
    text.appendChild(
      h("span", { class: "fb-sec__sub" }, kindLabelOf(row)),
    );
    who.appendChild(text);
    rowEl.appendChild(who);

    const side = h("div", { class: "fb-mx-row__side" });
    const direction = row && row.direction === "sent" ? "sent" : "received";
    if (direction === "received" && !row.read) {
      side.appendChild(h("span", { class: "fb-chip fb-chip--high" }, "Mới"));
    } else {
      const time = timeLabel(row.created_at);
      // "Gửi lúc" cho thư mình gửi; "Nhận lúc" cho thư đã nhận. Không có
      // trạng thái xem của phía đối diện ở bất kỳ hướng nào.
      const prefix = direction === "sent" ? "Gửi lúc" : "Nhận lúc";
      if (time) side.appendChild(h("span", { class: "fb-sec__sub" }, `${prefix} ${time}`));
    }
    rowEl.appendChild(side);
    return rowEl;
  }

  function renderDetailPane() {
    clear(detailWrap);
    const selected = view.rows.find(
      (row) => row && selectedId && String(row.message_id) === String(selectedId),
    );
    if (!selected) {
      detailWrap.appendChild(
        h("p", { class: "fb-mx-empty-note" },
          "Chưa chọn thư nào (hoặc thư đã chọn không nằm trong số thư đã tải)."),
      );
      return;
    }
    const pane = h("section", { class: "fb-scard fb-mx-detail__card" });
    pane.appendChild(h("p", { class: "fb-journey__kicker" }, "Thư đã chọn"));
    pane.appendChild(
      h("h2", { class: "fb-scard__title" }, String(selected.title || "(Không có tiêu đề)")),
    );
    pane.appendChild(
      h("p", { class: "fb-sec__sub" },
        `${selected.direction === "sent" ? "Thư bạn gửi tới" : "Thư bạn nhận từ"} `
        + `${counterpartNameOf(selected, namesById)}`),
    );
    const time = timeLabel(selected.created_at);
    if (time) pane.appendChild(h("p", { class: "fb-sec__sub" }, `Thời điểm: ${time}`));
    pane.appendChild(
      h("p", { class: "fb-sec__sub" },
        `${kindLabelOf(selected)}${selected.reply_to ? " • Là lời hồi âm cho một thư khác" : ""}`),
    );
    pane.appendChild(
      h("a", {
        class: "fb-btn fb-btn--primary",
        href: `#/messages/${encodeURIComponent(String(selected.message_id || ""))}`,
      }, "Mở thư để đọc nội dung"),
    );
    detailWrap.appendChild(pane);
  }

  function onLoadMore() {
    if (view.loadingMore || !view.nextCursor) return;
    view.loadingMore = true;
    loadMoreBtn.disabled = true;
    const cursor = view.nextCursor;
    Promise.resolve()
      .then(() => ctx.adapter.listMessages({ cursor, limit: PAGE_LIMIT }))
      .then((pageData) => {
        view.loadingMore = false;
        loadMoreBtn.disabled = false;
        const more = (pageData && Array.isArray(pageData.results)) ? pageData.results : [];
        const known = new Set(view.rows.map((row) => String(row.message_id || "")));
        more.forEach((row) => {
          if (row && !known.has(String(row.message_id || ""))) {
            if (view.rows.length < MAX_WINDOW) view.rows.push(row);
          }
        });
        view.nextCursor = (pageData && pageData.nextCursor) || null;
        loadMoreBtn.hidden = !view.nextCursor;
        renderListSection();
      })
      .catch(() => {
        view.loadingMore = false;
        loadMoreBtn.disabled = false;
        listMeta.textContent =
          "Chưa tải thêm được — kết nối máy chủ không ổn định. Các thư đã tải vẫn còn nguyên.";
      });
  }

  renderListSection();
  renderDetailPane();
}
