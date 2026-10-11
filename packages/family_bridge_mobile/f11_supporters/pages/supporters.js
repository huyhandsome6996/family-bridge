// F11 supporters page (US-022/US-035): pending/active roles at a glance,
// invite a new supporter, answer consent (supporter side), explicit
// contact with fresh text, and the ALWAYS-present help directory link
// when no supporter is available yet.

export async function createPage({ root, params, ctx }) {
  const api = ctx.supportersApi;
  const connections = ctx.connectionsApi || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Điểm tựa của mình</h1>
    <ul class="fb-list" id="sup-list"><li>Đang tải…</li></ul>
    <button class="fb-button fb-button--secondary" id="sup-invite">Mời người làm điểm tựa</button>
    <section id="sup-invite-form" hidden>
      <label for="sup-recipient">Chọn người đã kết nối</label>
      <select id="sup-recipient"></select>
      <label for="sup-kind">Quan hệ</label>
      <select id="sup-kind">
        <option value="family">Người thân</option>
        <option value="teacher">Thầy cô</option>
        <option value="counselor">Cán bộ tham vấn</option>
      </select>
      <button class="fb-button" id="sup-invite-send">Gửi lời mời</button>
    </section>
    <section id="sup-contact" hidden>
      <h2>Nhắn cho điểm tựa này</h2>
      <p id="sup-contact-role" class="fb-status"></p>
      <label for="sup-body">Lời nhắn mới của mình</label>
      <textarea id="sup-body" maxlength="4000" rows="4"></textarea>
      <button class="fb-button" id="sup-contact-send">Gửi lời nhắn</button>
      <p class="fb-status">Chỉ lời bạn vừa viết được gửi — không đính kèm thư
      hay nhật ký cũ.</p>
    </section>
    <p id="sup-no-supporter" class="fb-status" hidden>Chưa có điểm tựa nào.
      Bạn vẫn mở được Trang tìm trợ giúp bất cứ lúc nào.</p>
    <a class="fb-button fb-button--secondary" href="#/help" id="sup-help-link">Mở Trang tìm trợ giúp</a>
    <p id="sup-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#sup-status");
  let contactRoleId = null;
  let sending = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderRoles(rows) {
    const list = el.querySelector("#sup-list");
    list.textContent = "";
    el.querySelector("#sup-no-supporter").hidden =
      rows.some((row) => row.status === "active");
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa mời ai làm điểm tựa.";
      list.appendChild(li);
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      const stateText = { pending: "Đang chờ đồng ý", active: "Đang đồng hành",
        declined: "Đã từ chối" }[row.status] || row.status;
      label.textContent = `${stateText} — ${row.relationship_kind}`;
      if (row.can_contact) {
        const btn = document.createElement("button");
        btn.className = "fb-button fb-button--secondary";
        btn.textContent = "Nhắn điểm tựa này";
        btn.addEventListener("click", () => openContact(row));
        li.appendChild(btn);
      }
      li.appendChild(label);
      list.appendChild(li);
    }
  }

  async function loadRoles() {
    try {
      const data = await api.list();
      renderRoles(data.results || []);
    } catch (err) {
      setStatus("Không tải được danh sách. Thử lại.", "error");
    }
  }

  async function openContact(row) {
    contactRoleId = row.role_id;
    el.querySelector("#sup-contact-role").textContent =
      "Điểm tựa đang đồng hành với bạn.";
    el.querySelector("#sup-contact").hidden = false;
  }

  el.querySelector("#sup-invite").addEventListener("click", async () => {
    const form = el.querySelector("#sup-invite-form");
    form.hidden = !form.hidden;
    if (!form.hidden) {
      const select = el.querySelector("#sup-recipient");
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
            opt.textContent = conn.display_name || "Người đã kết nối";
            select.appendChild(opt);
          }
        } catch (err) { /* invite gated server-side anyway */ }
      }
    }
  });

  el.querySelector("#sup-invite-send").addEventListener("click", async () => {
    const supporterId = el.querySelector("#sup-recipient").value;
    if (!supporterId) {
      setStatus("Chọn người đã kết nối trước.", "error");
      return;
    }
    try {
      await api.invite({ supporterId,
        relationshipKind: el.querySelector("#sup-kind").value });
      setStatus("Đã gửi lời mời. Chờ người đó tự đồng ý.", "success");
      el.querySelector("#sup-invite-form").hidden = true;
      await loadRoles();
    } catch (err) {
      setStatus("Không gửi được lời mời. Thử lại.", "error");
    }
  });

  el.querySelector("#sup-contact-send").addEventListener("click", async () => {
    if (sending || !contactRoleId) return;
    const body = el.querySelector("#sup-body").value.trim();
    if (!body) {
      setStatus("Viết lời nhắn trước khi gửi.", "error");
      return;
    }
    sending = true;
    el.querySelector("#sup-contact-send").disabled = true;
    try {
      await api.contact({ roleId: contactRoleId, body,
        key: `sup-contact-${Date.now()}` });
      setStatus("Đã gửi lời nhắn mới.", "success");
      el.querySelector("#sup-body").value = "";
      el.querySelector("#sup-contact").hidden = true;
      contactRoleId = null;
    } catch (err) {
      const reason = err && err.details && err.details.reason;
      if (reason === "supporter_not_available") {
        setStatus("Điểm tựa này chưa nhận lời hoặc đã hết hiệu lực.", "error");
      } else {
        setStatus("Gửi chưa thành công. Thử lại hoặc mở Trang tìm trợ giúp.", "error");
      }
      el.querySelector("#sup-contact-send").disabled = false;
    } finally {
      sending = false;
    }
  });

  await loadRoles();

  return {
    destroy() { el.remove(); },
  };
}
