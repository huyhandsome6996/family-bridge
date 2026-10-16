// Cards — Thư viện thẻ cảm xúc (w10 Stitch, Web Render Task 2, M4).
// Tham chiếu Stitch: stitch_family_bridge_web_design_system/
//   w10_th_vi_n_th_c_m_x_c_online/.
//
// Hợp đồng backend f03_cards (worklog Task 19 — FINAL CONTRACT):
//   GET  /api/v1/cards?group={group}   → { results:[{card_id,version,
//        group_code,title,body,audience,...}], truncated, max_window }
//        (catalog chỉ chứa thẻ "published", cửa sổ <= 50 — DEC-17)
//   POST /api/v1/cards/preview  {card_id, version, recipient_id}
//        → preview binds (card, version, recipient) CHÍNH XÁC, không gửi
//   POST /api/v1/cards/send     {card_id, version, recipient_id, author_note}
//        (+ X-Idempotency-Key) → {message_id, state:"sent", card} (201)
//        author_note <= 1000 ký tự (MAX_AUTHOR_NOTE_CHARS, không cắt âm thầm)
//
// Sự thật dữ liệu / trung thực UI:
// - Filter pills: "Tất cả" + nhóm được suy ra TỪ DỮ LIỆU THẬT đã tải. Backend
//   f03 KHÔNG có enum nhóm (group_code do provider B16 định nghĩa, CharField
//   tự do) → KHÔNG bịa 6 mã nhóm theo mẫu Stitch. Các mã có thật trong repo
//   (fixture demo adapter: ap_luc, ranh_gioi, mong_thau_hieu) được gắn nhãn
//   tiếng Việt theo tên nhóm Stitch; mã lạ khác (nếu máy chủ trả) hiện nguyên
//   mã. Deviation so với Stitch được ghi trong báo cáo task-3b3.
// - KHÔNG copy nội bộ "W10 •" lên UI; KHÔNG counter bịa; KHÔNG avatar demo.
// - Gửi thẻ PHẢI qua preview + xác nhận cuối; key idempotency do client tạo
//   tại nút xác nhận (crypto.randomUUID) — mất response → tra cứu
//   /operations/{key} (lookupOperation), KHÔNG tự gửi lại.
// - Lỗi gửi → KẾT QUẢ CHƯA XÁC ĐỊNH (mirror wording của compose).
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton,
  createSheet,
  createEmptyState,
  createErrorState,
  createDemoBanner,
  createIcon,
  createSkeleton,
} from "../../components/index.js";

// Nhãn nhóm tiếng Việt cho các mã nhóm CÓ THẬT trong repo (fixture demo của
// adapter — nguồn duy nhất chứa group_code trên client). Mã khác máy chủ trả
// sẽ hiển thị nguyên mã (trung thực, không đoán nhãn).
const GROUP_LABELS = {
  ap_luc: "Áp lực học tập & kỳ vọng",
  ranh_gioi: "Cần không gian & ranh giới",
  mong_thau_hieu: "Mong muốn được thấu hiểu",
};

// f03 api.py: author_note <= MAX_AUTHOR_NOTE_CHARS (1000), allow_empty.
const NOTE_MAX = 1000;

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/** Khóa idempotency cho lượt gửi — client tạo TẠI nút xác nhận. */
function newIdemKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Webview cũ không có crypto.randomUUID: chuỗi ngẫu nhiên đủ dài, vẫn
  // duy nhất cho lượt gửi này (không phải UUID thật — chỉ là fallback).
  return `fb-${Date.now().toString(36)}-`
    + `${Math.random().toString(36).slice(2, 12)}-`
    + `${Math.random().toString(36).slice(2, 12)}`;
}

function groupLabel(code) {
  return GROUP_LABELS[code] || String(code || "Khác");
}

