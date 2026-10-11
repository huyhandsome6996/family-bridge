// F03 emotion cards page (US-027): browse published catalog (bounded),
// optional author note, recipient selection, EXACT preview, explicit
// confirm. Double-submit guard; card retired/version-changed while
// composing shows a stale notice and keeps the note (draft-safe).

export async function createPage({ root, params, ctx }) {
  const api = ctx.cardsApi;
  const connections = ctx.connectionsApi || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Thẻ cảm xúc</h1>
    <div id="card-groups" class="fb-chips" role="tablist"></div>
    <ul class="fb-list" id="card-list"><li>Đang tải…</li></ul>
    <section id="composer" hidden>
      <h2 id="composer-title"></h2>
      <p id="composer-body" class="fb-card-body"></p>
      <label for="card-note">Lời cuối của bạn (không bắt buộc)</label>
      <textarea id="card-note" maxlength="1000" rows="3"></textarea>
      <label for="card-recipient">Người nhận</label>
      <select id="card-recipient"></select>
      <button class="fb-button fb-button--secondary" id="card-preview">Xem trước</button>
    </section>
    <section id="preview" hidden>
      <h2>Xem trước</h2>
      <p id="preview-recipient" class="fb-status"></p>
      <p id="preview-title" class="fb-card-title"></p>
      <p id="preview-body" class="fb-card-body"></p>
      <p id="preview-note" class="fb-card-note"></p>
      <button class="fb-button" id="card-confirm">Gửi thẻ này</button>
      <button class="fb-button fb-button--secondary" id="card-back">Sửa lại</button>
    </section>
    <p id="card-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const listEl = el.querySelector("#card-list");
  const status = el.querySelector("#card-status");
  const composer = el.querySelector("#composer");
  const preview = el.querySelector("#preview");
  const noteEl = el.querySelector("#card-note");
  const recipientEl = el.querySelector("#card-recipient");
  let selected = null;
  let recipients = [];
  let sending = false;
  let destroyed = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderCards(cards) {
    listEl.textContent = "";
    if (!cards.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có thẻ nào để dùng.";
      listEl.appendChild(li);
      return;
    }
    for (const card of cards) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "fb-button fb-button--secondary fb-card-pick";
      btn.textContent = card.title;
      btn.addEventListener("click", () => pickCard(card));
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  function pickCard(card) {
    selected = card;
    el.querySelector("#composer-title").textContent = card.title;
    el.querySelector("#composer-body").textContent = card.body;
    composer.hidden = false;
    preview.hidden = true;
    setStatus("");
  }

  async function loadRecipients() {
    recipientEl.textContent = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "— Chưa có người nhận —";
    recipientEl.appendChild(option);
    if (!connections) return;
    try {
      const data = await connections.listActive();
      recipients = (data.results || []).filter((c) => c.status === "active");
      for (const conn of recipients) {
        const other = conn.counterparty_id || conn.party_b;
        const opt = document.createElement("option");
        opt.value = other;
        opt.textContent = conn.display_name || "Người đồng hành";
        recipientEl.appendChild(opt);
      }
    } catch (err) {
      setStatus("Không tải được danh sách người nhận.", "error");
    }
  }

  el.querySelector("#card-preview").addEventListener("click", async () => {
    if (!selected || sending) return;
    const recipientId = recipientEl.value;
    if (!recipientId) {
      setStatus("Hãy chọn người nhận đã kết nối.", "error");
      return;
    }
    try {
      const data = await api.preview({
        cardId: selected.card_id,
        version: selected.version,
        recipientId,
      });
      el.querySelector("#preview-recipient").textContent =
        "Gửi tới người đồng hành của bạn";
      el.querySelector("#preview-title").textContent = data.card.title;
      el.querySelector("#preview-body").textContent = data.card.body;
      const note = noteEl.value.trim();
      el.querySelector("#preview-note").textContent =
        note ? `Lời của bạn: ${note}` : "(Không kèm lời riêng)";
      composer.hidden = true;
      preview.hidden = false;
      setStatus("");
    } catch (err) {
      const code = err && err.code;
      if (code === "preview_stale") {
        setStatus("Thẻ vừa được cập nhật. Hãy chọn lại thẻ.", "error");
      } else if (code === "not_found") {
        setStatus("Thẻ hoặc kết nối không còn khả dụng.", "error");
      } else {
        setStatus("Không xem trước được. Thử lại sau.", "error");
      }
    }
  });

  el.querySelector("#card-back").addEventListener("click", () => {
    preview.hidden = true;
    composer.hidden = false;
  });

  el.querySelector("#card-confirm").addEventListener("click", async () => {
    if (!selected || sending) return;
    const recipientId = recipientEl.value;
    if (!recipientId) {
      setStatus("Hãy chọn người nhận đã kết nối.", "error");
      return;
    }
    sending = true;
    el.querySelector("#card-confirm").disabled = true;
    try {
      // Idempotency key bound to card+version+recipient so a retry with the
      // SAME intent is safe; a different card under the same key is a 409.
      const key = `card-send-${selected.card_id}-v${selected.version}`;
      await api.send({
        cardId: selected.card_id,
        version: selected.version,
        recipientId,
        authorNote: noteEl.value.trim(),
        key,
      });
      setStatus("Đã gửi thẻ. Xem trong Hộp thư.", "success");
      composer.hidden = true;
      preview.hidden = true;
      selected = null;
      noteEl.value = "";
    } catch (err) {
      const code = err && err.code;
      if (code === "preview_stale") {
        setStatus("Thẻ vừa đổi phiên bản. Chọn lại thẻ rồi gửi mới.", "error");
      } else if (code === "duplicate_key_payload_mismatch") {
        setStatus("Thẻ đã gửi với lựa chọn khác. Kiểm tra Hộp thư.", "error");
      } else if (code === "module_unavailable") {
        setStatus("Tính năng gửi tạm không khả dụng.", "error");
      } else {
        setStatus("Gửi chưa thành công. Kiểm tra mạng rồi thử lại.", "error");
      }
      el.querySelector("#card-confirm").disabled = false;
    } finally {
      sending = false;
    }
  });

  async function loadCatalog(group) {
    try {
      const data = await api.list(group || undefined, 50);
      renderCards(data.results || []);
    } catch (err) {
      setStatus("Không tải được bộ thẻ. Thử lại sau.", "error");
    }
  }

  const chips = el.querySelector("#card-groups");
  for (const [code, label] of [["", "Tất cả"], ["thuong", "Thương"],
    ["nho", "Nhớ"], ["tuhao", "Tự hào"]]) {
    const chip = document.createElement("button");
    chip.className = "fb-chip";
    chip.textContent = label;
    chip.setAttribute("role", "tab");
    chip.addEventListener("click", () => loadCatalog(code));
    chips.appendChild(chip);
  }

  await Promise.all([loadCatalog(""), loadRecipients()]);

  return {
    destroy() {
      destroyed = true;
      el.remove();
    },
  };
}
