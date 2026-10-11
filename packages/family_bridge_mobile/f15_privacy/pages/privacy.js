// F15 privacy page (FL-20): what is shared, revoke per item, deletion
// request with truthful status. Honest wording: revoked stops new reads,
// screenshots outside the app cannot be recalled; deletion receipt is not
// a claim that everything is erased instantly.

export async function createPage({ root, params, ctx }) {
  const api = ctx.privacyApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Quyền riêng tư</h1>
    <section class="fb-card">
      <h2>Đang chia sẻ</h2>
      <ul class="fb-list" id="shared-list"><li>Đang tải…</li></ul>
    </section>
    <section class="fb-card">
      <h2>Yêu cầu xóa dữ liệu</h2>
      <p>Chọn phạm vi bạn muốn xóa. Yêu cầu sẽ được xác minh trước khi xử lý;
         trạng thái luôn phản ánh thật, chưa xong sẽ ghi rõ.</p>
      <label><input type="checkbox" id="cat-mood" /> Ghi nhận tâm trạng</label><br/>
      <label><input type="checkbox" id="cat-journal" /> Nhật ký</label><br/>
      <label><input type="checkbox" id="cat-drafts" /> Bản thảo</label><br/>
      <label><input type="checkbox" id="cat-messages" /> Tin đã gửi</label><br/>
      <button class="fb-button fb-button--danger" id="request-delete">Gửi yêu cầu xóa</button>
      <p id="delete-receipt" class="fb-status" aria-live="polite"></p>
    </section>
    <p id="page-status" class="fb-status" role="status" aria-live="polite"></p>
  `;

  const status = el.querySelector("#page-status");
  const sharedList = el.querySelector("#shared-list");

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function refresh() {
    try {
      const data = await api.overview();
      sharedList.replaceChildren();
      if (!data.shared_by_me.length) {
        const li = document.createElement("li");
        li.textContent = "Bạn chưa chia sẻ mục nào. Mỗi mục bạn chia sẻ sẽ hiện ở đây để bạn thu hồi riêng.";
        sharedList.appendChild(li);
        return;
      }
      for (const item of data.shared_by_me) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        const kindLabel = item.item_type === "mood_entry" ? "Tâm trạng"
          : item.item_type === "journal_page" ? "Trang nhật ký" : item.item_type;
        label.textContent = item.revoked ? `${kindLabel} — đã thu hồi` : `${kindLabel} — đang chia sẻ`;
        if (!item.revoked) {
          const btn = document.createElement("button");
          btn.className = "fb-button fb-button--danger";
          btn.textContent = "Thu hồi";
          btn.addEventListener("click", async () => {
            if (!window.confirm("Thu hồi chia sẻ mục này? Người nhận sẽ không đọc được nữa.")) return;
            try {
              await api.revokeGrant(item.item_type, item.item_id, item.recipient_id);
              setStatus("Đã thu hồi. Lần đọc mới sẽ bị chặn.", "success");
              refresh();
            } catch (err) {
              setStatus("Không thu hồi được. Thử lại.", "error");
            }
          });
          li.appendChild(label);
          li.appendChild(document.createTextNode(" "));
          li.appendChild(btn);
        } else {
          li.appendChild(label);
        }
        sharedList.appendChild(li);
      }
    } catch (err) {
      sharedList.replaceChildren();
      const li = document.createElement("li");
      li.textContent = "Không tải được trạng thái chia sẻ.";
      sharedList.appendChild(li);
    }
  }

  el.querySelector("#request-delete").addEventListener("click", async (event) => {
    const categories = [];
    if (el.querySelector("#cat-mood").checked) categories.push("mood");
    if (el.querySelector("#cat-journal").checked) categories.push("journal");
    if (el.querySelector("#cat-drafts").checked) categories.push("drafts");
    if (el.querySelector("#cat-messages").checked) categories.push("messages");
    if (!categories.length) {
      setStatus("Chọn ít nhất một phạm vi.", "warning");
      return;
    }
    if (!window.confirm("Gửi yêu cầu xóa dữ liệu? Sau khi xử lý bắt đầu, không thể hủy.")) return;
    event.target.disabled = true;
    try {
      const result = await api.requestDeletion(categories);
      const receiptEl = el.querySelector("#delete-receipt");
      receiptEl.className = "fb-status fb-status--warning";
      receiptEl.textContent = result.receipt
        ? `Đã ghi nhận yêu cầu. Mã biên nhận (lưu lại, chỉ hiện một lần): ${result.receipt}`
        : "Bạn đã có yêu cầu đang mở.";
      setStatus("Yêu cầu đã gửi. Trạng thái sẽ phản ánh tiến trình thật.", "success");
    } catch (err) {
      setStatus("Không gửi được yêu cầu. Thử lại sau.", "error");
    } finally {
      event.target.disabled = false;
    }
  });

  refresh();
  return { el, destroy() {} };
}
