// F03 card detail page (recipient side): render the received card snapshot
// as PLAIN TEXT (textContent only — never innerHTML with network data),
// show published reply suggestions; a suggestion becomes a reply only after
// the recipient edits/confirms an explicit send through the F05 inbox API.

export async function createPage({ root, params, ctx }) {
  const api = ctx.cardsApi;
  const inboxApi = ctx.inboxApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Thẻ bạn nhận được</h1>
    <p id="card-detail-title" class="fb-card-title"></p>
    <p id="card-detail-body" class="fb-card-body"></p>
    <p id="card-detail-note" class="fb-card-note"></p>
    <h2>Gợi ý trả lời</h2>
    <ul class="fb-list" id="suggestion-list"></ul>
    <label for="reply-body">Lời phản hồi của bạn</label>
    <textarea id="reply-body" maxlength="4000" rows="3"></textarea>
    <button class="fb-button" id="reply-send">Gửi phản hồi</button>
    <p id="card-detail-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#card-detail-status");
  const replyEl = el.querySelector("#reply-body");
  let replying = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderSuggestions(items) {
    const list = el.querySelector("#suggestion-list");
    list.textContent = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có gợi ý nào.";
      list.appendChild(li);
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "fb-button fb-button--secondary";
      btn.textContent = item.text; // textContent: never interpret as HTML
      btn.addEventListener("click", () => {
        replyEl.value = item.text;
        setStatus("Gợi ý đã điền vào ô phản hồi. Sửa nếu muốn rồi bấm gửi.",
          "info");
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  try {
    const data = await api.snapshot(params.messageId);
    // Plain-text rendering of published card content (safe against markers).
    el.querySelector("#card-detail-title").textContent = data.card.title;
    el.querySelector("#card-detail-body").textContent = data.card.body;
    el.querySelector("#card-detail-note").textContent = "";
    try {
      const suggestions = await api.suggestions(params.messageId, undefined);
      renderSuggestions(suggestions.results || []);
    } catch (err) {
      renderSuggestions([]);
    }
  } catch (err) {
    const code = err && err.code;
    if (code === "not_found") {
      setStatus("Thẻ không còn xem được (có thể kết nối đã kết thúc).", "error");
    } else {
      setStatus("Không tải được thẻ. Thử lại sau.", "error");
    }
    return { destroy() { el.remove(); } };
  }

  el.querySelector("#reply-send").addEventListener("click", async () => {
    if (replying) return;
    const body = replyEl.value.trim();
    if (!body) {
      setStatus("Hãy viết lời phản hồi trước khi gửi.", "error");
      return;
    }
    replying = true;
    el.querySelector("#reply-send").disabled = true;
    try {
      await inboxApi.send({
        kind: "text",
        recipientId: params.counterpartyId,
        body,
        replyTo: params.messageId,
        key: `card-reply-${params.messageId}`,
      });
      setStatus("Đã gửi phản hồi.", "success");
      replyEl.value = "";
    } catch (err) {
      setStatus("Gửi chưa thành công. Thử lại sau.", "error");
      el.querySelector("#reply-send").disabled = false;
    } finally {
      replying = false;
    }
  });

  return {
    destroy() {
      el.remove();
    },
  };
}