export const page = {
  id: "cards",
  title: "Thư viện thẻ cảm xúc",
  requiresRole: true,
  requiresAuth: true, // catalog thẻ là dữ liệu phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "cards" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      root.querySelectorAll(".fb-sheet, .fb-overlay, .fb-sheet-root").forEach((el) => el.remove());
    };

    const demo = Boolean(readState(ctx.store).demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để mở thư viện thẻ",
          description:
            "Thư viện thẻ là dữ liệu của tài khoản bạn. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải thư viện thẻ…"));

    // Nhóm đang lọc giữ ở scope render; pill click → nạp lại bằng param thật.
    const state = { group: null };

    const load = () => {
      const thisRun = ++runId;
      Promise.all([
        Promise.resolve()
          .then(() => ctx.adapter.listCards(
            state.group ? { group: state.group, limit: 50 } : { limit: 50 }))
          .then((data) => ({
            results: (data && Array.isArray(data.results) ? data.results : []),
            truncated: Boolean(data && data.truncated),
            maxWindow: (data && data.maxWindow) || null,
          })),
        Promise.resolve()
          .then(() => ctx.adapter.listConnections({ limit: 20 }))
          .then((pageData) => (pageData && Array.isArray(pageData.results) ? pageData.results : []))
          .catch(() => null),
      ])
        .then(([cardsPage, connections]) => {
          if (cancelled || thisRun !== runId) return;
          renderCards(body, ctx, {
            demo,
            cards: cardsPage.results,
            truncated: cardsPage.truncated,
            maxWindow: cardsPage.maxWindow,
            group: state.group,
            setGroup: (next) => {
              state.group = next;
              load();
            },
            connections: connections || [],
            reload: load,
          });
        })
        .catch((error) => {
          if (cancelled || thisRun !== runId) return;
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          clear(body);
          body.appendChild(
            createErrorState({
              title: "Không tải được thư viện thẻ",
              description: error && error.kind === "timeout"
                ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
                : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
              retryLabel: "Thử lại",
              onRetry: () => load(),
            }),
          );
        });
    };
    load();

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* ------------------------------ Trang thư viện ------------------------------ */

function renderCards(body, ctx, data) {
  clear(body);
  if (data.demo) body.appendChild(createDemoBanner());

  const breadcrumb = h("nav", { class: "fb-breadcrumb", "aria-label": "Vị trí trang" });
  breadcrumb.appendChild(h("a", { class: "fb-breadcrumb__link", href: "#/home" }, "Trang chủ"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__sep", "aria-hidden": "true" }, "›"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__current" }, "Thư viện thẻ cảm xúc"));
  body.appendChild(breadcrumb);

  // ---- Header (w10) — KHÔNG tiền tố nội bộ "W10 •" ----
  const header = h("header", { class: "fb-sec" });
  header.appendChild(
    h("div", { class: "fb-sec__row" },
      h("span", { class: "fb-journey__kicker" }, "Không gian an toàn • Tôn trọng mọi xúc cảm"),
    ),
  );
  header.appendChild(h("h1", { class: "fb-sec__greeting" }, "Thư viện thẻ cảm xúc mở lời"));
  header.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Những mẫu câu và thẻ chạm giúp bạn diễn đạt những điều khó cất thành lời một cách "
      + "nhẹ nhàng, an toàn. Ở đây không có cảm xúc đúng hay sai — mọi trạng thái của bạn "
      + "đều xứng đáng được lắng nghe.",
    ),
  );
  body.appendChild(header);

  // ---- Dải cam kết riêng tư (verbatim theo yêu cầu + Stitch w10) ----
  const guidance = h("div", { class: "fb-cards-guidance" });
  guidance.appendChild(
    h("div", { class: "fb-cards-guidance__text" },
      createIcon({ name: "verified_user", size: 18, className: "fb-stitch-primary-icon" }),
      h("p", {},
        h("strong", {}, "Cam kết riêng tư: "),
        "Mọi lời nhắn chỉ được gửi khi bạn đã duyệt và xác nhận gửi ở bước cuối cùng. "
        + "Không ai có thể xem bản nháp này.",
      ),
    ),
  );
  guidance.appendChild(
    h("span", { class: "fb-chip fb-chip--high" },
      createIcon({ name: "lock", size: 14 }),
      h("span", {}, "Chỉ mình tôi thấy"),
    ),
  );
  body.appendChild(guidance);

  // ---- Filter pills: "Tất cả" + nhóm từ dữ liệu thật ----
  const pills = h("div", { class: "fb-cards-pills", role: "group", "aria-label": "Lọc thẻ theo nhóm" });
  pills.appendChild(renderGroupPill(null, "Tất cả", data.group, data.setGroup));
  for (const code of pillCodes(data.cards)) {
    pills.appendChild(renderGroupPill(code, groupLabel(code), data.group, data.setGroup));
  }
  body.appendChild(pills);

  // ---- Counter từ cửa sổ ĐÃ TẢI (không bịa) ----
  const count = h("p", { class: "fb-sec__sub", role: "status" },
    `${data.cards.length} thẻ`,
    data.truncated
      ? ` (danh sách bị máy chủ giới hạn ở cửa sổ ${data.maxWindow || "50"} mục)`
      : "",
  );
  body.appendChild(count);

  if (!data.cards.length) {
    // Empty state trung thực theo nhóm đang lọc.
    body.appendChild(
      createEmptyState({
        title: data.group
          ? `Chưa có thẻ nào trong nhóm “${groupLabel(data.group)}”`
          : "Thư viện chưa có thẻ nào được xuất bản",
        description: data.group
          ? "Nhóm này hiện chưa có mẫu thẻ từ máy chủ. Bạn có thể chọn nhóm khác hoặc tự viết lời nhắn."
          : "Máy chủ chưa xuất bản thẻ nào (catalog chỉ trả thẻ đã duyệt). Bạn vẫn có thể soạn lời nhắn của riêng mình.",
        action: { label: "Tự viết lời nhắn", onClick: () => ctx.navigate("/compose") },
      }),
    );
    return;
  }

  // ---- Lưới thẻ: title + body + chip nhóm ----
  const grid = h("div", { class: "fb-cards-grid" });
  data.cards.forEach((card) => {
    grid.appendChild(renderCardTile(card, ctx, data));
  });
  body.appendChild(grid);

  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Không tìm thấy mẫu phù hợp? Bạn hoàn toàn có thể bỏ qua thư viện và tự viết những dòng "
      + "tâm sự theo cách chân thực nhất của riêng mình ở trang soạn thư.",
    ),
  );
}

