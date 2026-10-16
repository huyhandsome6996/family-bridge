// Signal — "Con cần được lắng nghe" (w16 Stitch, Web Render Task 2, M4).
// Tham chiếu Stitch: stitch_family_bridge_web_design_system/
//   w16_con_c_n_c_l_ng_nghe/.
//
// Hợp đồng backend f10_signal (worklog Task 19 — FINAL CONTRACT):
//   GET  /api/v1/signals/meta → { needs:[{need,label}] } — 3 nhu cầu allowlist
//        (muon_tro_chuyen | muon_duoc_o_ben | muon_hen_gio; f10/services/signal.py)
//   POST /api/v1/signals/preview {need, recipient_id}
//        → { need, label, body, recipient_id } — body do MÁY CHỦ soạn
//   POST /api/v1/signals/send {need, recipient_id} (+ X-Idempotency-Key)
//        → { message_id, need, state:"sent" } (201)
//   POST /api/v1/signals/{id}/ack (recipient-only) → { ack:true }
//
// Deviation có chủ ý so với mẫu Stitch w16 (ghi trong báo cáo task-3b3):
// - KHÔNG time-picker: API f10 KHÔNG có trường thời gian (DTO chỉ need+recipient).
// - KHÔNG ô "Lời nhắn gửi kèm": payload preview/send dùng reject_unknown_fields
//   (f10/api.py chỉ nhận {need, recipient_id}) — một ô ghi chú không được gửi đi
//   sẽ là tính năng giả; bỏ để trung thực.
// - Banner bỏ "Mã hóa nội bộ • Bảo mật 100%" (bị cấm — chưa chứng minh) →
//   "Riêng tư theo thiết kế • Chỉ hai người trong kết nối".
// - Footer bỏ "Phiên bản giao thức: HS-SYNC-2025" (chuỗi giao thức bịa).
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

// Fallback nhãn tiếng Việt khi meta thiếu/mất nhãn (mã theo f10 NEEDS).
const NEED_FALLBACK_LABELS = {
  muon_tro_chuyen: "Một buổi trò chuyện yên tĩnh",
  muon_duoc_o_ben: "Cần có người ở bên cạnh",
  muon_hen_gio: "Hẹn thời điểm trong tuần",
};

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

function newIdemKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `fb-${Date.now().toString(36)}-`
    + `${Math.random().toString(36).slice(2, 12)}-`
    + `${Math.random().toString(36).slice(2, 12)}`;
}

