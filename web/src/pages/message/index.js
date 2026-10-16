// Chi tiết tin nhắn + phản hồi (w15 — Web Render Task 2, M5a).
// Route pattern: /messages/:id (router M1). Dữ liệu thật qua adapter F05:
//
//   GET  /api/v1/messages/{id} → list_view + body + connection_generation
//   POST /api/v1/messages/{id}/read → { read: true } — recipient-only;
//        CHỈ gọi khi direction === "received" && !read (worklog Task 19).
//   POST /api/v1/messages {kind, recipient_id, body, title, reply_to}
//        (+X-Idempotency-Key) — f05 MESSAGE_KINDS = text | emotion_card |
//        journal_reply | mood_reply | listening_signal | quick_reply.
//        KHÔNG có kind "reply" → thư trả lời gửi bằng kind "text" + reply_to.
//   GET  /api/v1/messages/quick-replies?audience → gợi ý; máy chủ có thể trả
//        {results:[], note:"library_not_configured"} → ẩn chip trung thực.
//
// Quy tắc trung thực (DSA + QA):
// - Gửi luôn qua xác nhận người dùng (nút "Gửi phản hồi") — không tự gửi,
//   không tự retry; key idempotency tạo TẠI NÚT BẤM (crypto.randomUUID).
// - Kết quả không rõ ràng → "KẾT QUẢ CHƯA XÁC ĐỊNH" + tra cứu
//   /operations/{key} (lookupOperation) — không gửi lại bằng key mới.
// - KHÔNG hiển thị trạng thái xem của người nhận (không có tính năng đó).
// - KHÔNG nháp tự động giả; AI (F04) chỉ là gợi ý điền VÀO TEXTAREA.
// - Body render bằng textContent (SEC-12) — bong bóng căn theo direction.
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

const BODY_MAX = 4000; // ràng buộc backend (f05 validate_text max_len)

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/** Khóa idempotency cho lượt gửi — client tạo TẠI nút xác nhận. */
function newIdemKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `fb-${Date.now().toString(36)}-`
    + `${Math.random().toString(36).slice(2, 12)}-`
    + `${Math.random().toString(36).slice(2, 12)}`;
}

