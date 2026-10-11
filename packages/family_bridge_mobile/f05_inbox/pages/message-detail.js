// F05 message detail + reply page. Reply templates are SUGGESTIONS; the
// recipient edits and presses send explicitly. Unknown send outcome shows
// operation-status lookup guidance (never auto-retry with a new key).

export async function createPage({ root, params, ctx }) {
  const api = ctx.inboxApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Tin nhắn</h1>
    <div class="fb-card" id="body-card"><p>Đang tải…</p></div>
    <section class="fb-card" id="reply-section" hidden>
      <h2>Trả lời</h2>
      <div id="suggestions"></div>
      <label class="fb-label" for="reply-input">Lời của bạn (có thể sửa mẫu)</label>
      <textarea id="reply-input" class="fb-textarea" maxlength="4000"></textarea>
      <p class="fb-status fb-status--info">Kiểm tra kỹ lời nhắn trước khi bấm gửi.</p>
      <button class="fb-button fb-button--primary" id="send-reply">Xem trước và gửi</button>
    </section>
    <p id="detail-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  const status = el.querySelector("#detail-status");
  const bodyCard = el.querySelector("#body-card");
  const replySection = el.querySelector("#reply-section");
  let current = null;
  let destroyed = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function load() {
    try {
      const data = await api.detail(params.messageId);
      current = data;
      bodyCard.replaceChildren();
      const title = document.createElement("h2");
      title.textContent = data.title || (data.direction === "sent" ? "Đã gửi" : "Nhận");
      const body = document.createElement("p");
      body.textContent = data.body; // rendered as TEXT, never HTML (SEC-12)
      bodyCard.append(title, body);
      // Read receipt only when the recipient actually sees the body.
      if (data.direction === "received" && !data.read) {
        api.markRead(data.message_id).catch(() => {});
      }
      // Reply allowed for received messages (role-aware suggestions)
      if (data.direction === "received") {
        replySection.hidden = false;
        loadSuggestions();
      }
    } catch (err) {
      bodyCard.replaceChildren();
      const p = document.createElement("p");
      p.textContent = err.code === "message_no_longer_available"
        ? "Tin này không còn xem được sau khi ngắt kết nối."
        : "Không tải được tin nhắn.";
      bodyCard.appendChild(p);
      setStatus("Đã có lỗi khi tải.", "error");
    }
  }

  async function loadSuggestions() {
    const container = el.querySelector("#suggestions");
    try {
      const data = await api.quickReplies(ctx.audience);
      container.replaceChildren();
      for (const suggestion of data.results.slice(0, 5)) {
        const chip = document.createElement("button");
        chip.className = "fb-button fb-button--secondary";
        chip.textContent = suggestion.text;
        chip.addEventListener("click", () => {
          el.querySelector("#reply-input").value = suggestion.text;
        });
        container.appendChild(chip);
        container.appendChild(document.createTextNode(" "));
      }
    } catch {
      // suggestions unavailable — free-text reply still works
    }
  }

  el.querySelector("#send-reply").addEventListener("click", async (event) => {
    const input = el.querySelector("#reply-input");
    const text = input.value.trim();
    if (!text || !current) return;
    if (!window.confirm("Gửi lời trả lời này?")) return;
    event.target.disabled = true;
    setStatus("Đang gửi…", "info");
    const key = "reply-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
    try {
      const result = await api.send({
        kind: "quick_reply", recipientId: current.counterparty_id,
        body: text, replyTo: current.message_id, key,
      });
      setStatus("Đã gửi. 'Đã gửi' chưa có nghĩa là người kia đã đọc.", "success");
      input.value = "";
    } catch (err) {
      if (err.code === "temporarily_unavailable" || err.status === 0) {
        setStatus("Mạng không rõ kết quả. Kiểm tra 'Trạng thái gửi' trước khi gửi lại — không gửi trùng.",
          "warning");
      } else if (err.code === "duplicate_key_payload_mismatch") {
        setStatus("Nút gửi bị nhấn với nội dung khác. Vui lòng kiểm tra lại.", "error");
      } else if (err.code === "not_authorized") {
        setStatus("Không thể trả lời lúc này (kết nối đã thay đổi?).", "error");
      } else {
        setStatus("Không gửi được. Lời nhắn vẫn còn trong ô soạn.", "error");
      }
    } finally {
      event.target.disabled = false;
    }
  });

  load();
  return { el, destroy() { destroyed = true; } };
}
