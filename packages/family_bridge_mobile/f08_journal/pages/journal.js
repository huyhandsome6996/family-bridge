// F08 journal page (US-016): private writing space with published topic
// prompts, revision-guarded editing, clear private/shared labeling, and
// per-page sharing. All dynamic text renders via textContent.

export async function createPage({ root, params, ctx }) {
  const api = ctx.journalApi;
  const connections = ctx.connectionsApi || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Nhật ký riêng của mình</h1>
    <p class="fb-status">Trang ở đây là của riêng bạn. Chỉ trang bạn chủ động
    chia sẻ mới người đồng hành được đọc.</p>
    <label for="j-topic">Chủ đề gợi ý</label>
    <select id="j-topic"></select>
    <label for="j-title">Tiêu đề (không bắt buộc)</label>
    <input id="j-title" maxlength="120" />
    <label for="j-content">Nội dung</label>
    <textarea id="j-content" maxlength="8000" rows="6"></textarea>
    <button class="fb-button" id="j-save">Lưu trang</button>
    <h2>Các trang của mình</h2>
    <ul class="fb-list" id="j-pages"><li>Đang tải…</li></ul>
    <section id="j-share" hidden>
      <h2>Chia sẻ trang này</h2>
      <p id="j-share-page" class="fb-status"></p>
      <label for="j-share-recipient">Người nhận</label>
      <select id="j-share-recipient"></select>
      <button class="fb-button" id="j-share-confirm">Chia sẻ trang này</button>
    </section>
    <p id="j-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#j-status");
  const topicEl = el.querySelector("#j-topic");
  const titleEl = el.querySelector("#j-title");
  const contentEl = el.querySelector("#j-content");
  let currentRevision = null;
  let editingId = null;
  let sharePageId = null;
  let saving = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function loadPrompts() {
    const select = topicEl;
    select.textContent = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "— Viết tự do —";
    select.appendChild(none);
    try {
      const data = await api.prompts();
      for (const prompt of data.results || []) {
        const opt = document.createElement("option");
        opt.value = prompt.topic_code;
        opt.textContent = prompt.prompt_text;
        select.appendChild(opt);
      }
    } catch (err) { /* free writing still works without prompts */ }
  }

  function renderPages(pages) {
    const list = el.querySelector("#j-pages");
    list.textContent = "";
    if (!pages.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có trang nào.";
      list.appendChild(li);
      return;
    }
    for (const page of pages) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${page.title || "(Không tiêu đề)"} — bản ${page.revision}`;
      const editBtn = document.createElement("button");
      editBtn.className = "fb-button fb-button--secondary";
      editBtn.textContent = "Mở";
      editBtn.addEventListener("click", () => {
        editingId = page.page_id;
        currentRevision = page.revision;
        titleEl.value = page.title || "";
        contentEl.value = page.content;
        setStatus("Đang mở trang. Lưu sẽ tạo bản mới.", "info");
      });
      const shareBtn = document.createElement("button");
      shareBtn.className = "fb-button fb-button--secondary";
      shareBtn.textContent = "Chia sẻ trang này";
      shareBtn.addEventListener("click", () => openShare(page));
      li.appendChild(label);
      li.appendChild(editBtn);
      li.appendChild(shareBtn);
      list.appendChild(li);
    }
  }

  async function loadPages() {
    try {
      const data = await api.list(null, null);
      renderPages(data.results || []);
    } catch (err) {
      setStatus("Không tải được trang. Thử lại.", "error");
    }
  }

  async function openShare(page) {
    sharePageId = page.page_id;
    el.querySelector("#j-share-page").textContent =
      `${page.title || "(Không tiêu đề)"} — chỉ chia sẻ đúng trang này.`;
    const select = el.querySelector("#j-share-recipient");
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
      } catch (err) { /* gating still enforced server-side */ }
    }
    el.querySelector("#j-share").hidden = false;
  }

  el.querySelector("#j-save").addEventListener("click", async () => {
    if (saving) return;
    const content = contentEl.value;
    if (!content.trim()) {
      setStatus("Trang còn trống.", "error");
      return;
    }
    saving = true;
    try {
      if (editingId) {
        const data = await api.edit(editingId, {
          title: titleEl.value, content,
          expectedRevision: currentRevision,
        });
        currentRevision = data.revision;
        setStatus("Đã lưu bản mới. Bản chia sẻ cũ tự ẩn tới khi chia sẻ lại.", "success");
      } else {
        await api.create({ topicCode: topicEl.value,
          title: titleEl.value, content });
        setStatus("Đã lưu trang riêng.", "success");
      }
      await loadPages();
    } catch (err) {
      const code = err && err.code;
      if (code === "revision_conflict") {
        setStatus("Trang đã đổi ở nơi khác. Tải lại trang mới nhất trước khi sửa.", "error");
      } else {
        setStatus("Không lưu được. Thử lại.", "error");
      }
    } finally {
      saving = false;
    }
  });

  el.querySelector("#j-share-confirm").addEventListener("click", async () => {
    if (!sharePageId) return;
    const recipientId = el.querySelector("#j-share-recipient").value;
    if (!recipientId) {
      setStatus("Chọn người nhận đã kết nối.", "error");
      return;
    }
    try {
      await api.share(sharePageId, recipientId);
      setStatus("Đã chia sẻ trang này. Người nhận thấy đúng bản hiện tại.", "success");
      el.querySelector("#j-share").hidden = true;
      sharePageId = null;
    } catch (err) {
      setStatus("Không chia sẻ được. Kiểm tra kết nối rồi thử lại.", "error");
    }
  });

  await Promise.all([loadPrompts(), loadPages()]);

  return {
    destroy() { el.remove(); },
  };
}
