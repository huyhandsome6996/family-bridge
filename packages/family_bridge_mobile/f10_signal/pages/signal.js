// F10 signal page (US-032): the always-visible "Con cần được lắng nghe"
// entry — choose a need, choose ONE connected recipient, see the exact
// preview, confirm. After sending without response: honest status plus the
// MANUAL paths (contact another supporter / open help directory) — never
// auto-escalation. The help route stays reachable in EVERY state, including
// send failure and no connection.

export async function createPage({ root, params, ctx }) {
  const api = ctx.signalApi;
  const connections = ctx.connectionsApi || null;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Con cần được lắng nghe</h1>
    <div id="sig-needs" class="fb-chips" role="radiogroup" aria-label="Chọn nhu cầu"></div>
    <label for="sig-recipient">Gửi tới</label>
    <select id="sig-recipient"></select>
    <button class="fb-button fb-button--secondary" id="sig-preview">Xem lại trước khi gửi</button>
    <section id="sig-confirm" hidden>
      <p id="sig-confirm-body" class="fb-card-body"></p>
      <p id="sig-confirm-recipient" class="fb-status"></p>
      <button class="fb-button" id="sig-send">Gửi tín hiệu này</button>
    </section>
    <section id="sig-after" hidden>
      <p id="sig-after-state" class="fb-status"></p>
      <p id="sig-after-help" class="fb-status">Nếu chưa được trả lời, bạn có thể
      tự chọn liên hệ điểm tựa khác hoặc mở Trang tìm trợ giúp bất cứ lúc nào.</p>
      <a class="fb-button fb-button--secondary" href="#/help" id="sig-help-link">Mở Trang tìm trợ giúp</a>
    </section>
    <p id="sig-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#sig-status");
  let selectedNeed = null;
  let sending = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderNeeds(needs) {
    const wrap = el.querySelector("#sig-needs");
    wrap.textContent = "";
    for (const item of needs) {
      const chip = document.createElement("button");
      chip.className = "fb-chip";
      chip.setAttribute("role", "radio");
      chip.textContent = item.label;
      chip.addEventListener("click", () => {
        selectedNeed = item.need;
        for (const sibling of wrap.children) {
          sibling.setAttribute("aria-checked", "false");
        }
        chip.setAttribute("aria-checked", "true");
      });
      wrap.appendChild(chip);
    }
  }

  async function loadRecipients() {
    const select = el.querySelector("#sig-recipient");
    select.textContent = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "— Chưa có người nhận —";
    select.appendChild(empty);
    if (!connections) return;
    try {
      const data = await connections.listActive();
      for (const conn of data.results || []) {
        const opt = document.createElement("option");
        opt.value = conn.counterparty_id || conn.party_b;
        opt.textContent = conn.display_name || "Người đồng hành";
        select.appendChild(opt);
      }
    } catch (err) {
      setStatus("Chưa tải được danh sách người nhận.", "error");
    }
  }

  el.querySelector("#sig-preview").addEventListener("click", async () => {
    if (!selectedNeed) {
      setStatus("Hãy chọn nhu cầu trước.", "error");
      return;
    }
    const recipientId = el.querySelector("#sig-recipient").value;
    if (!recipientId) {
      setStatus("Hãy chọn người nhận đã kết nối — hoặc mở Trang tìm trợ giúp.",
        "error");
      return;
    }
    try {
      const preview = await api.preview({ need: selectedNeed, recipientId });
      el.querySelector("#sig-confirm-body").textContent = preview.body;
      el.querySelector("#sig-confirm-recipient").textContent =
        "Gửi tới người đồng hành đã chọn";
      el.querySelector("#sig-confirm").hidden = false;
      setStatus("");
    } catch (err) {
      el.querySelector("#sig-after").hidden = false;
      setStatus("Chưa gửi được signal. Bạn vẫn mở được Trang tìm trợ giúp.",
        "error");
    }
  });

  el.querySelector("#sig-send").addEventListener("click", async () => {
    if (sending || !selectedNeed) return;
    const recipientId = el.querySelector("#sig-recipient").value;
    sending = true;
    el.querySelector("#sig-send").disabled = true;
    try {
      await api.send({ need: selectedNeed, recipientId,
        key: `signal-${Date.now()}` });
      el.querySelector("#sig-confirm").hidden = true;
      el.querySelector("#sig-after-state").textContent =
        "Đã gửi tín hiệu. Bố mẹ sẽ thấy trong Hộp thư — không ai bảo đảm trả lời ngay.";
      el.querySelector("#sig-after").hidden = false;
      setStatus("");
    } catch (err) {
      setStatus("Gửi chưa thành công. Thử lại, hoặc mở Trang tìm trợ giúp.",
        "error");
      el.querySelector("#sig-send").disabled = false;
    } finally {
      sending = false;
    }
  });

  try {
    const meta = await api.meta();
    renderNeeds(meta.needs || []);
  } catch (err) {
    setStatus("Không tải được danh sách nhu cầu. Thử lại sau.", "error");
  }
  await loadRecipients();

  return {
    destroy() { el.remove(); },
  };
}
