// F07 mood page (US-015): today's entry (one per day), descriptive emotion
// chips (no scores), optional note, personal summary counts, history with
// paging, and the per-entry share flow: pick ONE entry -> pick recipient ->
// confirm. All network-derived text renders via textContent.

export async function createPage({ root, params, ctx }) {
  const api = ctx.moodApi;
  const connections = ctx.connectionsApi || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Tâm trạng của mình</h1>
    <div id="mood-chips" class="fb-chips" role="radiogroup" aria-label="Chọn cảm xúc hôm nay"></div>
    <label for="mood-note">Ghi chú (không bắt buộc)</label>
    <textarea id="mood-note" maxlength="2000" rows="3"></textarea>
    <button class="fb-button" id="mood-save">Lưu tâm trạng hôm nay</button>
    <h2>Chút hơn 3 tháng qua</h2>
    <ul class="fb-list" id="mood-summary"><li>Đang tải…</li></ul>
    <h2>Lịch sử</h2>
    <ul class="fb-list" id="mood-history"><li>Đang tải…</li></ul>
    <button class="fb-button fb-button--secondary" id="mood-more" hidden>Tải thêm</button>
    <section id="mood-share" hidden>
      <h2>Chia sẻ mục này</h2>
      <p id="mood-share-entry" class="fb-status"></p>
      <label for="mood-share-recipient">Người nhận</label>
      <select id="mood-share-recipient"></select>
      <button class="fb-button" id="mood-share-confirm">Chia sẻ mục này</button>
      <p class="fb-status">Chỉ chia sẻ đúng mục này — không chia sẻ cả lịch sử.</p>
    </section>
    <p id="mood-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#mood-status");
  const noteEl = el.querySelector("#mood-note");
  const chipsEl = el.querySelector("#mood-chips");
  let selectedEmotion = null;
  let shareEntryId = null;
  let nextCursor = null;
  let saving = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderChips(emotions) {
    chipsEl.textContent = "";
    for (const item of emotions) {
      const chip = document.createElement("button");
      chip.className = "fb-chip";
      chip.setAttribute("role", "radio");
      chip.textContent = item.label; // descriptive only
      chip.addEventListener("click", () => {
        selectedEmotion = item.emotion;
        for (const sibling of chipsEl.children) {
          sibling.setAttribute("aria-checked", "false");
        }
        chip.setAttribute("aria-checked", "true");
      });
      chipsEl.appendChild(chip);
    }
  }

  function renderSummary(rows) {
    const list = el.querySelector("#mood-summary");
    list.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có dữ liệu để mô tả.";
      list.appendChild(li);
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      li.textContent = `${row.label}: ${row.count} ngày`; // counts, no judgment
      list.appendChild(li);
    }
  }

  function renderHistory(entries, append) {
    const list = el.querySelector("#mood-history");
    if (!append) list.textContent = "";
    for (const entry of entries) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = `${entry.entry_date} — ${entry.emotion_label}`;
      const btn = document.createElement("button");
      btn.className = "fb-button fb-button--secondary";
      btn.textContent = "Chia sẻ mục này";
      btn.addEventListener("click", () => openShare(entry));
      li.appendChild(text);
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  async function loadHistory(cursor) {
    try {
      const data = await api.list(cursor, 20);
      renderHistory(data.results || [], Boolean(cursor));
      nextCursor = data.next;
      el.querySelector("#mood-more").hidden = !nextCursor;
    } catch (err) {
      setStatus("Không tải được lịch sử. Thử lại.", "error");
    }
  }

  async function openShare(entry) {
    shareEntryId = entry.entry_id;
    el.querySelector("#mood-share-entry").textContent =
      `${entry.entry_date} — ${entry.emotion_label}`;
    const select = el.querySelector("#mood-share-recipient");
    select.textContent = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "— Chưa có người nhận —";
    select.appendChild(empty);
    if (connections) {
      try {
        const data = await connections.listActive();
        for (const conn of data.results || []) {
          const opt = document.createElement("option");
          opt.value = conn.counterparty_id || conn.party_b;
          opt.textContent = conn.display_name || "Người đồng hành";
          select.appendChild(opt);
        }
      } catch (err) { /* recipient list optional; share still gated */ }
    }
    el.querySelector("#mood-share").hidden = false;
  }

  el.querySelector("#mood-save").addEventListener("click", async () => {
    if (saving) return;
    if (!selectedEmotion) {
      setStatus("Hãy chọn một cảm xúc trước đã.", "error");
      return;
    }
    saving = true;
    try {
      await api.create({ entryDate: undefined, emotion: selectedEmotion,
        note: noteEl.value.trim() });
      setStatus("Đã lưu tâm trạng hôm nay.", "success");
      noteEl.value = "";
      const summary = await api.summary(90);
      renderSummary(summary.results || []);
      await loadHistory(null);
    } catch (err) {
      const reason = err && err.details && err.details.reason;
      if (reason === "entry_already_exists_use_edit") {
        setStatus("Hôm nay đã có mục rồi — sửa trong lịch sử nhé.", "error");
      } else {
        setStatus("Không lưu được. Thử lại.", "error");
      }
    } finally {
      saving = false;
    }
  });

  el.querySelector("#mood-share-confirm").addEventListener("click", async () => {
    if (!shareEntryId) return;
    const recipientId = el.querySelector("#mood-share-recipient").value;
    if (!recipientId) {
      setStatus("Chọn người nhận đã kết nối.", "error");
      return;
    }
    try {
      await api.share(shareEntryId, recipientId);
      setStatus("Đã chia sẻ mục này. Người nhận sẽ thấy đúng bản này.", "success");
      el.querySelector("#mood-share").hidden = true;
      shareEntryId = null;
    } catch (err) {
      setStatus("Không chia sẻ được. Kiểm tra kết nối rồi thử lại.", "error");
    }
  });

  el.querySelector("#mood-more").addEventListener("click", () => {
    loadHistory(nextCursor);
  });

  // Init
  try {
    const meta = await api.summary(90);
    renderSummary(meta.results || []);
    renderChips(meta.emotions || []);
  } catch (err) {
    renderSummary([]);
  }
  await loadHistory(null);

  return {
    destroy() {
      el.remove();
    },
  };
}
