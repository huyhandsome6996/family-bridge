// F04 refine page (US-029/US-033): the author pastes/types the harsh words,
// sees the notice about what gets sent (ONLY that sentence), asks AI to
// rewrite, then edits/accepts/discards. Manual writing ALWAYS works: when
// AI is off or fails, the composer stays usable and nothing breaks.
// Accepted text is handed back via ctx (onAccept) — sending still goes
// through the common preview-recipient-confirm flow (F05/F06).

export async function createPage({ root, params, ctx }) {
  const api = ctx.aiApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Nhờ AI giúp diễn đạt</h1>
    <p class="fb-status" id="ai-notice">
      Chỉ câu bạn nhập bên dưới được gửi tới AI để viết lại. Không gửi
      lịch sử, nhật ký hay bất kỳ dữ liệu nào khác.
    </p>
    <label for="ai-original">Lời bạn đang định nói</label>
    <textarea id="ai-original" maxlength="4000" rows="4"></textarea>
    <button class="fb-button fb-button--secondary" id="ai-refine-btn">Nhờ AI viết lại</button>
    <section id="ai-result" hidden>
      <h2>Gợi ý của AI</h2>
      <p id="ai-suggested" class="fb-card-body"></p>
      <label for="ai-editable">Sửa lại nếu muốn (bạn quyết định lời cuối)</label>
      <textarea id="ai-editable" maxlength="4000" rows="4"></textarea>
      <button class="fb-button" id="ai-accept">Dùng lời này</button>
      <button class="fb-button fb-button--secondary" id="ai-discard">Bỏ gợi ý</button>
    </section>
    <section id="ai-manual" hidden>
      <p>AI tạm không khả dụng — bạn vẫn viết tay bình thường và gửi như thường lệ.</p>
    </section>
    <p id="ai-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#ai-status");
  const originalEl = el.querySelector("#ai-original");
  const editableEl = el.querySelector("#ai-editable");
  const result = el.querySelector("#ai-result");
  const manualNotice = el.querySelector("#ai-manual");
  let currentId = null;
  let busy = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  el.querySelector("#ai-refine-btn").addEventListener("click", async () => {
    if (busy) return;
    const text = originalEl.value.trim();
    if (!text) {
      setStatus("Hãy nhập lời bạn muốn viết lại trước.", "error");
      return;
    }
    busy = true;
    el.querySelector("#ai-refine-btn").disabled = true;
    try {
      // Key bound to the exact sentence: safe retry, no double provider cost.
      const data = await api.refine({ text, key: `ai-refine-${Date.now()}` });
      currentId = data.suggestion_id;
      el.querySelector("#ai-suggested").textContent = data.suggested_text;
      editableEl.value = data.suggested_text;
      result.hidden = false;
      manualNotice.hidden = true;
      setStatus("");
    } catch (err) {
      result.hidden = true;
      manualNotice.hidden = false;
      const reason = err && err.details && err.details.reason;
      if (reason === "provider_quota_exceeded") {
        setStatus("Hết lượt AI trong thời gian này. Hãy viết tay nhé.", "error");
      } else {
        setStatus("AI chưa phản hồi. Bạn vẫn viết tay và gửi bình thường.", "error");
      }
    } finally {
      busy = false;
      el.querySelector("#ai-refine-btn").disabled = false;
    }
  });

  el.querySelector("#ai-accept").addEventListener("click", async () => {
    if (!currentId) return;
    try {
      await api.accept(currentId);
      // Hand the FINAL text back; sending stays explicit downstream.
      if (typeof ctx.onAcceptText === "function") {
        ctx.onAcceptText(editableEl.value.trim());
      }
      setStatus("Đã chọn lời này. Kiểm tra lại người nhận rồi bấm gửi nhé.",
        "success");
      result.hidden = true;
      currentId = null;
    } catch (err) {
      setStatus("Không ghi nhận được lựa chọn. Thử lại.", "error");
    }
  });

  el.querySelector("#ai-discard").addEventListener("click", async () => {
    if (!currentId) return;
    try {
      await api.discard(currentId);
    } catch (err) { /* discard is best-effort; text stays editable */ }
    result.hidden = true;
    setStatus("Đã bỏ gợi ý. Lời bạn viết vẫn giữ nguyên.", "info");
    currentId = null;
  });

  return {
    destroy() {
      el.remove();
    },
  };
}
