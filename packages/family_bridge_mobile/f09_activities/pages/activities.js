// F09 activities page (US-037): published catalog (text-first, light),
// voluntary personal progress, and two-sided shared invites. No autoplay,
// no heavy media, no reminders — everything explicit and private.

export async function createPage({ root, params, ctx }) {
  const api = ctx.activitiesApi;
  const connections = ctx.connectionsApi || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Hoạt động kết nối</h1>
    <div id="act-kind" class="fb-chips" role="tablist"></div>
    <ul class="fb-list" id="act-list"><li>Đang tải…</li></ul>
    <h2>Hoạt động chung với người đồng hành</h2>
    <ul class="fb-list" id="act-invites"><li>Đang tải…</li></ul>
    <section id="act-invite-form" hidden>
      <p id="act-invite-content" class="fb-status"></p>
      <label for="act-recipient">Chọn người đồng hành</label>
      <select id="act-recipient"></select>
      <button class="fb-button" id="act-invite-send">Gửi lời mời</button>
    </section>
    <p id="act-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#act-status");
  let inviteTarget = null;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderCatalog(rows) {
    const list = el.querySelector("#act-list");
    list.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có hoạt động nào.";
      list.appendChild(li);
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${row.title} (${row.minutes} phút)`;
      const done = document.createElement("button");
      done.className = "fb-button fb-button--secondary";
      done.textContent = "Mình đã làm";
      done.addEventListener("click", async () => {
        try {
          await api.markProgress({ contentKey: row.content_key,
            contentRevision: row.revision, status: "done" });
          setStatus("Đã ghi nhận riêng cho bạn.", "success");
        } catch (err) {
          setStatus("Không ghi nhận được (hoạt động có thể đã nghỉ).", "error");
        }
      });
      const inviteBtn = document.createElement("button");
      inviteBtn.className = "fb-button fb-button--secondary";
      inviteBtn.textContent = "Mời làm cùng";
      inviteBtn.addEventListener("click", () => openInvite(row));
      li.appendChild(label);
      li.appendChild(done);
      li.appendChild(inviteBtn);
      list.appendChild(li);
    }
  }

  function renderInvites(rows) {
    const list = el.querySelector("#act-invites");
    list.textContent = "";
    for (const row of rows || []) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      const stateText = { pending: "Chờ phản hồi", accepted: "Cả hai cùng làm",
        declined: "Đã từ chối", cancelled: "Đã hủy" }[row.status] || row.status;
      label.textContent = `${row.content_key} — ${stateText}`;
      li.appendChild(label);
      if (row.direction === "received" && row.status === "pending") {
        const accept = document.createElement("button");
        accept.className = "fb-button";
        accept.textContent = "Đồng ý";
        accept.addEventListener("click", async () => {
          try {
            await api.respond(row.invite_id, "accept");
            await loadInvites();
          } catch (err) {
            setStatus("Không phản hồi được.", "error");
          }
        });
        const decline = document.createElement("button");
        decline.className = "fb-button fb-button--secondary";
        decline.textContent = "Từ chối";
        decline.addEventListener("click", async () => {
          try {
            await api.respond(row.invite_id, "decline");
            await loadInvites();
          } catch (err) {
            setStatus("Không phản hồi được.", "error");
          }
        });
        li.appendChild(accept);
        li.appendChild(decline);
      }
      if (row.direction === "sent" && row.status === "pending") {
        const cancel = document.createElement("button");
        cancel.className = "fb-button fb-button--secondary";
        cancel.textContent = "Hủy lời mời";
        cancel.addEventListener("click", async () => {
          try {
            await api.cancel(row.invite_id);
            await loadInvites();
          } catch (err) {
            setStatus("Không hủy được.", "error");
          }
        });
        li.appendChild(cancel);
      }
      list.appendChild(li);
    }
  }

  async function openInvite(row) {
    inviteTarget = row;
    el.querySelector("#act-invite-content").textContent =
      `Mời làm cùng: ${row.title}`;
    const select = el.querySelector("#act-recipient");
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
      } catch (err) { /* connection gated server-side */ }
    }
    el.querySelector("#act-invite-form").hidden = false;
  }

  el.querySelector("#act-invite-send").addEventListener("click", async () => {
    if (!inviteTarget) return;
    const inviteeId = el.querySelector("#act-recipient").value;
    if (!inviteeId) {
      setStatus("Chọn người đồng hành trước.", "error");
      return;
    }
    try {
      await api.invite({ contentKey: inviteTarget.content_key,
        contentRevision: inviteTarget.revision, inviteeId });
      setStatus("Đã gửi lời mời. Mỗi người tự đánh dấu phần mình.", "success");
      el.querySelector("#act-invite-form").hidden = true;
      inviteTarget = null;
      await loadInvites();
    } catch (err) {
      setStatus("Không gửi được lời mời. Kiểm tra kết nối rồi thử lại.", "error");
    }
  });

  async function loadCatalog(kind) {
    try {
      const data = await api.catalog(kind || undefined, undefined);
      renderCatalog(data.results || []);
    } catch (err) {
      setStatus("Không tải được hoạt động. Thử lại.", "error");
    }
  }

  async function loadInvites() {
    try {
      const data = await api.invites();
      renderInvites(data.results || []);
    } catch (err) { /* non-blocking */ }
  }

  const chips = el.querySelector("#act-kind");
  for (const [code, label] of [["", "Tất cả"], ["activity", "Hoạt động"],
    ["micro_lesson", "Bài học 1 phút"]]) {
    const chip = document.createElement("button");
    chip.className = "fb-chip";
    chip.textContent = label;
    chip.setAttribute("role", "tab");
    chip.addEventListener("click", () => loadCatalog(code));
    chips.appendChild(chip);
  }

  await Promise.all([loadCatalog(""), loadInvites()]);

  return {
    destroy() { el.remove(); },
  };
}
