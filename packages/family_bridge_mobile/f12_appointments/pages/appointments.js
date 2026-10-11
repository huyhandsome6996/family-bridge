// F12 appointments page (US-038/US-046): verified school contacts with
// tap-to-call (SDK, user action only), a request form, and an honest
// state timeline. Scheduling unavailable (no staff) is a first-class
// state, never hidden.

export async function createPage({ root, params, ctx }) {
  const api = ctx.appointmentsApi;
  const sdk = ctx.sdk || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Thầy cô và lịch hẹn</h1>
    <ul class="fb-list" id="ap-directory"><li>Đang tải…</li></ul>
    <h2>Xin lịch hẹn riêng</h2>
    <label for="ap-topic">Chủ đề</label>
    <select id="ap-topic">
      <option value="hoc_tap">Học tập</option>
      <option value="tinh_cam">Tình cảm / tâm tư</option>
      <option value="khac">Khác</option>
    </select>
    <label for="ap-note">Lời nhắn cho thầy cô</label>
    <textarea id="ap-note" maxlength="1000" rows="3"></textarea>
    <button class="fb-button" id="ap-send">Gửi yêu cầu</button>
    <h2>Yêu cầu của mình</h2>
    <ul class="fb-list" id="ap-list"></ul>
    <p id="ap-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#ap-status");

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderDirectory(rows) {
    const list = el.querySelector("#ap-directory");
    list.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có đầu mối trường nào được công bố.";
      list.appendChild(li);
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${row.public_name} — ` +
        (row.status === "verified" ? "Đã xác minh" : "Hết hạn xác minh");
      li.appendChild(label);
      if (row.phone && row.status === "verified") {
        const call = document.createElement("button");
        call.className = "fb-button fb-button--secondary";
        call.textContent = "Gọi";
        call.addEventListener("click", async () => {
          try {
            if (sdk && typeof sdk.openPhone === "function") {
              await sdk.openPhone({ phoneNumber: row.phone });
            } else {
              setStatus(`Số điện thoại: ${row.phone}`, "info");
            }
          } catch (err) {
            setStatus("Không mở được trình gọi.", "error");
          }
        });
        li.appendChild(call);
      }
      list.appendChild(li);
    }
  }

  const STATUS_TEXT = {
    submitted: "Đã gửi — chờ thầy cô tiếp nhận",
    assigned: "Thầy cô đã tiếp nhận",
    slot_proposed: "Có đề xuất giờ — chờ bạn xác nhận",
    scheduled: "Đã có lịch hẹn",
    cancelled: "Đã hủy",
    completed: "Đã hoàn thành",
  };

  function renderRequests(rows) {
    const list = el.querySelector("#ap-list");
    list.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có yêu cầu nào.";
      list.appendChild(li);
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent =
        `${STATUS_TEXT[row.status] || row.status} — ${row.topic}`;
      li.appendChild(label);
      const openSlot = (row.slots || []).find(
        (slot) => slot.status === "proposed");
      if (openSlot) {
        const accept = document.createElement("button");
        accept.className = "fb-button";
        accept.textContent = "Đồng ý giờ này";
        accept.addEventListener("click", async () => {
          try {
            await api.accept(row.request_id, openSlot.slot_id);
            setStatus("Đã xác nhận lịch hẹn.", "success");
            await loadRequests();
          } catch (err) {
            setStatus("Xác nhận chưa thành công (giờ có thể đã đổi).", "error");
          }
        });
        const decline = document.createElement("button");
        decline.className = "fb-button fb-button--secondary";
        decline.textContent = "Hỏi giờ khác";
        decline.addEventListener("click", async () => {
          try {
            await api.decline(row.request_id, openSlot.slot_id);
            await loadRequests();
          } catch (err) {
            setStatus("Không gửi được phản hồi.", "error");
          }
        });
        li.appendChild(accept);
        li.appendChild(decline);
      }
      list.appendChild(li);
    }
  }

  async function loadRequests() {
    try {
      const data = await api.list();
      renderRequests(data.results || []);
    } catch (err) {
      setStatus("Không tải được yêu cầu. Thử lại.", "error");
    }
  }

  el.querySelector("#ap-send").addEventListener("click", async () => {
    try {
      await api.create({ topic: el.querySelector("#ap-topic").value,
        note: el.querySelector("#ap-note").value.trim() });
      setStatus("Đã gửi yêu cầu. Chưa có lịch hẹn nào cho tới khi thầy cô đề xuất và bạn xác nhận.", "success");
      el.querySelector("#ap-note").value = "";
      await loadRequests();
    } catch (err) {
      const reason = err && err.details && err.details.reason;
      if (reason === "scheduling_no_staff") {
        setStatus("Lịch hẹn tạm tắt vì chưa có thầy/cô trực. Bạn vẫn gọi trực tiếp ở danh bạ trên.", "error");
      } else {
        setStatus("Không gửi được yêu cầu. Thử lại.", "error");
      }
    }
  });

  try {
    const data = await api.directory();
    renderDirectory(data.results || []);
  } catch (err) {
    renderDirectory([]);
  }
  await loadRequests();

  return {
    destroy() { el.remove(); },
  };
}
