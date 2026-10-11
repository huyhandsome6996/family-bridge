// F13 help page (US-039): verified contacts with honest status, tap to
// call (SDK openPhone ONLY on the user's own tap), guidance when data is
// expired/fallback, and ZERO gates — reachable from anywhere in the app
// regardless of auth/backend state. No call history is stored.

export async function createPage({ root, params, ctx }) {
  const api = ctx.helpApi;
  const sdk = ctx.sdk || null; // zmp-sdk adapter (mock in preview)
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Tìm trợ giúp</h1>
    <p class="fb-status">Trang này Luôn mở — không cần hoàn thành gì trước.
    Bạn chỉ được chuyển tới gọi khi tự bấm.</p>
    <ul class="fb-list" id="help-list"><li>Đang tải…</li></ul>
    <p id="help-note" class="fb-status"></p>
    <p id="help-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#help-status");
  const note = el.querySelector("#help-note");

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderContacts(contacts) {
    const list = el.querySelector("#help-list");
    list.textContent = "";
    if (!contacts.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có đầu mối nào để hiển thị.";
      list.appendChild(li);
      return;
    }
    for (const contact of contacts) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = contact.public_name;
      const state = document.createElement("small");
      state.textContent = contact.status === "verified"
        ? (contact.open_now ? "Đang trực" : "Ngoài giờ phục vụ")
        : "Hết hạn xác minh — không hiển thị số";
      li.appendChild(name);
      li.appendChild(state);
      if (contact.phone && contact.status === "verified") {
        const call = document.createElement("button");
        call.className = "fb-button";
        call.textContent = "Gọi";
        call.addEventListener("click", async () => {
          // Explicit user action ONLY; openPhone resolving does NOT mean
          // the call was answered — the UI never claims it was.
          setStatus("Đang mở trình gọi…", "info");
          try {
            if (sdk && typeof sdk.openPhone === "function") {
              await sdk.openPhone({ phoneNumber: contact.phone });
              setStatus("Đã mở trình gọi của điện thoại.", "success");
            } else {
              setStatus(`Số điện thoại: ${contact.phone}`, "info");
            }
          } catch (err) {
            setStatus("Không mở được trình gọi. Bạn vẫn có thể gọi thủ công.",
              "error");
          }
        });
        li.appendChild(call);
      }
      list.appendChild(li);
    }
  }

  try {
    const data = await api.directory();
    renderContacts(data.contacts || []);
    if (data.fallback) {
      note.textContent = data.guidance
        || "Đang dùng danh bạ dự phòng đã xác minh kèm bản dựng.";
    } else {
      note.textContent = "";
    }
  } catch (err) {
    setStatus("Không tải được danh bạ. Hãy liên hệ người tin cậy hoặc thử lại.",
      "error");
  }

  return {
    destroy() { el.remove(); },
  };
}
