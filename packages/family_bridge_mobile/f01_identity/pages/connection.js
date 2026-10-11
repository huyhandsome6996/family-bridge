// F01 connection page (FL-02/FL-03): create/enter invite code, show pending
// states, confirm, revoke. No auto-anything: every action is a user tap and
// the raw code is displayed once, never stored in public storage.

export async function createPage({ root, params, ctx }) {
  const api = ctx.identityApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Kết nối người đồng hành</h1>
    <section class="fb-card" id="create-section">
      <h2>Tạo lời mời</h2>
      <button class="fb-button fb-button--primary" id="create-invite">Tạo mã mời</button>
      <p id="invite-code" aria-live="polite" style="font-size:24px;font-weight:700"></p>
      <p id="invite-note" class="fb-status fb-status--info" hidden></p>
    </section>
    <section class="fb-card">
      <h2>Nhập mã được chia sẻ</h2>
      <label class="fb-label" for="code-input">Mã mời</label>
      <input id="code-input" class="fb-input" maxlength="12" autocomplete="off" />
      <button class="fb-button fb-button--primary" id="claim-btn">Xác nhận mã</button>
    </section>
    <section class="fb-card">
      <h2>Kết nối đang hoạt động</h2>
      <ul class="fb-list" id="connections"><li>Đang tải…</li></ul>
    </section>
    <p><a href="${ctx.helpHref || "#/help"}">Tìm trợ giúp ngay</a></p>
    <p id="page-status" class="fb-status" role="status" aria-live="polite"></p>
  `;

  const status = el.querySelector("#page-status");
  const codeEl = el.querySelector("#invite-code");
  const connectionsEl = el.querySelector("#connections");
  let pollTimer = null;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function refreshConnections() {
    try {
      const data = await api.listConnections();
      connectionsEl.replaceChildren();
      if (!data.results.length) {
        const li = document.createElement("li");
        li.textContent = "Chưa có kết nối nào. Tạo mã mời hoặc nhập mã để bắt đầu.";
        connectionsEl.appendChild(li);
        return;
      }
      for (const connection of data.results) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = (connection.relationship_kind === "backup"
          ? "Điểm tựa dự phòng" : "Người đồng hành") + " — đang kết nối";
        const revokeBtn = document.createElement("button");
        revokeBtn.className = "fb-button fb-button--danger";
        revokeBtn.textContent = "Hủy kết nối";
        revokeBtn.addEventListener("click", async () => {
          if (!window.confirm("Hủy kết nối? Quyền đã chia sẻ sẽ bị thu hồi và không hồi sinh khi kết nối lại.")) return;
          try {
            await api.revokeConnection(connection.connection_id);
            setStatus("Đã hủy kết nối.", "success");
            refreshConnections();
          } catch (err) {
            setStatus("Không hủy được. Thử lại sau.", "error");
          }
        });
        li.append(label, document.createTextNode(" "), revokeBtn);
        connectionsEl.appendChild(li);
      }
    } catch (err) {
      connectionsEl.replaceChildren();
      const li = document.createElement("li");
      li.textContent = "Không tải được danh sách kết nối.";
      connectionsEl.appendChild(li);
    }
  }

  el.querySelector("#create-invite").addEventListener("click", async (event) => {
    event.target.disabled = true;
    try {
      const data = await api.createInvite("primary");
      codeEl.textContent = data.code;
      const note = el.querySelector("#invite-note");
      note.hidden = false;
      note.textContent = "Chỉ hiện một lần. Gửi cho người thân để họ nhập vào ứng dụng.";
      setStatus("Đã tạo lời mời. Chờ người kia xác nhận.", "success");
    } catch (err) {
      setStatus("Không tạo được lời mời. Thử lại.", "error");
    } finally {
      event.target.disabled = false;
    }
  });

  el.querySelector("#claim-btn").addEventListener("click", async (event) => {
    const input = el.querySelector("#code-input");
    event.target.disabled = true;
    try {
      const data = await api.claimInvite(input.value.trim());
      setStatus("Đã xác nhận phía bạn. Chờ người tạo lời mời xác nhận.", "success");
    } catch (err) {
      setStatus(err.code === "rate_limited"
        ? "Bạn đã thử quá nhiều lần. Chờ ít phút rồi thử lại."
        : "Mã không đúng hoặc đã hết hạn.", err.code === "rate_limited" ? "warning" : "error");
    } finally {
      event.target.disabled = false;
    }
  });

  refreshConnections();
  // Poll open invitations while the page is visible (bounded, DSA-10)
  let cancelled = false;
  pollTimer = setInterval(() => {
    if (cancelled || document.hidden) return;
    refreshConnections();
  }, 30000);

  return {
    el,
    destroy() {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    },
  };
}
