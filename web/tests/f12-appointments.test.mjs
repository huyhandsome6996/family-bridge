// tests/f12-appointments.test.mjs — Kiểm thử tính năng F12: "Thầy cô và lịch hẹn" (US-038 & US-046)
// Tiêu chuẩn nghiệm thu: F12-AC-01 → F12-AC-08 (theo PM directive)
// Chạy: node --test tests/f12-appointments.test.mjs

// ---------------------------------------------------------------- globals (happy-dom)
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/f12_appointments.html" });

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

// ---------------------------------------------------------------- helpers
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

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

// Cấu trúc DOM của f12_appointments.html
function setupF12DOM() {
  document.body.innerHTML = `
    <div class="phone-frame">
      <header class="zalo-header">
        <h1 class="zalo-header__title">Thầy cô và lịch hẹn</h1>
      </header>
      <main class="app-content">
        <div id="status-alert-success" class="status-alert status-alert--success" style="display: none;">
          <span id="status-success-text"></span>
        </div>
        <div id="status-alert-error" class="status-alert status-alert--error" style="display: none;">
          <span id="status-error-text"></span>
        </div>

        <section class="card-section">
          <div id="ap-directory-list" class="contact-list"></div>
        </section>

        <section class="card-section">
          <form id="appointment-form">
            <select id="ap-topic">
              <option value="hoc_tap">Học tập & định hướng</option>
              <option value="tinh_cam">Tình cảm & tâm tư</option>
              <option value="khac">Chủ đề khác</option>
            </select>
            <textarea id="ap-note" maxlength="1000"></textarea>
            <button type="button" id="ap-submit-btn">Gửi yêu cầu</button>
          </form>
        </section>

        <section class="card-section">
          <div id="ap-requests-list" class="requests-list"></div>
        </section>

        <div class="help-fallback-card">
          <a href="f13_help.html" id="link-f13-help">Trang tìm trợ giúp khẩn cấp (F13)</a>
        </div>
      </main>
      <div id="qa-f12-toolbar-container"></div>
    </div>
  `;
}

