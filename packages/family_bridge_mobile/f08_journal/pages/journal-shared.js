// F08 shared-journal page (US-031): recipient reads ONE shared page
// (server re-checks grant/revision/connection live) and writes their
// song-hanh reflection. Plain text rendering only.

export async function createPage({ root, params, ctx }) {
  const api = ctx.journalApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Trang được chia sẻ với mình</h1>
    <ul class="fb-list" id="js-list"><li>Đang tải…</li></ul>
    <section id="js-detail" hidden>
      <p id="js-title" class="fb-card-title"></p>
      <p id="js-content" class="fb-card-body"></p>
      <label for="js-reply">Phản hồi song hành của mình</label>
      <textarea id="js-reply" maxlength="4000" rows="4"></textarea>
      <button class="fb-button" id="js-send-reply">Lưu phản hồi</button>
    </section>
    <h2>Phản hồi mình đã viết</h2>
    <ul class="fb-list" id="js-mine"></ul>
    <p id="js-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#js-status");
  let currentShare = null;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function openShare(shareId) {
    try {
      const data = await api.sharedDetail(shareId);
      currentShare = shareId;
      el.querySelector("#js-title").textContent =
        data.page.title || "(Không tiêu đề)";
      el.querySelector("#js-content").textContent = data.page.content;
      el.querySelector("#js-detail").hidden = false;
    } catch (err) {
      el.querySelector("#js-detail").hidden = true;
      currentShare = null;
      setStatus("Trang không còn xem được (bị thu hồi, đã sửa hoặc kết nối kết thúc).", "error");
    }
  }

  el.querySelector("#js-send-reply").addEventListener("click", async () => {
    if (!currentShare) return;
    const body = el.querySelector("#js-reply").value.trim();
    if (!body) {
      setStatus("Viết phản hồi trước khi lưu.", "error");
      return;
    }
    try {
      await api.reply(currentShare, body);
      setStatus("Đã lưu phản hồi song hành.", "success");
      el.querySelector("#js-reply").value = "";
      await loadMine();
    } catch (err) {
      setStatus("Không lưu được phản hồi (trang có thể đã bị thu hồi).", "error");
    }
  });

  async function loadMine() {
    try {
      const data = await api.myReplies();
      const list = el.querySelector("#js-mine");
      list.textContent = "";
      for (const row of data.results || []) {
        const li = document.createElement("li");
        li.textContent = row.body;
        list.appendChild(li);
      }
    } catch (err) { /* non-blocking */ }
  }

  try {
    const data = await api.sharedWithMe();
    const list = el.querySelector("#js-list");
    list.textContent = "";
    if (!data.results.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có trang nào được chia sẻ với mình.";
      list.appendChild(li);
    }
    for (const row of data.results) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "fb-button fb-button--secondary";
      btn.textContent = `Trang chia sẻ ngày ${row.shared_at.slice(0, 10)}`;
      btn.addEventListener("click", () => openShare(row.share_id));
      li.appendChild(btn);
      list.appendChild(li);
    }
  } catch (err) {
    setStatus("Không tải được danh sách. Thử lại.", "error");
  }
  await loadMine();

  return {
    destroy() { el.remove(); },
  };
}