/** Mã nhóm cho pills: mã có nhãn trong repo trước, sau đó là mã xuất hiện trong dữ liệu. */
function pillCodes(cards) {
  const seen = [];
  for (const code of Object.keys(GROUP_LABELS)) {
    if (cards.some((card) => card && card.group_code === code)) seen.push(code);
  }
  for (const card of cards) {
    const code = card && card.group_code ? String(card.group_code) : "";
    if (code && !GROUP_LABELS[code] && !seen.includes(code)) seen.push(code);
  }
  return seen;
}

function renderGroupPill(code, label, activeCode, setGroup) {
  const isActive = (activeCode || null) === (code || null);
  const pill = h("button", {
    class: `fb-cards-pill${isActive ? " fb-cards-pill--active" : ""}`,
    type: "button",
    "aria-pressed": isActive ? "true" : "false",
    ...(code ? { dataset: { group: code } } : {}),
    onclick: () => setGroup(code || null),
  }, label);
  return pill;
}

function renderCardTile(card, ctx, data) {
  const tile = h("button", {
    class: "fb-cards-tile",
    type: "button",
    dataset: { cardId: String(card.card_id || ""), group: String(card.group_code || "") },
    onclick: () => openSendSheet(ctx, card, data),
  });
  const head = h("div", { class: "fb-cards-tile__head" });
  head.appendChild(
    h("span", { class: "fb-cards-tile__icon", "aria-hidden": "true" },
      createIcon({ name: "style", size: 20 }),
    ),
  );
  head.appendChild(h("h2", { class: "fb-cards-tile__title" }, String(card.title || "")));
  tile.appendChild(head);
  tile.appendChild(
    h("p", { class: "fb-cards-tile__body" }, `“${String(card.body || "")}”`),
  );
  const foot = h("div", { class: "fb-cards-tile__foot" });
  foot.appendChild(
    h("span", { class: "fb-chip" }, groupLabel(card.group_code)),
  );
  foot.appendChild(
    h("span", { class: "fb-cards-tile__cta" },
      "Chọn mẫu này",
      createIcon({ name: "arrow_forward", size: 16 }),
    ),
  );
  tile.appendChild(foot);
  return tile;
}

