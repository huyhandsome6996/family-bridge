// tests/f11-supporters.test.mjs — Kiểm thử tính năng F11: "Điểm tựa dự phòng" (US-022 & US-035)
// Chạy: node --test tests/f11-supporters.test.mjs

import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/f11_supporters.html" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it, beforeEach } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

function stubFetch(impl) {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = previous; };
}

function jsonResponse(data, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

function setupF11DOM() {
  document.body.innerHTML = `
    <div class="phone-frame">
      <header class="zalo-header">
        <h1 class="zalo-header__title">Điểm tựa dự phòng</h1>
      </header>
      <main class="app-content">
        <div id="status-alert-success" class="status-alert status-alert--success" style="display:none;">
          <span id="status-success-text"></span>
        </div>
        <div id="status-alert-error" class="status-alert status-alert--error" style="display:none;">
          <span id="status-error-text"></span>
        </div>
        <div id="sup-list" class="supporter-list"></div>
        <div id="sup-no-supporter" class="empty-state" style="display:none;">Chưa có điểm tựa nào.</div>
        
        <section id="sup-invite-section" style="display:none;">
          <select id="sup-recipient-select"><option value="">Chọn</option></select>
          <select id="sup-kind-select"><option value="teacher">Thầy cô</option></select>
          <button type="button" id="sup-invite-send">Gửi lời mời</button>
          <button type="button" id="sup-invite-cancel">Hủy</button>
        </section>

        <section id="sup-contact-section" style="display:none;">
          <p id="sup-contact-target"></p>
          <textarea id="sup-body" maxlength="4000"></textarea>
          <button type="button" id="sup-contact-send">Gửi lời nhắn</button>
          <button type="button" id="sup-contact-cancel">Hủy</button>
        </section>

        <section id="sup-suggest-section" style="display:none;">
          <button type="button" id="sup-suggest-another">Chọn điểm tựa khác</button>
          <a href="f13_help.html" id="sup-suggest-help">Mở Trang tìm trợ giúp</a>
        </section>

        <a href="f13_help.html" id="sup-help-link">Mở Trang tìm trợ giúp</a>
      </main>
      <div id="qa-f11-toolbar-container"></div>
    </div>
  `;
}

describe("Tính năng F11: Điểm tựa dự phòng (US-022 & US-035)", () => {
  beforeEach(() => {
    setupF11DOM();
  });

  it("F11-01: Chỉ hiển thị các điểm tựa active và can_contact = true (DOM cleansing)", async () => {
    const { loadSupporters } = await import("../f11_supporters.js");

    const mockRoles = [
      { role_id: "r1", supporter_name: "Cô Mai (Tư vấn)", relationship_kind: "teacher", status: "active", can_contact: true },
      { role_id: "r2", supporter_name: "Bác Nam (Đã dừng)", relationship_kind: "family", status: "revoked", can_contact: false },
      { role_id: "r3", supporter_name: "Thầy Hùng (Hết hạn)", relationship_kind: "teacher", status: "expired", can_contact: false },
    ];

    const restoreFetch = stubFetch(async () => jsonResponse(mockRoles));

    try {
      await loadSupporters();

      const cards = document.querySelectorAll(".supporter-card");
      assert.equal(cards.length, 1, "Chỉ hiển thị đúng 1 thẻ điểm tựa active");
      assert.match(cards[0].textContent, /Cô Mai/, "Hiển thị đúng tên người đồng hành");
      assert.doesNotMatch(document.getElementById("sup-list").textContent, /Bác Nam/, "Không render người đã revoked");
      assert.doesNotMatch(document.getElementById("sup-list").textContent, /Thầy Hùng/, "Không render người đã expired");
    } finally {
      restoreFetch();
    }
  });

  it("F11-02: DTO gửi tin chỉ chứa duy nhất trường `body`, không rò rỉ dữ liệu ngoài", async () => {
    const { openContactSection, sendContactMessage } = await import("../f11_supporters.js");

    let capturedPayload = null;
    let capturedUrl = null;

    const restoreFetch = stubFetch(async (url, opts) => {
      capturedUrl = url;
      capturedPayload = JSON.parse(opts.body);
      return jsonResponse({ success: true, message_id: "msg-1" }, { status: 201 });
    });

    try {
      openContactSection("r1", "Cô Mai");
      document.getElementById("sup-body").value = "Em cần cô tư vấn một chút về bài vở ạ.";

      await sendContactMessage();

      assert.ok(capturedUrl.includes("/roles/r1/contact"), "Gọi đúng endpoint contact");
      assert.deepEqual(Object.keys(capturedPayload), ["body"], "Payload chỉ chứa duy nhất thuộc tính body");
      assert.equal(capturedPayload.body, "Em cần cô tư vấn một chút về bài vở ạ.");
      assert.equal(document.getElementById("status-alert-success").style.display, "flex", "Hiển thị thông báo thành công");
      assert.equal(document.getElementById("sup-suggest-section").style.display, "flex", "Hiển thị phần gợi ý sau khi gửi");
    } finally {
      restoreFetch();
    }
  });

  it("F11-03: Liên kết thường trực tới F13 Emergency Help", async () => {
    const link = document.getElementById("sup-help-link");
    assert.ok(link, "Link F13 phải tồn tại");
    assert.equal(link.getAttribute("href"), "f13_help.html", "Dẫn đúng tới f13_help.html");
  });

  it("F11-04: Cô lập QA Mock Toolbar ở môi trường mặc định", async () => {
    const { initQaToolbar } = await import("../f11_supporters.js");

    initQaToolbar();
    const toolbar = document.getElementById("qa-f11-toolbar");
    assert.equal(toolbar, null, "Không render mock toolbar ở môi trường mặc định");
  });
});