/** Nhãn thời gian đầy đủ (vi-VN) theo dữ liệu máy chủ. */
function timeLabelFull(iso) {
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
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

const KIND_LABELS = {
  text: "Lời nhắn",
  emotion_card: "Thẻ cảm xúc",
  listening_signal: "Tín hiệu kết nối",
  journal_reply: "Lời hồi âm",
  mood_reply: "Lời hồi âm",
  quick_reply: "Lời hồi âm",
};

function describeError(error, fallback) {
  if (error && error.kind === "timeout") {
    return `Kết nối quá thời gian chờ. ${fallback}`;
  }
  if (error && error.kind === "stale_session") {
    return "Phiên đã thay đổi trong lúc thực hiện. Kiểm tra trạng thái mới nhất trước khi thử lại.";
  }
  return fallback;
}

export const page = {
  id: "message",
  title: "Chi tiết tin nhắn",
  requiresRole: true,
  requiresAuth: true, // nội dung thư là dữ liệu phiên lớp học (router M1)
  showBottomNav: false,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "message" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
    };

    const messageId = ctx.params ? ctx.params.get("id") : null;
    if (!messageId) {
      body.appendChild(
        createEmptyState({
          title: "Không có thư được chọn",
          description: "Hãy mở một thư từ Hộp thư để đọc nội dung và phản hồi.",
          action: { label: "Quay lại Hộp thư", onClick: () => ctx.navigate("/mailbox") },
        }),
      );
      return root;
    }

    const state = readState(ctx.store);
    const demo = Boolean(state.demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để đọc thư",
          description:
            "Nội dung thư là dữ liệu riêng giữa hai bên trong kết nối. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());
    body.appendChild(
      h("a", { class: "fb-breadcrumb__link", href: "#/mailbox" }, "← Quay lại Hộp thư"),
    );
    body.appendChild(createSkeleton({ variant: "line", count: 2 }));
    body.appendChild(h("p", { role: "status" }, "Đang tải thư…"));

    const currentRun = ++runId;

    // Tên người đối diện lấy từ kết nối thật; lỗi tên không chặn nội dung thư.
    Promise.all([
      Promise.resolve().then(() => ctx.adapter.getMessage(messageId)),
      Promise.resolve()
        .then(() => ctx.adapter.listConnections({ limit: 20 }))
        .catch(() => null),
    ])
      .then(([thread, connectionsPage]) => {
        if (cancelled || currentRun !== runId) return;
        const namesById = new Map();
        const connections = (connectionsPage && Array.isArray(connectionsPage.results))
          ? connectionsPage.results
          : [];
        connections.forEach((connection) => {
          if (!connection) return;
          const id = connection.other_party_id
            || (connection.counterpart && connection.counterpart.user_id)
            || null;
          const name = connection.counterpart && connection.counterpart.display_name;
          if (id && name) namesById.set(String(id), String(name));
        });
        renderThread(body, ctx, {
          demo,
          thread,
          namesById,
          role: state.role || null,
          stale: () => cancelled || currentRun !== runId,
        });

        // Đồng bộ trạng thái qua markRead: CHỈ thư nhận và CHỈ khi dữ liệu
        // máy chủ báo chưa mở — im lặng, không chặn giao diện; thao tác
        // recipient-only, idempotent theo hợp đồng f05.
        if (thread && thread.direction === "received" && !thread.read) {
          Promise.resolve()
            .then(() => ctx.adapter.markMessageRead(String(thread.message_id || messageId)))
            .catch(() => { /* không hiện lỗi — đọc thư không bao giờ bị chặn */ });
        }
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

function renderLoadError(body, error) {
  clear(body);
  body.appendChild(
    h("a", { class: "fb-breadcrumb__link", href: "#/mailbox" }, "← Quay lại Hộp thư"),
  );
  body.appendChild(
    createErrorState({
      title: "Không tải được thư",
      description: describeError(
        error,
        "Máy chủ chưa phản hồi (lần khởi động đầu có thể mất tới một phút). Thử lại sau ít phút.",
      ),
      retryLabel: "Thử lại",
      onRetry: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    }),
  );
}

/* ------------------------------ Màn chi tiết (w15) ------------------------------ */

function renderThread(body, ctx, { demo, thread, namesById, role, stale }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());

  body.appendChild(
    h("a", { class: "fb-breadcrumb__link", href: "#/mailbox" }, "← Quay lại Hộp thư"),
  );

  const messageId = String((thread && thread.message_id) || "");
  const direction = thread && thread.direction === "sent" ? "sent" : "received";
  const counterpartyId = String((thread && thread.counterparty_id) || "");
  const counterpartyName = (counterpartyId && namesById.get(counterpartyId))
    || "Thành viên Family Bridge";
  const kindLabel = KIND_LABELS[String((thread && thread.kind) || "")] || "Thư";

  // ---- Đầu thư: tiêu đề + thông tin thật từ máy chủ ----
  const head = h("header", { class: "fb-sec" });
  head.appendChild(
    h("div", { class: "fb-sec__row" },
      h("span", { class: "fb-journey__kicker" }, kindLabel),
    ),
  );
  head.appendChild(h("h1", { class: "fb-sec__greeting" }, String((thread && thread.title) || "(Không có tiêu đề)")));
  head.appendChild(
    h("p", { class: "fb-sec__sub" },
      `${direction === "sent" ? "Thư bạn gửi tới" : "Thư bạn nhận từ"} ${counterpartyName}`),
  );
  const time = timeLabelFull(thread && thread.created_at);
  if (time) head.appendChild(h("p", { class: "fb-sec__sub" }, `Thời điểm: ${time}`));
  if (thread && thread.reply_to) {
    head.appendChild(h("p", { class: "fb-sec__sub" }, "Là lời hồi âm cho một thư khác trong hộp thư."));
  }
  body.appendChild(head);

  // ---- Nội dung thư: một bong bóng căn theo hướng gửi/nhận (textContent) ----
  const threadCard = h("section", { class: "fb-scard fb-msg-thread" });
  const bubble = h("div", {
    class: `fb-msg-bubble ${direction === "sent" ? "fb-msg-bubble--sent" : "fb-msg-bubble--received"}`,
  });
  bubble.appendChild(
    h("span", { class: "fb-msg-bubble__who" },
      direction === "sent" ? "Bạn" : counterpartyName),
  );
  // Body do máy chủ trả về — render duy nhất qua textContent (SEC-12).
  bubble.appendChild(
    h("p", { class: "fb-msg-bubble__body" }, String((thread && thread.body) || "")),
  );
  threadCard.appendChild(bubble);
  threadCard.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Hệ thống không theo dõi việc xem thư của người nhận — không có xác nhận xem ở hai chiều."),
  );
  body.appendChild(threadCard);

  // ---- Khung phản hồi: gợi ý nhanh + AI (tuỳ) + gửi có xác nhận ----
  const composeCard = h("section", { class: "fb-scard fb-msg-compose" });
  composeCard.appendChild(h("h2", { class: "fb-scard__title" }, "Phản hồi thư này"));
  composeCard.appendChild(
    h("p", { class: "fb-sec__sub" }, "Không áp lực trả lời ngay — bạn hoàn toàn chủ động thời điểm và nội dung."),
  );

  const chipsWrap = h("div", { class: "fb-msg-chips" });
  const chipsNote = h("p", { class: "fb-sec__sub", role: "status" }, "");
  composeCard.appendChild(chipsWrap);
  composeCard.appendChild(chipsNote);

  const textarea = h("textarea", {
    class: "fb-textarea",
    rows: "4",
    maxlength: String(BODY_MAX),
    "aria-label": "Lời phản hồi của bạn (có thể sửa)",
    placeholder: "Viết lời phản hồi của bạn…",
  });
  composeCard.appendChild(textarea);

  const aiSlot = h("div", { class: "fb-msg-ai" });
  composeCard.appendChild(aiSlot);

  const statusNote = h("p", { class: "fb-page__note", role: "status" }, "");
  const sendBtn = createButton({
    label: "Gửi phản hồi",
    variant: "primary",
    onClick: () => onSend(),
  });
  sendBtn.disabled = true; // chỉ bật khi có nội dung — gửi luôn là hành động rõ ràng
  composeCard.appendChild(sendBtn);
  composeCard.appendChild(statusNote);
  body.appendChild(composeCard);

  textarea.addEventListener("input", () => {
    sendBtn.disabled = !textarea.value.trim();
  });

  const sending = { busy: false };

  function onSend() {
    const text = textarea.value.trim();
    if (!text || sending.busy) return;
    sending.busy = true;
    sendBtn.disabled = true;
    statusNote.textContent = "Đang gửi phản hồi…";
    // Key tạo TẠI NÚT BẤM — không tự retry; mất response → tra cứu /operations.
    const key = newIdemKey();
    Promise.resolve()
      .then(() => ctx.adapter.sendMessage({
        kind: "text", // f05 không có kind "reply" — thư trả lời = text + reply_to
        recipientId: counterpartyId,
        body: text,
        replyTo: messageId,
        key,
      }))
      .then(() => {
        statusNote.textContent = "Phản hồi đã rời thiết bị của bạn qua xác nhận gửi.";
        ctx.navigate("/mailbox");
      })
      .catch((error) => {
        sending.busy = false;
        sendBtn.disabled = false;
        statusNote.textContent = "KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận thư. "
          + "Kiểm tra trạng thái gửi trước khi thử lại — không gửi lại ngay. "
          + `(${describeError(error, "Không nhận được xác nhận từ máy chủ.")})`;
        let lookup = composeCard.querySelector(".fb-msg-lookup");
        if (!lookup) {
          lookup = h("div", { class: "fb-msg-lookup" });
          composeCard.insertBefore(lookup, statusNote);
        }
        clear(lookup);
        lookup.appendChild(
          createButton({
            label: "Kiểm tra trạng thái gửi",
            variant: "ghost",
            onClick: () => onLookup(key, lookup),
          }),
        );
      });
  }

  function onLookup(key, wrap) {
    Promise.resolve()
      .then(() => ctx.adapter.lookupOperation(key))
      .then((result) => {
        const status = result && result.status;
        clear(wrap);
        wrap.appendChild(h("p", { class: "fb-page__note", role: "status" },
          status === "sent"
            ? "Máy chủ xác nhận lượt gửi này thành công — không cần gửi lại."
            : `Máy chủ báo trạng thái: ${status || "không rõ"}. Chưa xác nhận được — không gửi lại ngay.`));
      })
      .catch(() => {
        clear(wrap);
        wrap.appendChild(h("p", { class: "fb-page__note", role: "status" },
          "Chưa tra cứu được trạng thái. Vui lòng thử lại sau — không gửi lại ngay."));
      });
  }

  // ---- Gợi ý nhanh: máy chủ trả gì dùng nấy; rỗng/không cấu hình → ẩn trung thực ----
  Promise.resolve()
    .then(() => ctx.adapter.quickReplies(role ? { audience: role } : {}))
    .then((data) => {
      if (stale()) return;
      const results = (data && Array.isArray(data.results)) ? data.results : [];
      if (!results.length) {
        chipsNote.textContent = (data && data.note === "library_not_configured")
          ? "Thư viện lời hồi âm chưa được cấu hình trên máy chủ — bạn vẫn viết phản hồi tự do bên dưới."
          : "Máy chủ chưa có gợi ý nhanh — bạn viết phản hồi tự do bên dưới.";
        return;
      }
      results.slice(0, 6).forEach((item) => {
        const text = item && (item.text || item.body || item.title);
        if (!text) return;
        const chip = h("button", {
          class: "fb-cards-pill",
          type: "button",
          onclick: () => {
            // Gợi ý chỉ ĐIỀN VÀO ô soạn — người dùng sửa rồi tự bấm gửi.
            textarea.value = String(text);
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
          },
        }, String(text));
        chipsWrap.appendChild(chip);
      });
    })
    .catch(() => {
      if (stale()) return;
      chipsNote.textContent = "Chưa lấy được gợi ý nhanh — bạn vẫn viết phản hồi tự do bên dưới.";
    });

  // ---- AI (F04): cổng THẬT qua aiStatus; tắt → không render nút ----
  Promise.resolve()
    .then(() => ctx.adapter.aiStatus())
    .then((aiStatus) => {
      if (stale()) return;
      const enabled = Boolean(
        aiStatus && (aiStatus.enabled === true || aiStatus.ai_enabled === true),
      );
      if (!enabled) return; // trung thực: không có cổng thì không có nút
      renderAiSlot(ctx, { aiSlot, textarea, stale });
    })
    .catch(() => { /* không có trạng thái AI → không nút */ });
}

/* --------------------------- AI gợi ý (chỉ điền textarea) --------------------------- */

function renderAiSlot(ctx, { aiSlot, textarea, stale }) {
  const pill = h("button", {
    class: "fb-btn fb-btn--neutral",
    type: "button",
    title: "Xin gợi ý diễn đạt êm ái hơn cho lời phản hồi hiện tại.",
    onclick: () => onAiRefine(),
  },
    createIcon({ name: "auto_awesome", size: 18 }),
    h("span", {}, "AI gợi ý cách diễn đạt êm ái hơn"),
  );
  const aiMsg = h("p", { class: "fb-sec__sub", role: "status" },
    "Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời phản hồi của mình.");
  const suggestion = h("div", { class: "fb-compose__ai-suggestion", hidden: true });
  aiSlot.appendChild(pill);
  aiSlot.appendChild(aiMsg);
  aiSlot.appendChild(suggestion);

  let current = null;

  function onAiRefine() {
    const text = textarea.value.trim();
    if (!text) {
      aiMsg.textContent = "Hãy viết vài dòng trước khi dùng gợi ý AI.";
      return;
    }
    pill.disabled = true;
    aiMsg.textContent = "Đang xin gợi ý từ máy chủ…";
    const key = newIdemKey();
    Promise.resolve()
      .then(() => ctx.adapter.aiRefine({ text, key }))
      .then((result) => {
        pill.disabled = false;
        if (stale()) return;
        if (!result || !result.suggestion_id) throw new Error("invalid_suggestion");
        current = result;
        renderSuggestion();
        aiMsg.textContent = "Bạn hoàn toàn quyết định giữ nguyên hay sửa đổi lời phản hồi của mình.";
      })
      .catch((error) => {
        pill.disabled = false;
        aiMsg.textContent = describeError(error, "Chưa lấy được gợi ý AI — lời phản hồi của bạn giữ nguyên.");
      });
  }

  function onAiAccept(suggestionRow) {
    Promise.resolve()
      .then(() => ctx.adapter.aiAccept(suggestionRow.suggestion_id))
      .then(() => {
        if (stale()) return;
        textarea.value = String(suggestionRow.refined_text || textarea.value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        current = null;
        renderSuggestion();
        aiMsg.textContent = "Bạn đã dùng gợi ý — nội dung chỉ nằm trong ô soạn, chưa gửi.";
      })
      .catch(() => {
        aiMsg.textContent = "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại.";
      });
  }

  function onAiDiscard(suggestionRow) {
    Promise.resolve()
      .then(() => ctx.adapter.aiDiscard(suggestionRow.suggestion_id))
      .then(() => {
        current = null;
        renderSuggestion();
        aiMsg.textContent = "Bạn đã bỏ gợi ý — lời phản hồi hiện tại giữ nguyên.";
      })
      .catch(() => {
        aiMsg.textContent = "Chưa ghi nhận được lựa chọn. Gợi ý vẫn giữ nguyên — bạn có thể thử lại.";
      });
  }

  function renderSuggestion() {
    clear(suggestion);
    if (!current) {
      suggestion.hidden = true;
      return;
    }
    suggestion.hidden = false;
    suggestion.appendChild(h("p", { class: "fb-compose__ai-suggest-label" }, "Gợi ý của máy chủ:"));
    suggestion.appendChild(
      h("p", { class: "fb-compose__ai-suggest-text" }, String(current.refined_text || "")),
    );
    const row = h("div", { class: "fb-compose__pause-buttons" });
    row.appendChild(createButton({
      label: "Dùng gợi ý",
      variant: "primary",
      onClick: () => onAiAccept(current),
    }));
    row.appendChild(createButton({
      label: "Bỏ",
      variant: "ghost",
      onClick: () => onAiDiscard(current),
    }));
    suggestion.appendChild(row);
  }
}