// ---------------------------------------------------------------- TEST SUITE
describe("Tính năng F12: Thầy cô và lịch hẹn (US-038 & US-046)", async () => {
  const {
    initAppointmentsPage,
    renderDirectory,
    renderRequests,
    submitAppointmentRequest,
    acceptProposedSlot,
    declineProposedSlot,
    TOPIC_LABELS,
    STATUS_LABELS,
  } = await import("../f12_appointments.js");

  beforeEach(() => {
    setupF12DOM();
    domWindow.location.search = "";
    domWindow.location.hash = "";
  });

  it("F12-AC-01: Hiển thị danh bạ thầy cô đã xác minh & nút Gọi (US-038)", async () => {
    const listEl = document.getElementById("ap-directory-list");
    const mockContacts = [
      {
        contact_id: "c-1",
        public_name: "Thầy Nguyễn Văn A - Tham vấn tâm lý",
        phone: "0901234567",
        status: "verified",
        operating_hours: { always: true },
      },
      {
        contact_id: "c-2",
        public_name: "Cô Trần Thị B - Giáo viên chủ nhiệm",
        phone: "0912345678",
        status: "verification_expired",
      },
    ];

    let calledPhone = null;
    renderDirectory(listEl, mockContacts, (phone) => {
      calledPhone = phone;
    });

    const items = listEl.querySelectorAll(".contact-item");
    assert.equal(items.length, 2, "Phải render đúng 2 đầu mối");

    // Contact 1: Verified
    assert.match(textOf(items[0]), /Thầy Nguyễn Văn A/, "Render tên thầy cô");
    assert.match(textOf(items[0]), /Đã xác minh/, "Có huy hiệu đã xác minh");
    const callBtn = items[0].querySelector(".btn-call");
    assert.ok(callBtn, "Có nút gọi cho contact đã xác minh");

    // Bấm nút Gọi
    callBtn.click();
    assert.equal(calledPhone, "0901234567", "Nút gọi kích hoạt đúng số điện thoại của contact");

    // Contact 2: Expired
    assert.match(textOf(items[1]), /Hết hạn xác minh/, "Đánh dấu hết hạn");
    const callBtn2 = items[1].querySelector(".btn-call");
    assert.equal(callBtn2, null, "Không hiện nút gọi khi contact hết hạn xác minh");
  });

  it("F12-AC-02: Scheduling Gate — Phản hồi trung thực khi chưa có staff trực (HTTP 503 scheduling_no_staff)", async () => {
    const restore = stubFetch(async (url, opts) => {
      if (url.includes("/requests") && opts.method === "POST") {
        return jsonResponse({ reason: "scheduling_no_staff" }, { status: 503, ok: false });
      }
      return jsonResponse({ results: [] });
    });

    try {
      initAppointmentsPage();
      await wait(20);

      const topicSelect = document.getElementById("ap-topic");
      const noteText = document.getElementById("ap-note");
      const submitBtn = document.getElementById("ap-submit-btn");

      topicSelect.value = "hoc_tap";
      noteText.value = "Em cần hỏi về định hướng nghề nghiệp.";
      submitBtn.click();
      await wait(20);

      const errorAlert = document.getElementById("status-alert-error");
      assert.equal(errorAlert.style.display, "flex", "Hiển thị thông báo lỗi");
      assert.match(
        textOf(errorAlert),
        /Lịch hẹn tạm tắt vì chưa có thầy\/cô trực\. Bạn vẫn gọi trực tiếp ở danh bạ trên\./,
        "Thông báo trung thực khi scheduling gate bị đóng"
      );
    } finally {
      restore();
    }
  });

  it("F12-AC-03: Gửi yêu cầu gặp riêng thành công — Thông báo rõ ràng chưa có lịch hẹn (US-046)", async () => {
    let capturedPayload = null;
    const restore = stubFetch(async (url, opts) => {
      if (url.includes("/requests") && opts.method === "POST") {
        capturedPayload = JSON.parse(opts.body);
        return jsonResponse({ request_id: "req-123", status: "submitted" }, { status: 201 });
      }
      return jsonResponse({ results: [] });
    });

    try {
      initAppointmentsPage();
      await wait(20);

      const topicSelect = document.getElementById("ap-topic");
      const noteText = document.getElementById("ap-note");
      const submitBtn = document.getElementById("ap-submit-btn");

      topicSelect.value = "tinh_cam";
      noteText.value = "Em cảm thấy áp lực trong kỳ thi.";
      submitBtn.click();
      await wait(20);

      assert.deepEqual(
        capturedPayload,
        { topic: "tinh_cam", note: "Em cảm thấy áp lực trong kỳ thi." },
        "Payload gửi đúng topic và note"
      );

      const successAlert = document.getElementById("status-alert-success");
      assert.equal(successAlert.style.display, "flex", "Hiển thị thông báo thành công");
      assert.match(
        textOf(successAlert),
        /Chưa có lịch hẹn nào cho tới khi thầy cô đề xuất và bạn xác nhận/,
        "Thông báo trung thực không hứa hẹn có lịch ngay"
      );

      assert.equal(noteText.value, "", "Textarea được xóa trắng sau khi gửi thành công");
    } finally {
      restore();
    }
  });

  it("F12-AC-04: Hiển thị trạng thái yêu cầu và Slot đề xuất gặp", async () => {
    const listEl = document.getElementById("ap-requests-list");
    const mockRequests = [
      {
        request_id: "req-1",
        topic: "hoc_tap",
        status: "submitted",
        note: "Thảo luận về bài tập lớn",
      },
      {
        request_id: "req-2",
        topic: "tinh_cam",
        status: "slot_proposed",
        note: "Em muốn nói chuyện riêng",
        slots: [
          {
            slot_id: "slot-99",
            status: "proposed",
            start_at: "2026-10-25T14:30:00Z",
          },
        ],
      },
    ];

    let acceptedSlot = null;
    let declinedSlot = null;

    renderRequests(
      listEl,
      mockRequests,
      (reqId, slotId) => { acceptedSlot = { reqId, slotId }; },
      (reqId, slotId) => { declinedSlot = { reqId, slotId }; }
    );

    const items = listEl.querySelectorAll(".request-item");
    assert.equal(items.length, 2, "Render 2 yêu cầu");

    // Item 1: submitted
    assert.match(textOf(items[0]), /Đã gửi — chờ thầy cô tiếp nhận/, "Nhãn trạng thái submitted");
    assert.equal(items[0].querySelector(".slot-box"), null, "Không có slot box khi chưa đề xuất");

    // Item 2: slot_proposed
    assert.match(textOf(items[1]), /Có đề xuất giờ — chờ bạn xác nhận/, "Nhãn trạng thái slot_proposed");
    const slotBox = items[1].querySelector(".slot-box");
    assert.ok(slotBox, "Có hộp đề xuất giờ");

    const acceptBtn = items[1].querySelector(".btn-accept");
    const declineBtn = items[1].querySelector(".btn-decline");
    assert.ok(acceptBtn, "Có nút Đồng ý giờ này");
    assert.ok(declineBtn, "Có nút Hỏi giờ khác");

    acceptBtn.click();
    assert.deepEqual(acceptedSlot, { reqId: "req-2", slotId: "slot-99" }, "Kích hoạt callback accept slot");

    declineBtn.click();
    assert.deepEqual(declinedSlot, { reqId: "req-2", slotId: "slot-99" }, "Kích hoạt callback decline slot");
  });

  it("F12-AC-05: Chặn Slot Stale (HTTP 409 preview_stale)", async () => {
    const restore = stubFetch(async (url, opts) => {
      if (url.includes("/accept") && opts.method === "POST") {
        return jsonResponse({ reason: "newer_proposal_exists" }, { status: 409, ok: false });
      }
      if (url.includes("/requests")) {
        return jsonResponse({
          results: [
            {
              request_id: "req-stale",
              topic: "khac",
              status: "slot_proposed",
              slots: [{ slot_id: "slot-stale", status: "proposed", start_at: "2026-10-20T09:00:00Z" }],
            },
          ],
        });
      }
      return jsonResponse({ results: [] });
    });

    try {
      initAppointmentsPage();
      await wait(20);

      const acceptBtn = document.querySelector(".btn-accept");
      assert.ok(acceptBtn, "Nút accept xuất hiện");
      acceptBtn.click();
      await wait(20);

      const errorAlert = document.getElementById("status-alert-error");
      assert.equal(errorAlert.style.display, "flex", "Hiện lỗi khi slot bị stale");
      assert.match(
        textOf(errorAlert),
        /Giờ hẹn đã được thay đổi hoặc không còn khả dụng/,
        "Cảnh báo slot bị thay đổi do stale revision"
      );
    } finally {
      restore();
    }
  });

  it("F12-AC-06: Link thường trực tới Trang tìm trợ giúp F13 (f13_help.html)", () => {
    const linkEl = document.getElementById("link-f13-help");
    assert.ok(linkEl, "Có link hỗ trợ F13");
    assert.equal(linkEl.getAttribute("href"), "f13_help.html", "Đường dẫn trỏ đúng tới f13_help.html");
  });

  it("F12-AC-07: Cô lập QA Mock Toolbar (chỉ kích hoạt khi ?qa=1 hoặc ?demo=1)", () => {
    // 1. Mặc định (không có query param): Không inject toolbar
    domWindow.location.search = "";
    setupF12DOM();
    initAppointmentsPage();

    const toolbarDefault = document.getElementById("qa-f12-toolbar");
    assert.equal(toolbarDefault, null, "Mặc định không có QA mock toolbar trong DOM");

    // 2. Khi có ?qa=1: Inject toolbar
    domWindow.location.search = "?qa=1";
    setupF12DOM();
    initAppointmentsPage();

    const toolbarQa = document.getElementById("qa-f12-toolbar");
    assert.ok(toolbarQa, "Có toolbar khi có query ?qa=1");

    // 3. Khi có ?demo=1: Inject toolbar
    domWindow.location.search = "?demo=1";
    setupF12DOM();
    initAppointmentsPage();

    const toolbarDemo = document.getElementById("qa-f12-toolbar");
    assert.ok(toolbarDemo, "Có toolbar khi có query ?demo=1");
  });
});
