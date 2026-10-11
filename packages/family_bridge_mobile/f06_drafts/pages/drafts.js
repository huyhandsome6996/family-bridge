// F06 drafts page (US-030/US-034): editor with save, deliberate pause
// (server-owned 300s countdown via monotonic ticks), preview after the
// deadline, FINAL confirm. Timer ticks are cleaned up on destroy; editing
// during pause never shortens the wait; expiry never sends anything —
// confirm is always a human tap.

import { remainingSeconds } from "../api.js";

export async function createPage({ root, params, ctx }) {
  const api = ctx.draftsApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Nháp và tạm dừng 5 phút</h1>
    <label for="draft-body">Lời bạn muốn gửi</label>
    <textarea id="draft-body" maxlength="4000" rows="4"></textarea>
    <label for="draft-recipient">Người nhận</label>
    <select id="draft-recipient"></select>
    <button class="fb-button fb-button--secondary" id="draft-save">Lưu nháp</button>
    <button class="fb-button" id="draft-pause" hidden>Bắt đầu tạm dừng 5 phút</button>
    <p id="draft-countdown" class="fb-status" role="timer" hidden></p>
    <button class="fb-button fb-button--secondary" id="draft-cancel-pause" hidden>Hủy tạm dừng</button>
    <button class="fb-button fb-button--secondary" id="draft-preview" hidden>Xem lại trước khi gửi</button>
    <section id="draft-confirm" hidden>
      <p id="draft-confirm-text" class="fb-card-body"></p>
      <p id="draft-confirm-recipient" class="fb-status"></p>
      <button class="fb-button" id="draft-send">Gửi lúc này</button>
    </section>
    <p id="draft-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#draft-status");
  const bodyEl = el.querySelector("#draft-body");
  const recipientEl = el.querySelector("#draft-recipient");
  const countdownEl = el.querySelector("#draft-countdown");
  let draftId = null;
  let previewId = null;
  let deadline = null;   // {deadlineIso, serverTimeIso, deviceFetchMs}
  let tickTimer = null;
  let sending = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function startTicker() {
    stopTicker();
    tickTimer = setInterval(() => {
      if (!deadline) return;
      const remaining = remainingSeconds({
        deadlineIso: deadline.deadlineIso,
        serverTimeIso: deadline.serverTimeIso,
        deviceNowMs: performance.now(),
        deviceFetchMs: deadline.deviceFetchMs,
      });
      countdownEl.textContent =
        `Tạm dừng còn ${remaining} giây để bạn kịp xem lại.`;
      if (remaining <= 0) {
        stopTicker();
        countdownEl.textContent =
          "Đã đủ 5 phút. Xem lại lời nháp rồi quyết định gửi hay sửa.";
        el.querySelector("#draft-preview").hidden = false;
      }
    }, 1000);
  }

  function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  async function saveDraft() {
    const body = bodyEl.value.trim();
    if (!body) { setStatus("Hãy viết lời trước khi lưu.", "error"); return; }
    const data = draftId
      ? await api.edit(draftId, { body, recipientId: recipientEl.value })
      : await api.create({ kind: "text", body,
          recipientId: recipientEl.value });
    draftId = data.draft_id;
    // Editing never shortens an existing pause: refresh deadline state.
    deadline = data.pause ? { deadlineIso: data.pause.deadline,
      serverTimeIso: data.server_time || data.pause.deadline,
      deviceFetchMs: performance.now() } : null;
    setStatus("Đã lưu nháp.", "success");
  }

  el.querySelector("#draft-save").addEventListener("click", async () => {
    try {
      await saveDraft();
      el.querySelector("#draft-pause").hidden = false;
    } catch (err) {
      setStatus("Không lưu được nháp. Thử lại.", "error");
    }
  });

  el.querySelector("#draft-pause").addEventListener("click", async () => {
    if (!draftId) return;
    try {
      const data = await api.pause(draftId);
      deadline = data.pause ? { deadlineIso: data.pause.deadline,
        serverTimeIso: data.server_time,
        deviceFetchMs: performance.now() } : null;
      countdownEl.hidden = false;
      el.querySelector("#draft-cancel-pause").hidden = false;
      el.querySelector("#draft-preview").hidden = true;
      startTicker();
      setStatus("Tạm dừng 5 phút do máy chủ quyết định. Đổi giờ máy không rút ngắn.", "info");
    } catch (err) {
      setStatus("Không bắt đầu được tạm dừng. Thử lại.", "error");
    }
  });

  el.querySelector("#draft-cancel-pause").addEventListener("click", async () => {
    if (!draftId) return;
    try {
      await api.cancelPause(draftId);
      stopTicker();
      deadline = null;
      countdownEl.hidden = true;
      el.querySelector("#draft-preview").hidden = true;
      setStatus("Đã hủy tạm dừng. Bạn có thể sửa và lưu lại.", "info");
    } catch (err) {
      setStatus("Không hủy được. Thử lại.", "error");
    }
  });

  el.querySelector("#draft-preview").addEventListener("click", async () => {
    if (!draftId) return;
    try {
      const preview = await api.preview(draftId);
      previewId = preview.preview_id;
      const detail = await api.detail(draftId);
      el.querySelector("#draft-confirm-text").textContent = detail.body;
      el.querySelector("#draft-confirm-recipient").textContent =
        "Gửi tới người đồng hành đã chọn";
      el.querySelector("#draft-confirm").hidden = false;
      setStatus("Kiểm tra kỹ rồi mới bấm gửi nhé.", "info");
    } catch (err) {
      const code = err && err.code;
      if (code === "cooldown_active") {
        setStatus("Chưa đủ 5 phút tạm dừng. Chờ hết giờ rồi xem lại.", "error");
      } else if (code === "preview_stale") {
        setStatus("Nháp đã đổi sau khi xem trước. Xem lại lần nữa.", "error");
      } else {
        setStatus("Không xem trước được. Thử lại.", "error");
      }
    }
  });

  el.querySelector("#draft-send").addEventListener("click", async () => {
    if (!draftId || !previewId || sending) return;
    sending = true;
    el.querySelector("#draft-send").disabled = true;
    try {
      await api.confirmSend(draftId, previewId);
      setStatus("Đã gửi. Lời nháy của bạn đã đi tới người nhận.", "success");
      el.querySelector("#draft-confirm").hidden = true;
      bodyEl.value = "";
      draftId = null; previewId = null; deadline = null;
      stopTicker(); countdownEl.hidden = true;
    } catch (err) {
      const code = err && err.code;
      if (code === "preview_stale") {
        setStatus("Nội dung/đã dùng rồi — hãy xem lại trước khi gửi.", "error");
      } else if (code === "cooldown_active") {
        setStatus("Tạm dừng chưa xong.", "error");
      } else {
        setStatus("Gửi chưa thành công. Lời nháp vẫn được giữ.", "error");
      }
      el.querySelector("#draft-send").disabled = false;
    } finally {
      sending = false;
    }
  });

  return {
    destroy() {
      stopTicker();  // cleanup tick on unmount (contract 6.3)
      el.remove();
    },
  };
}