/* ------------------------- Sheet: xem trước + gửi ------------------------- */

function recipientName(connection) {
  const name = connection
    && connection.counterpart
    && connection.counterpart.display_name;
  if (name) return String(name);
  if (connection && connection.relationship_kind === "backup") {
    return "Người hỗ trợ dự phòng";
  }
  return "Người đồng hành";
}

function openSendSheet(ctx, card, data) {
  const activeConnections = data.connections.filter(
    (connection) => connection && connection.status === "active",
  );
  const preview = { recipientId: null, name: "", done: false };
  const sendKey = { value: null };
  const errorBox = h("div", { role: "alert" });
  const previewBox = h("div", { class: "fb-cards-sheet__preview", hidden: true });

  const selectId = "fb-cards-recipient";
  const select = h("select", {
    class: "fb-input",
    id: selectId,
    onchange: () => {
      preview.recipientId = select.value || null;
      const found = activeConnections.find(
        (connection) => (connection.other_party_id || connection.connection_id) === select.value,
      );
      preview.name = found ? recipientName(found) : "";
      refreshPreviewButton();
    },
  });
  select.appendChild(h("option", { value: "" }, "Chọn người nhận…"));
  activeConnections.forEach((connection) => {
    const value = connection.other_party_id || connection.connection_id;
    select.appendChild(
      h("option", { value }, recipientName(connection)),
    );
  });

  const noteId = "fb-cards-note";
  const noteCounter = h("span", { class: "fb-sec__sub", id: "fb-cards-note-counter" },
    `0/${NOTE_MAX} ký tự`);
  const note = h("textarea", {
    class: "fb-textarea",
    id: noteId,
    rows: "3",
    maxlength: String(NOTE_MAX),
    placeholder: "Ghi chú của bạn cho thẻ (không bắt buộc)…",
    "aria-describedby": "fb-cards-note-counter",
  });
  note.addEventListener("input", () => {
    noteCounter.textContent = `${note.value.length}/${NOTE_MAX} ký tự`;
  });

  const previewBtn = h("button", {
    class: "fb-btn fb-btn--primary",
    type: "button",
    disabled: true,
    onclick: () => onPreview(),
  }, "Xem trước");

  function refreshPreviewButton() {
    previewBtn.disabled = !preview.recipientId;
  }

  const content = h("div", { class: "fb-cards-sheet" },
    h("p", { class: "fb-sec__sub" },
      `Thẻ: “${String(card.title || "")}” (nhóm ${groupLabel(card.group_code)})`,
    ),
    h("div", { class: "fb-compose__preview-body" }, String(card.body || "")),
    h("div", { class: "fb-field" },
      h("label", { class: "fb-field__label", for: selectId }, "Gửi đến"),
      select,
      activeConnections.length
        ? h("p", { class: "fb-field__hint" },
          "Chỉ người trong kết nối hai phía đang hoạt động mới nhận được thẻ.")
        : h("p", { class: "fb-field__hint" },
          "Chưa có kết nối đang hoạt động — hãy kết nối với người đồng hành trước."),
    ),
    h("div", { class: "fb-field" },
      h("label", { class: "fb-field__label", for: noteId }, "Lời nhắn của bạn kèm thẻ (không bắt buộc)"),
      note,
      noteCounter,
    ),
    previewBtn,
    previewBox,
    errorBox,
  );

  function describeSendError(error) {
    if (error && error.kind === "timeout") {
      return "Kết nối quá thời gian chờ. KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận thẻ. "
        + "Kiểm tra hộp thư của người nhận trước khi thử lại — không gửi lại ngay.";
    }
    return "KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận thẻ. "
      + "Kiểm tra hộp thư của người nhận trước khi thử lại — không gửi lại ngay.";
  }

  /** Bước 1: previewCard (binding chính xác card+version+recipient, KHÔNG gửi). */
  function onPreview() {
    clear(errorBox);
    previewBtn.disabled = true;
    previewBtn.textContent = "Đang lấy bản xem trước…";
    Promise.resolve()
      .then(() => ctx.adapter.previewCard({
        cardId: card.card_id,
        version: card.version,
        recipientId: preview.recipientId,
      }))
      .then(() => {
        preview.done = true;
        clear(previewBox);
        previewBox.hidden = false;
        previewBox.appendChild(
          h("div", { class: "fb-cards-sheet__confirm" },
            h("p", {},
              "Máy chủ đã chốt bản xem trước với thẻ và người nhận này — gửi sẽ dùng đúng bản này."),
            h("p", { class: "fb-cards-sheet__ask" },
              `Gửi tới ${preview.name || "người nhận"}?`),
            h("div", { class: "fb-compose__pause-buttons" },
              createButton({
                label: "Gửi thẻ",
                variant: "primary",
                onClick: () => onSend(),
              }),
              createButton({
                label: "Chưa gửi lúc này",
                variant: "ghost",
                onClick: () => sheet.remove(),
              }),
            ),
          ),
        );
        previewBtn.disabled = false;
        previewBtn.textContent = "Xem trước";
      })
      .catch((error) => {
        previewBtn.disabled = false;
        previewBtn.textContent = "Xem trước";
        clear(errorBox);
        errorBox.appendChild(
          h("p", { class: "fb-compose__sheet-error", role: "alert" },
            error && error.code === "preview_stale"
              ? "Phiên bản thẻ vừa thay đổi trên máy chủ — hãy mở lại thẻ và xem trước lần nữa."
              : (error && error.kind === "timeout"
                ? "Kết nối quá thời gian chờ. Chưa lấy được bản xem trước — chưa có gì được gửi."
                : "Chưa lấy được bản xem trước. Vui lòng thử lại sau."),
          ),
        );
      });
  }

  /** Bước CUỐI: người dùng bấm xác nhận → sendCard với key mới. */
  function onSend() {
    clear(errorBox);
    const key = newIdemKey();
    sendKey.value = key;
    Promise.resolve()
      .then(() => ctx.adapter.sendCard({
        cardId: card.card_id,
        version: card.version,
        recipientId: preview.recipientId,
        authorNote: note.value.trim(),
        key,
      }))
      .then(() => {
        clear(content);
        content.appendChild(
          h("div", { class: "fb-cards-sheet__done" },
            createIcon({ name: "check_circle", size: 28, className: "fb-cards-sheet__done-icon" }),
            h("p", { class: "fb-cards-sheet__done-title" },
              "Thẻ đã được gửi qua xác nhận của bạn"),
            h("p", { class: "fb-sec__sub" },
              "Người nhận sẽ thấy thẻ trong Hộp thư khi mở ứng dụng."),
            h("a", { class: "fb-btn fb-btn--primary", href: "#/mailbox" }, "Mở Hộp thư"),
          ),
        );
      })
      .catch((error) => {
        clear(errorBox);
        const wrap = h("div", {});
        wrap.appendChild(
          h("p", { class: "fb-compose__sheet-error", role: "alert" }, describeSendError(error)),
        );
        wrap.appendChild(
          createButton({
            label: "Kiểm tra trạng thái gửi",
            variant: "ghost",
            onClick: () => onLookup(key, wrap),
          }),
        );
        errorBox.appendChild(wrap);
      });
  }

  /** Tra cứu kết quả lượt gửi qua /operations/{key} — KHÔNG tự gửi lại. */
  function onLookup(key, wrap) {
    Promise.resolve()
      .then(() => ctx.adapter.lookupOperation(key))
      .then((result) => {
        const status = result && result.status;
        const line = status === "sent"
          ? "Máy chủ xác nhận lượt gửi này ĐÃ thành công — không cần gửi lại."
          : `Máy chủ báo trạng thái: ${status || "không rõ"}. Chưa xác nhận được lần gửi — không gửi lại ngay.`;
        wrap.appendChild(h("p", { class: "fb-page__note", role: "status" }, line));
      })
      .catch(() => {
        wrap.appendChild(
          h("p", { class: "fb-page__note", role: "status" },
            "Chưa tra cứu được trạng thái. Vui lòng thử lại sau — không gửi lại ngay."),
        );
      });
  }

  const sheet = createSheet({
    title: "Gửi thẻ cảm xúc",
    content,
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
}