function needLabel(row) {
  const code = row && row.need ? String(row.need) : "";
  if (row && row.label) return String(row.label);
  return NEED_FALLBACK_LABELS[code] || code || "Nhu cầu";
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

export const page = {
  id: "signal",
  title: "Tín hiệu lắng nghe",
  requiresRole: true,
  requiresAuth: true, // tín hiệu là dữ liệu phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "signal" } });
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
          title: "Cần đăng nhập để phát tín hiệu",
          description:
            "Tín hiệu là dữ liệu của tài khoản bạn. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(createSkeleton({ variant: "line", count: 1 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải tín hiệu…"));

    const currentRun = ++runId;

    if (state.role === "caregiver") {
      Promise.resolve()
        .then(() => ctx.adapter.listMessages({ limit: 20 }))
        .then((pageData) => {
          if (cancelled || currentRun !== runId) return;
          const rows = (pageData && Array.isArray(pageData.results) ? pageData.results : [])
            .filter((row) => row && row.kind === "listening_signal");
          renderCaregiver(body, ctx, { demo, rows, reload: () => rerun(ctx) });
        })
        .catch((error) => {
          if (cancelled || currentRun !== runId) return;
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          renderLoadError(body, error);
        });
      return root;
    }

    // ---- Student view: meta + connections song song ----
    Promise.all([
      Promise.resolve()
        .then(() => ctx.adapter.signalMeta())
        .then((meta) => (meta && Array.isArray(meta.needs) ? meta.needs : []))
        .catch((error) => {
          if (error && error.status === 401) throw error;
          return null; // meta lỗi → dùng fallback nhãn; lỗi khác không chặn trang
        }),
      Promise.resolve()
        .then(() => ctx.adapter.listConnections({ limit: 20 }))
        .then((pageData) => (pageData && Array.isArray(pageData.results) ? pageData.results : [])),
    ])
      .then(([metaNeeds, connections]) => {
        if (cancelled || currentRun !== runId) return;
        renderStudent(body, ctx, { demo, metaNeeds, connections });
      })
      .catch((error) => {
        if (cancelled || currentRun !== runId) return;
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        renderLoadError(body, error);
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

function rerun(ctx) {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function renderLoadError(body, error) {
  clear(body);
  body.appendChild(
    createErrorState({
      title: "Không tải được màn tín hiệu",
      description: error && error.kind === "timeout"
        ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
        : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      retryLabel: "Thử lại",
      onRetry: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
}

/* -------------- Khối chung: banner riêng tư + lưu ý an toàn -------------- */

function appendSharedBlocks(body) {
  // Banner riêng tư — KHÔNG "Mã hóa", KHÔNG "Bảo mật 100%" (chưa chứng minh;
  // bản trung thực dùng "Riêng tư theo thiết kế").
  body.appendChild(
    h("div", { class: "fb-signal-banner", role: "note" },
      createIcon({ name: "verified_user", size: 18, className: "fb-stitch-primary-icon" }),
      h("span", {}, "Riêng tư theo thiết kế • Chỉ hai người trong kết nối"),
    ),
  );

  // Lưu ý an toàn (w16, bỏ trỏ hotline bịa — dẫn về trang Trợ giúp đã xác minh).
  const safety = h("div", { class: "fb-signal-safety" });
  safety.appendChild(
    h("div", { class: "fb-signal-safety__row" },
      createIcon({ name: "info", size: 18, className: "fb-stitch-primary-icon" }),
      h("p", {},
        h("strong", {}, "Lưu ý an toàn: "),
        "Đây là nhịp cầu giao tiếp đời sống gia đình. Nếu bạn đang đối mặt với khủng hoảng "
        + "tâm lý nghiêm trọng, sự an toàn bị đe dọa hoặc tình huống quá tải, hãy chọn mục ",
        h("a", { href: "#/help" }, "Tìm trợ giúp khẩn cấp"),
        " ngay lập tức.",
      ),
    ),
  );
  body.appendChild(safety);
}

/** Footer niềm tin (w16, bản trung thực — giữ "Không hứa trực 24/7"). */
function appendTrustFooter(body) {
  const trust = h("div", { class: "fb-signal-trust" });
  [
    {
      icon: "spa",
      title: "Tôn trọng nhịp sống",
      text: "Không hứa trực 24/7 và hệ thống không can thiệp vào nhịp sống tự nhiên của gia đình.",
    },
    {
      icon: "shield",
      title: "Bảo mật học đường",
      text: "Tín hiệu không bao giờ chuyển cho nhà trường, giáo viên hay người thứ ba.",
    },
    {
      icon: "drafts",
      title: "Lưu trữ hộp thư",
      text: "Nếu người chăm sóc đang bận việc, tín hiệu vẫn lưu trong Hộp thư để kết nối sau.",
    },
  ].forEach(({ icon, title, text }) => {
    trust.appendChild(
      h("div", { class: "fb-signal-trust__row" },
        createIcon({ name: icon, size: 18, className: "fb-stitch-primary-icon" }),
        h("p", {}, h("strong", {}, `${title}: `), text),
      ),
    );
  });
  body.appendChild(trust);
}

function appendBreadcrumb(body, current) {
  const breadcrumb = h("nav", { class: "fb-breadcrumb", "aria-label": "Vị trí trang" });
  breadcrumb.appendChild(h("a", { class: "fb-breadcrumb__link", href: "#/home" }, "Trang chủ"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__sep", "aria-hidden": "true" }, "›"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__current" }, current));
  body.appendChild(breadcrumb);
}

/* ------------------------------ Student view ------------------------------ */

function renderStudent(body, ctx, { demo, metaNeeds, connections }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());
  appendBreadcrumb(body, "Phát tín hiệu kết nối");

  body.appendChild(
    h("header", { class: "fb-sec" },
      h("div", { class: "fb-sec__row" },
        h("span", { class: "fb-journey__kicker" }, "Không gian kết nối"),
      ),
      h("h1", { class: "fb-sec__greeting" }, "Con cần được lắng nghe"),
      h("p", { class: "fb-sec__sub" },
        "Một tín hiệu ấm áp gửi ngay khi bạn mong muốn có một khoảng thời gian trò chuyện "
        + "thực tế — không cần nói dông dài hay giải thích trước.",
      ),
    ),
  );

  appendSharedBlocks(body);

  const activeConnections = connections.filter(
    (connection) => connection && connection.status === "active",
  );

  if (!activeConnections.length) {
    body.appendChild(
      createEmptyState({
        title: "Kết nối với người đồng hành trước",
        description:
          "Tín hiệu chỉ gửi được cho người trong kết nối hai phía đang hoạt động. "
          + "Hãy mở mục Người đồng hành để kết nối hoặc chờ phía kia xác nhận.",
        action: { label: "Đến trang Kết nối", onClick: () => ctx.navigate("/connect") },
      }),
    );
    return;
  }

  const primary = activeConnections.find(
    (connection) => connection.relationship_kind === "primary",
  ) || activeConnections[0];
  const recipientId = primary.other_party_id || primary.connection_id;
  const recipientName = primary.counterpart && primary.counterpart.display_name
    ? String(primary.counterpart.display_name)
    : "Người đồng hành";

  // ---- Người nhận (từ dữ liệu thật) ----
  const recipientCard = h("section", { class: "fb-scard fb-signal-recipient" });
  recipientCard.appendChild(
    h("div", { class: "fb-sec__row" },
      h("div", { class: "fb-signal-recipient__who" },
        h("span", { class: "fb-pairing__avatar", "aria-hidden": "true" },
          createIcon({ name: "family_restroom", size: 22 })),
        h("div", {},
          h("span", { class: "fb-sec__sub" }, "Người nhận tín hiệu"),
          h("span", { class: "fb-signal-recipient__name" }, recipientName),
        ),
      ),
      h("span", { class: "fb-chip fb-chip--low" },
        createIcon({ name: "check_circle", size: 14 }),
        h("span", {}, "Đã kết nối"),
      ),
    ),
  );
  body.appendChild(recipientCard);

  // ---- 3 nhu cầu từ meta (fallback nhãn tiếng Việt) ----
  const needs = metaNeeds && metaNeeds.length
    ? metaNeeds
    : Object.keys(NEED_FALLBACK_LABELS).map((need) => ({ need }));
  const state = {
    need: null,
    previewed: false,
    sending: false,
    recipientId,
  };

  const needsCard = h("section", { class: "fb-scard" });
  needsCard.appendChild(
    h("h2", { class: "fb-scard__title" }, "Nhu cầu hiện tại của bạn là gì?"),
  );
  needsCard.appendChild(h("p", { class: "fb-sec__sub" }, "Chọn một nhu cầu — nội dung tín hiệu do máy chủ soạn sẵn."));
  const needsList = h("div", { class: "fb-signal-needs", role: "group", "aria-label": "Chọn nhu cầu" });
  const needButtons = new Map();
  needs.forEach((row) => {
    const code = row && row.need ? String(row.need) : "";
    if (!code) return;
    const btn = h("button", {
      class: "fb-signal-need",
      type: "button",
      "aria-pressed": "false",
      dataset: { need: code },
      onclick: () => {
        state.need = code;
        state.previewed = false;
        needButtons.forEach((other, otherCode) => {
          other.classList.toggle("fb-signal-need--selected", otherCode === code);
          other.setAttribute("aria-pressed", otherCode === code ? "true" : "false");
        });
        refreshActions();
        renderPreviewPlaceholder();
      },
    });
    btn.appendChild(
      h("span", { class: "fb-signal-need__icon", "aria-hidden": "true" },
        createIcon({ name: "hearing", size: 20 })),
    );
    btn.appendChild(
      h("span", { class: "fb-signal-need__label" }, needLabel(row)),
    );
    needButtons.set(code, btn);
    needsList.appendChild(btn);
  });
  needsCard.appendChild(needsList);
  body.appendChild(needsCard);

  // ---- Preview (chỉ văn bản do máy chủ render) ----
  const previewCard = h("section", { class: "fb-scard" });
  previewCard.appendChild(
    h("h2", { class: "fb-scard__title" }, "Xem trước thông điệp người chăm sóc sẽ nhận:"),
  );
  const previewBody = h("div", { class: "fb-signal-preview", role: "status" });
  previewCard.appendChild(previewBody);
  body.appendChild(previewCard);

  // ---- Hành động ----
  const actions = h("div", { class: "fb-signal-actions" });
  const previewBtn = h("button", {
    class: "fb-btn fb-btn--neutral fb-signal-preview-btn",
    type: "button",
    disabled: true,
    onclick: () => guarded("preview", () => onPreview()),
  }, "Xem trước tín hiệu");
  actions.appendChild(previewBtn);

  const sendBtn = h("button", {
    class: "fb-btn fb-btn--primary fb-signal-send-btn",
    type: "button",
    disabled: true,
    onclick: () => guarded("send", () => onSend()),
  }, "Phát tín hiệu kết nối ngay");
  actions.appendChild(sendBtn);
  body.appendChild(actions);

  const statusNote = h("p", { class: "fb-page__note", role: "status" }, "");
  body.appendChild(statusNote);

  appendTrustFooter(body);

  const guardedBusy = new Set();
  function guarded(key, fn) {
    if (guardedBusy.has(key)) return;
    guardedBusy.add(key);
    Promise.resolve()
      .then(fn)
      .finally(() => guardedBusy.delete(key));
  }

  function renderPreviewPlaceholder() {
    clear(previewBody);
    previewBody.appendChild(
      h("p", { class: "fb-sec__sub" },
        state.need
          ? "Chọn “Xem trước tín hiệu” — nội dung do máy chủ soạn theo nhu cầu bạn chọn."
          : "Chọn một nhu cầu ở trên rồi xem trước — nội dung do máy chủ soạn, bạn không phải viết gì thêm."),
    );
  }

  function refreshActions() {
    previewBtn.disabled = !state.need;
    sendBtn.disabled = !(state.need && state.previewed && !state.sending);
    sendBtn.title = state.previewed
      ? ""
      : "Cần xem trước tín hiệu trước khi phát (bước xác nhận cuối vẫn là nút này).";
  }

  function onPreview() {
    if (!state.need) return;
    clear(previewBody);
    previewBody.appendChild(h("p", { class: "fb-sec__sub" }, "Đang lấy bản xem trước từ máy chủ…"));
    Promise.resolve()
      .then(() => ctx.adapter.signalPreview({ need: state.need, recipientId: state.recipientId }))
      .then((preview) => {
        state.previewed = true;
        clear(previewBody);
        previewBody.appendChild(
          h("blockquote", { class: "fb-signal-preview__text" },
            `“${String((preview && preview.body) || "")}”`,
          ),
        );
        previewBody.appendChild(
          h("p", { class: "fb-sec__sub" },
            "Nội dung do máy chủ soạn theo nhu cầu đã chọn — không thể sửa nội dung, chỉ chọn nhu cầu."),
        );
        refreshActions();
      })
      .catch((error) => {
        state.previewed = false;
        clear(previewBody);
        previewBody.appendChild(
          h("p", { class: "fb-page__note", role: "alert" },
            error && error.kind === "timeout"
              ? "Kết nối quá thời gian chờ. Chưa lấy được bản xem trước — chưa có gì được gửi."
              : "Chưa lấy được bản xem trước. Vui lòng thử lại sau."),
        );
        refreshActions();
      });
  }

  function onSend() {
    if (!(state.need && state.previewed)) return;
    state.sending = true;
    refreshActions();
    statusNote.textContent = "Đang phát tín hiệu qua xác nhận của bạn…";
    const key = newIdemKey();
    Promise.resolve()
      .then(() => ctx.adapter.signalSend({
        need: state.need,
        recipientId: state.recipientId,
        key,
      }))
      .then(() => {
        clear(body);
        if (demo) body.appendChild(createDemoBanner());
        body.appendChild(
          h("section", { class: "fb-scard fb-signal-done" },
            createIcon({ name: "check_circle", size: 30, className: "fb-signal-done__icon" }),
            h("h2", { class: "fb-scard__title" }, "Tín hiệu đã được phát qua xác nhận của bạn"),
            h("p", { class: "fb-sec__sub" },
              "Người chăm sóc sẽ thấy tín hiệu trong Hộp thư. Không có gì được gửi thêm nếu bạn không bấm."),
            h("a", { class: "fb-btn fb-btn--primary", href: "#/mailbox" }, "Mở Hộp thư"),
            h("div", { class: "fb-compose__pause-buttons" },
              createButton({
                label: "Phát tín hiệu khác",
                variant: "ghost",
                onClick: () => rerun(ctx),
              }),
            ),
          ),
        );
        appendTrustFooter(body);
      })
      .catch(() => {
        state.sending = false;
        refreshActions();
        statusNote.textContent =
          "KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận tín hiệu. Kiểm tra Hộp thư trước khi thử lại — không gửi lại ngay.";
        const lookupWrap = h("div", { class: "fb-signal-lookup" });
        lookupWrap.appendChild(
          createButton({
            label: "Kiểm tra trạng thái gửi",
            variant: "ghost",
            onClick: () => onLookup(key, lookupWrap),
          }),
        );
        const existing = body.querySelector(".fb-signal-lookup");
        if (existing) existing.remove();
        body.insertBefore(lookupWrap, statusNote.nextSibling);
      });
  }

  function onLookup(key, wrap) {
    Promise.resolve()
      .then(() => ctx.adapter.lookupOperation(key))
      .then((result) => {
        const status = result && result.status;
        wrap.appendChild(h("p", { class: "fb-page__note", role: "status" },
          status === "sent"
            ? "Máy chủ xác nhận lượt phát này ĐÃ thành công — không cần phát lại."
            : `Máy chủ báo trạng thái: ${status || "không rõ"}. Chưa xác nhận được — không phát lại ngay.`));
      })
      .catch(() => {
        wrap.appendChild(h("p", { class: "fb-page__note", role: "status" },
          "Chưa tra cứu được trạng thái. Vui lòng thử lại sau — không phát lại ngay."));
      });
  }

  renderPreviewPlaceholder();
  refreshActions();
}

/* ----------------------------- Caregiver view ----------------------------- */

function renderCaregiver(body, ctx, { demo, rows, reload }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());
  appendBreadcrumb(body, "Tín hiệu lắng nghe");

  body.appendChild(
    h("header", { class: "fb-sec" },
      h("div", { class: "fb-sec__row" },
        h("span", { class: "fb-journey__kicker" }, "Không gian kết nối"),
      ),
      h("h1", { class: "fb-sec__greeting" }, "Tín hiệu lắng nghe"),
      h("p", { class: "fb-sec__sub" },
        "Các tín hiệu “Con cần được lắng nghe” từ học sinh trong kết nối của bạn.",
      ),
    ),
  );

  appendSharedBlocks(body);

  if (!rows.length) {
    body.appendChild(
      createEmptyState({
        title: "Chưa có tín hiệu nào",
        description:
          "Khi học sinh phát tín hiệu, nó sẽ hiện tại đây và trong Hộp thư. "
          + "Không có gì được gửi tự động thay các em.",
      }),
    );
    appendTrustFooter(body);
    return;
  }

  const list = h("section", { class: "fb-scard" });
  list.appendChild(h("h2", { class: "fb-scard__title" }, "Tín hiệu đã nhận"));
  rows.forEach((row) => {
    const itemId = String(row.message_id || "");
    const rowEl = h("div", { class: "fb-signal-row", dataset: { messageId: itemId } });
    const who = h("div", { class: "fb-signal-row__info" });
    who.appendChild(
      h("span", { class: "fb-signal-row__icon", "aria-hidden": "true" },
        createIcon({ name: "hearing", size: 20 })),
    );
    const text = h("div", { class: "fb-signal-row__text" });
    // listMessages chỉ trả metadata (KHÔNG body) → hiện title thật từ máy chủ.
    text.appendChild(
      h("span", { class: "fb-signal-row__title" },
        String(row.title || "Tín hiệu lắng nghe")),
    );
    const time = timeLabel(row.created_at);
    if (time) text.appendChild(h("span", { class: "fb-sec__sub" }, time));
    who.appendChild(text);
    rowEl.appendChild(who);

    const actions = h("div", { class: "fb-signal-row__actions" });
    const ackBtn = createButton({
      label: "Đã nhận tín hiệu",
      variant: "primary",
      onClick: () => {
        ackBtn.disabled = true;
        Promise.resolve()
          .then(() => ctx.adapter.signalAck(itemId))
          .then(() => {
            rowEl.classList.add("fb-signal-row--acked");
            statusNote.textContent = "Bạn đã xác nhận nhận được tín hiệu — học sinh không nhận thông báo tự động.";
            reload();
          })
          .catch(() => {
            ackBtn.disabled = false;
            statusNote.textContent = "Chưa xác nhận được. Vui lòng thử lại.";
          });
      },
    });
    actions.appendChild(ackBtn);
    actions.appendChild(
      h("a", { class: "fb-btn fb-btn--ghost", href: `#/messages/${encodeURIComponent(itemId)}` },
        "Mở thư",
      ),
    );
    rowEl.appendChild(actions);
    list.appendChild(rowEl);
  });
  body.appendChild(list);

  const statusNote = h("p", { class: "fb-page__note", role: "status" }, "");
  body.appendChild(statusNote);

  appendTrustFooter(body);
}
