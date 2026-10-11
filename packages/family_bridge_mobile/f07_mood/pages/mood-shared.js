// F07 shared-with-me page (recipient side): list entries shared with me,
// read one (server re-checks grant/revision/connection on EVERY read).
// Plain text rendering only.

export async function createPage({ root, params, ctx }) {
  const api = ctx.moodApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Mood được chia sẻ với mình</h1>
    <ul class="fb-list" id="shared-list"><li>Đang tải…</li></ul>
    <section id="shared-detail" hidden>
      <p id="shared-date" class="fb-status"></p>
      <p id="shared-emotion" class="fb-card-title"></p>
      <p id="shared-note" class="fb-card-body"></p>
    </section>
    <p id="shared-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#shared-status");
  const list = el.querySelector("#shared-list");

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function openShare(shareId) {
    try {
      const data = await api.sharedDetail(shareId);
      el.querySelector("#shared-date").textContent = data.entry.entry_date;
      el.querySelector("#shared-emotion").textContent = data.entry.emotion_label;
      el.querySelector("#shared-note").textContent = data.entry.note || "(Không có ghi chú)";
      el.querySelector("#shared-detail").hidden = false;
    } catch (err) {
      el.querySelector("#shared-detail").hidden = true;
      setStatus("Mục này không còn xem được (bị thu hồi, đã sửa hoặc kết nối kết thúc).", "error");
    }
  }

  try {
    const data = await api.sharedWithMe();
    list.textContent = "";
    if (!data.results.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có gì được chia sẻ với mình.";
      list.appendChild(li);
    }
    for (const row of data.results) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "fb-button fb-button--secondary";
      btn.textContent = `Mục ngày ${row.shared_at.slice(0, 10)}`;
      btn.addEventListener("click", () => openShare(row.share_id));
      li.appendChild(btn);
      list.appendChild(li);
    }
  } catch (err) {
    setStatus("Không tải được danh sách. Thử lại.", "error");
  }

  return {
    destroy() {
      el.remove();
    },
  };
}
