// F04 refine page (US-029/US-033) — hợp đồng v1: the author pastes/types the
// harsh words, sees the notice about what gets sent (ONLY that sentence),
// asks AI to rewrite, then edits/accepts/discards. Manual writing ALWAYS
// works: when AI is off or fails, the composer stays usable and nothing
// breaks. Accepted text is handed back via ctx (onAccept) — sending still
// goes through the common preview-recipient-confirm flow (F05/F06).
//
// Contract v1 sync (mirror of zalo-mini-app compose/message):
// - Response DTO is rendered as-is; the only text field is `suggested_text`.
// - inputRevision (C4): starts at 1, incremented on EVERY input event of the
//   original textarea, sent with refine. The suggestion is bound to the
//   revision it was created from; editing before/during/after the response
//   marks it STALE: warning shown, "Dùng lời này" DISABLED — the stale
//   suggestion can never overwrite newer text. Re-checked at apply click.

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
      <p id="ai-stale" class="fb-status fb-status--error" role="alert" hidden>
        Nội dung đã thay đổi kể từ khi tạo gợi ý — gợi ý này được tạo từ bản
        trước. Nút "Dùng lời này" tạm khóa để không ghi đè chữ bạn vừa sửa.
      </p>
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
  const staleNotice = el.querySelector("#ai-stale");
  const refineBtn = el.querySelector("#ai-refine-btn");
  const acceptBtn = el.querySelector("#ai-accept");
  const manualNotice = el.querySelector("#ai-manual");
  let current = null; // { dto, boundRevision }
  let busy = false;
  let applying = false;
  let inputRevision = 1; // C4: tăng MỖI input event trên ô original

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function isStale() {
    return current && current.boundRevision !== inputRevision;
  }

  function renderStale() {
    const stale = isStale();
    if (staleNotice) staleNotice.hidden = !stale;
    if (acceptBtn) acceptBtn.disabled = stale || applying;
  }

  originalEl.addEventListener("input", () => {
    inputRevision += 1;
    if (current) renderStale(); // gợi ý cũ thành STALE ngay khi gõ
  });

  refineBtn.addEventListener("click", async () => {
    if (busy) return;
    const text = originalEl.value.trim();
    if (!text) {
      setStatus("Hãy nhập lời bạn muốn viết lại trước.", "error");
      return;
    }
    busy = true;
    refineBtn.disabled = true;
    try {
      // Key bound to the exact sentence: safe retry, no double provider cost.
      // inputRevision (C4) binds the suggestion to this revision of the text.
      const revisionAtRequest = inputRevision;
      const data = await api.refine({ text, key: `ai-refine-${Date.now()}`, inputRevision: revisionAtRequest });
      if (!data || !data.suggestion_id
        || typeof data.suggested_text !== "string"
        || !data.suggested_text.trim()) {
        throw new Error("invalid_suggestion");
      }
      const echo = Number(data.input_revision);
      current = {
        dto: data,
        boundRevision: Number.isFinite(echo) && echo > 0 ? echo : revisionAtRequest,
      };
      el.querySelector("#ai-suggested").textContent = data.suggested_text;
      editableEl.value = data.suggested_text; // value — never innerHTML
      result.hidden = false;
      manualNotice.hidden = true;
      renderStale();
      setStatus("");
    } catch (err) {
      result.hidden = true;
      current = null;
      manualNotice.hidden = false;
      const reason = err && err.details && err.details.reason;
      if (err && err.code === "consent_required") {
        setStatus("Cần đồng ý xử lý AI trước khi tạo gợi ý. Bạn vẫn viết tay và gửi bình thường.", "error");
      } else if (reason === "provider_quota_exceeded") {
        setStatus("Hết lượt AI trong thời gian này. Hãy viết tay nhé.", "error");
      } else {
        setStatus("AI chưa phản hồi. Bạn vẫn viết tay và gửi bình thường.", "error");
      }
    } finally {
      busy = false;
      refineBtn.disabled = false;
    }
  });

  acceptBtn.addEventListener("click", async () => {
    if (!current || applying) return;
    // C4: re-check the revision AT CLICK TIME — an edited text is never
    // silently overwritten by an older suggestion.
    if (isStale()) {
      renderStale();
      setStatus("Gợi ý đã cũ sau khi bạn sửa nội dung — hãy nhờ AI viết lại hoặc viết tay.", "error");
      return;
    }
    applying = true;
    acceptBtn.disabled = true;
    try {
      await api.accept(current.dto.suggestion_id);
      // Hand the FINAL text back; sending stays explicit downstream.
      if (typeof ctx.onAcceptText === "function") {
        ctx.onAcceptText(editableEl.value.trim());
      }
      setStatus("Đã chọn lời này. Kiểm tra lại người nhận rồi bấm gửi nhé.",
        "success");
      result.hidden = true;
      current = null;
    } catch (err) {
      setStatus("Không ghi nhận được lựa chọn. Thử lại.", "error");
    } finally {
      applying = false;
      if (current) renderStale();
    }
  });

  el.querySelector("#ai-discard").addEventListener("click", async () => {
    if (!current) return;
    const suggestionId = current.dto.suggestion_id;
    try {
      await api.discard(suggestionId);
    } catch (err) { /* discard is best-effort; text stays editable */ }
    result.hidden = true;
    staleNotice.hidden = true;
    setStatus("Đã bỏ gợi ý. Lời bạn viết vẫn giữ nguyên.", "info");
    current = null;
  });

  return {
    destroy() {
      el.remove();
    },
  };
}
