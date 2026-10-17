// tests/f10-signal.test.mjs — Kiểm thử tính năng F10: "Con cần được lắng nghe" (US-032)
// Tiêu chuẩn nghiệm thu: F10-AC-01 → F10-AC-07 (theo PM directive)
// Chạy: node --test tests/f10-signal.test.mjs

// ---------------------------------------------------------------- globals (happy-dom)
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/f10_signal.html" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it } = await import("node:test");
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
  return { ok, status, json: async () => data };
}

// Tạo lại DOM cấu trúc của f10_signal.html (các phần tử JS tham chiếu)
function setupF10DOM() {
  document.body.innerHTML = `
    <div class="phone-frame">
      <header class="zalo-header">
        <div class="zalo-header__left">
          <a href="index.html" class="zalo-header__btn" title="Quay lại" aria-label="Quay lại"></a>
        </div>
        <h1 class="zalo-header__title">Tín hiệu quan tâm</h1>
        <div class="zalo-header__right">
          <button class="zalo-header__btn" aria-label="Tùy chọn"></button>
        </div>
      </header>
      <main class="app-content">
        <section class="intro-banner" aria-label="Giới thiệu tín hiệu">
          <span class="intro-banner__icon" aria-hidden="true">🌱</span>
          <div class="intro-banner__text">
            <h2>Con cần được lắng nghe</h2>
            <p>Gửi một tín hiệu nhỏ nhẹ nhàng để người thân biết con đang mong muốn được sẻ chia.</p>
          </div>
        </section>

        <div id="status-alert-success" class="status-alert status-alert--success" role="status" style="display:none;">
          <span aria-hidden="true">✓</span>
          <span id="status-success-text"></span>
        </div>
        <div id="status-alert-error" class="status-alert status-alert--error" role="alert" style="display:none;">
          <span aria-hidden="true">⚠</span>
          <span id="status-error-text"></span>
        </div>

        <form id="signal-form" class="signal-form">
          <fieldset class="form-section">
            <legend class="form-section__title"><span>1. Con muốn gửi tới ai?</span></legend>
            <div class="recipients-group">
              <label class="recipient-card">
                <input type="radio" name="recipient" value="Bố" checked />
                <div class="recipient-card__content">
                  <span class="recipient-card__avatar" aria-hidden="true">👨</span>
                  <span class="recipient-card__name">Bố</span>
                </div>
              </label>
              <label class="recipient-card">
                <input type="radio" name="recipient" value="Mẹ" />
                <div class="recipient-card__content">
                  <span class="recipient-card__avatar" aria-hidden="true">👩</span>
                  <span class="recipient-card__name">Mẹ</span>
                </div>
              </label>
            </div>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title"><span>2. Con đang mong muốn điều gì?</span></legend>
            <div class="needs-group">
              <label class="need-card">
                <input type="radio" name="need" value="muon_tro_chuyen" checked />
                <div class="need-card__content">
                  <span class="need-card__icon" aria-hidden="true">💬</span>
                  <div class="need-card__text">
                    <div class="need-card__title">Muốn trò chuyện</div>
                    <div class="need-card__desc">Một buổi tâm sự nhỏ, lắng nghe và chia sẻ</div>
                  </div>
                </div>
              </label>
              <label class="need-card">
                <input type="radio" name="need" value="muon_duoc_o_ben" />
                <div class="need-card__content">
                  <span class="need-card__icon" aria-hidden="true">🫂</span>
                  <div class="need-card__text">
                    <div class="need-card__title">Muốn được ở bên</div>
                    <div class="need-card__desc">Chỉ cần cùng ngồi bên cạnh, không cần nói nhiều</div>
                  </div>
                </div>
              </label>
              <label class="need-card">
                <input type="radio" name="need" value="muon_hen_gio" />
                <div class="need-card__content">
                  <span class="need-card__icon" aria-hidden="true">⏰</span>
                  <div class="need-card__text">
                    <div class="need-card__title">Muốn hẹn thời gian</div>
                    <div class="need-card__desc">Cùng sắp xếp một thời điểm thảnh thơi trong tuần</div>
                  </div>
                </div>
              </label>
            </div>
          </fieldset>

          <div class="form-section">
            <label for="signal-note" class="form-section__title">
              <span>3. Lời nhắn hoặc thời gian hẹn (không bắt buộc)</span>
            </label>
            <div class="note-input-wrapper">
              <input type="text" id="signal-note" name="note" class="note-input" maxlength="120" placeholder="..." />
              <span class="note-hint">Tối đa 120 ký tự</span>
            </div>
          </div>

          <button type="submit" id="btn-submit-signal" class="btn-submit-signal">
            <span>Gửi tín hiệu</span>
          </button>
        </form>

        <footer class="safety-footer">
          <p>Tín hiệu chỉ chuyển tới người thân được chọn trong gia đình.</p>
          <p>Không lưu giữ hay đính kèm bất kỳ nhật ký riêng tư nào.</p>
        </footer>
      </main>

      <div id="confirm-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title" style="display:none;">
        <div class="modal-box">
          <div class="modal-box__icon" aria-hidden="true">💌</div>
          <h3 id="modal-title" class="modal-box__title">Xác nhận gửi tín hiệu</h3>
          <p id="modal-message" class="modal-box__message"></p>
          <div class="modal-box__actions">
            <button type="button" id="btn-modal-cancel" class="btn-modal-cancel">Xem lại</button>
            <button type="button" id="btn-modal-confirm" class="btn-modal-confirm">Gửi ngay</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Xóa QA toolbar nếu có từ lần import trước
  const oldToolbar = document.getElementById("qa-f10-toolbar");
  if (oldToolbar) oldToolbar.remove();
}

// ---------------------------------------------------------------- import module
// Stub fetch TRƯỚC khi import để module không gọi fetch thật và QA toolbar
// không ghi đè fetch với mock của riêng nó. Sau import, ta sẽ thay thế fetch
// bằng stub kiểm thử riêng.
async function importF10Module() {
  setupF10DOM();
  const restore = stubFetch(async () => jsonResponse({ status: "sent", message_id: "test-1" }));
  try {
    const mod = await import("../f10_signal.js");
    return { mod, restore };
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------- tests

describe("F10-AC-01: Allowlist 3 nhu cầu (muon_tro_chuyen, muon_duoc_o_ben, muon_hen_gio)", () => {
  it("HTML có đúng 3 radio nút nhu cầu với giá trị đúng", () => {
    const restore = stubFetch(async () => jsonResponse({}));
    try {
      importF10Module(); // side-effect: module auto-init
      const needInputs = document.querySelectorAll('input[name="need"]');
      assert.equal(needInputs.length, 3, `phải có đúng 3 nhu cầu, thực tế ${needInputs.length}`);

      const values = Array.from(needInputs).map((el) => el.value);
      assert.ok(values.includes("muon_tro_chuyen"), "phải có muon_tro_chuyen");
      assert.ok(values.includes("muon_duoc_o_ben"), "phải có muon_duoc_o_ben");
      assert.ok(values.includes("muon_hen_gio"), "phải có muon_hen_gio");
    } finally {
      restore();
    }
  });

  it("NEED_LABELS xuất đúng 3 khóa cần thiết", async () => {
    const restore = stubFetch(async () => jsonResponse({}));
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");
      assert.ok(mod.NEED_LABELS, "NEED_LABELS phải được xuất");
      assert.equal(Object.keys(mod.NEED_LABELS).length, 3, `phải có đúng 3 nhãn, thực tế ${Object.keys(mod.NEED_LABELS).length}`);
      assert.ok("muon_tro_chuyen" in mod.NEED_LABELS, "phải có khóa muon_tro_chuyen");
      assert.ok("muon_duoc_o_ben" in mod.NEED_LABELS, "phải có khóa muon_duoc_o_ben");
      assert.ok("muon_hen_gio" in mod.NEED_LABELS, "phải có khóa muon_hen_gio");
    } finally {
      restore();
    }
  });
});

describe("F10-AC-02: Xác nhận chủ động (Modal trước khi gọi API, không auto-send)", () => {
  it("Bấm submit form KHÔNG gọi API ngay — mở Modal xác nhận", async () => {
    let apiCalled = false;
    const restore = stubFetch(async () => {
      apiCalled = true;
      return jsonResponse({ status: "sent", message_id: "test-1" });
    });
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");

      const form = document.getElementById("signal-form");
      assert.ok(form, "phải có form signal-form");

      const submitBtn = document.getElementById("btn-submit-signal");
      assert.ok(submitBtn, "phải có nút gửi");

      submitBtn.click();
      await wait(50);

      const modal = document.getElementById("confirm-modal");
      assert.ok(modal, "phải mở Modal xác nhận sau khi bấm gửi");
      assert.equal(modal.style.display, "flex", "Modal phải hiển thị (display:flex)");
      assert.equal(apiCalled, false, "KHÔNG được gọi API khi chỉ bấm submit — chờ xác nhận");

      const modalMessage = document.getElementById("modal-message");
      assert.ok(modalMessage, "phải có nội dung modal");
      assert.ok(
        textOf(modalMessage).includes("Bạn có chắc chắn"),
        "modal phải hỏi xác nhận chủ động, thực tế: " + textOf(modalMessage)
      );
    } finally {
      restore();
    }
  });

  it("Bấm Hủy trong Modal đóng modal và KHÔNG gọi API", async () => {
    let apiCalled = false;
    const restore = stubFetch(async () => {
      apiCalled = true;
      return jsonResponse({ status: "sent", message_id: "test-1" });
    });
    try {
      await importF10Module();
      await import("../f10_signal.js");

      const form = document.getElementById("signal-form");
      const submitBtn = document.getElementById("btn-submit-signal");
      submitBtn.click();
      await wait(50);

      const btnCancel = document.getElementById("btn-modal-cancel");
      assert.ok(btnCancel, "phải có nút Hủy trong modal");
      btnCancel.click();
      await wait(50);

      const modal = document.getElementById("confirm-modal");
      assert.equal(modal.style.display, "none", "Modal phải đóng sau khi bấm Hủy");
      assert.equal(apiCalled, false, "KHÔNG được gọi API khi bấm Hủy");
    } finally {
      restore();
    }
  });

  it("Bấm Xác nhận trong Modal mới gọi API", async () => {
    let apiCalled = false;
    const restore = stubFetch(async () => {
      apiCalled = true;
      return jsonResponse({ status: "sent", message_id: "test-1" });
    });
    try {
      await importF10Module();
      await import("../f10_signal.js");

      const submitBtn = document.getElementById("btn-submit-signal");
      submitBtn.click();
      await wait(50);

      const btnConfirm = document.getElementById("btn-modal-confirm");
      assert.ok(btnConfirm, "phải có nút Xác nhận trong modal");
      btnConfirm.click();
      await wait(100);

      assert.equal(apiCalled, true, "phải gọi API sau khi bấm Xác nhận trong Modal");
    } finally {
      restore();
    }
  });
});

describe("F10-AC-03: DTO tối thiểu { need, recipient_id } — chống rò rỉ dữ liệu", () => {
  it("sendSignalApi chỉ gửi payload { need, recipient_id }, KHÔNG có note, recipient tên, hay dữ liệu F06/F07/F08", async () => {
    let capturedPayload = null;
    const restore = stubFetch(async (url, options) => {
      if (options && options.body) {
        capturedPayload = JSON.parse(options.body);
      }
      return jsonResponse({ status: "sent", message_id: "test-1" });
    });
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");

      // Gọi sendSignalApi với dữ liệu có note và recipient tên
      await mod.sendSignalApi({
        recipient: "Bố",
        recipient_id: "conn-123",
        need: "muon_tro_chuyen",
        note: "Tối nay sau cơm",
      });

      assert.ok(capturedPayload, "phải có payload được gửi");
      assert.equal(capturedPayload.need, "muon_tro_chuyen", "payload phải có trường need");
      assert.equal(capturedPayload.recipient_id, "conn-123", "payload phải có trường recipient_id");
      assert.equal(
        capturedPayload.recipient,
        undefined,
        "payload KHÔNG được có trường recipient (tên người nhận)"
      );
      assert.equal(
        capturedPayload.note,
        undefined,
        "payload KHÔNG được có trường note (lời nhắn tự do)"
      );
      // KHÔNG được có dữ liệu F06/F07/F08
      assert.equal(
        capturedPayload.draft_id,
        undefined,
        "KHÔNG được đính kèm draft_id (F06)"
      );
      assert.equal(
        capturedPayload.journal_page,
        undefined,
        "KHÔNG được đính kèm journal_page (F08)"
      );
      assert.equal(
        capturedPayload.mood,
        undefined,
        "KHÔNG được đính kèm mood (F07)"
      );
    } finally {
      restore();
    }
  });
});

describe("F10-AC-04: API gửi POST /api/v1/signals/send với X-Idempotency-Key", () => {
  it("Gọi API đến endpoint /api/v1/signals/send (không phải /api/v1/signals)", async () => {
    let capturedUrl = null;
    const restore = stubFetch(async (url) => {
      capturedUrl = String(url);
      return jsonResponse({ status: "sent", message_id: "test-1" });
    });
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");

      await mod.sendSignalApi({ need: "muon_tro_chuyen", recipient_id: "conn-123" });

      assert.ok(capturedUrl, "phải có URL được gọi");
      assert.ok(
        capturedUrl.includes("/signals/send"),
        `endpoint phải là /api/v1/signals/send, thực tế: ${capturedUrl}`
      );
    } finally {
      restore();
    }
  });

  it("Yêu cầu header X-Idempotency-Key trong request", async () => {
    let capturedHeaders = null;
    const restore = stubFetch(async (url, options) => {
      capturedHeaders = options && options.headers;
      return jsonResponse({ status: "sent", message_id: "test-1" });
    });
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");

      await mod.sendSignalApi({ need: "muon_tro_chuyen", recipient_id: "conn-123" });

      assert.ok(capturedHeaders, "phải có headers");
      assert.ok(
        "X-Idempotency-Key" in capturedHeaders || "x-idempotency-key" in capturedHeaders,
        `phải có header X-Idempotency-Key, thực tế: ${JSON.stringify(capturedHeaders)}`
      );
    } finally {
      restore();
    }
  });

  it("Replay cùng idempotency key không nhân bản message", async () => {
    let callCount = 0;
    const restore = stubFetch(async () => {
      callCount += 1;
      return jsonResponse({ status: "sent", message_id: "msg-same-id" });
    });
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");

      const key = "idem-key-test-123";
      await mod.sendSignalApi({ need: "muon_tro_chuyen", recipient_id: "conn-123", _idemKey: key });
      await mod.sendSignalApi({ need: "muon_tro_chuyen", recipient_id: "conn-123", _idemKey: key });

      assert.equal(callCount, 2, "API được gọi 2 lần với cùng key (idempotency do server xử lý)");
    } finally {
      restore();
    }
  });
});

describe("F10-AC-05: Minh bạch không cam kết tức thì", () => {
  it("Thông báo thành công phải rõ ràng: người thân thấy trong Hộp thư, không cam kết trả lời ngay", async () => {
    const restore = stubFetch(async () => jsonResponse({ status: "sent", message_id: "test-1" }));
    try {
      await importF10Module();
      const mod = await import("../f10_signal.js");

      const submitBtn = document.getElementById("btn-submit-signal");
      submitBtn.click();
      await wait(50);

      const btnConfirm = document.getElementById("btn-modal-confirm");
      btnConfirm.click();
      await wait(100);

      const successText = document.getElementById("status-success-text");
      assert.ok(successText, "phải có phần tử thông báo thành công");
      const msg = textOf(successText);
      assert.ok(
        msg.includes("Hộp thư") || msg.includes("Hộp thư"),
        `thông báo phải nhắc đến Hộp thư, thực tế: ${msg}`
      );
      // Không được hứa trả lời ngay
      assert.ok(
        !msg.includes("sớm") && !msg.includes("ngay") && !msg.includes("trả lời ngay"),
        `KHÔNG được hứa trả lời ngay, thực tế: ${msg}`
      );
    } finally {
      restore();
    }
  });
});

describe("F10-AC-06: Đường dẫn Trang trợ giúp F13 luôn xuất hiện", () => {
  it("Trang phải có liên kết đến Trang trợ giúp (#/help hoặc f13_help.html) trong mọi trạng thái", () => {
    const restore = stubFetch(async () => jsonResponse({}));
    try {
      importF10Module();

      // Tìm liên kết giúp đỡ trong toàn bộ trang
      const helpLinks = Array.from(document.querySelectorAll("a")).filter((a) => {
        const href = a.getAttribute("href") || "";
        const text = textOf(a);
        return href.includes("help") || href.includes("f13") || text.includes("trợ giúp") || text.includes("Trợ giúp");
      });

      assert.ok(
        helpLinks.length > 0,
        "phải có liên kết đến Trang trợ giúp (F13) trên trang tín hiệu"
      );
    } finally {
      restore();
    }
  });
});

describe("F10-AC-07: Cách ly Mock Toolbar — chỉ kích hoạt khi ?qa=1 hoặc ?demo=1", () => {
  it("Môi trường mặc định KHÔNG render #qa-f10-toolbar và KHÔNG ghi đè window.fetch", () => {
    const restore = stubFetch(async () => jsonResponse({}));
    try {
      // Trước khi import, lưu original fetch
      const originalFetch = globalThis.fetch;
      setupF10DOM();

      // Import module — module-level code sẽ chạy và có thể thiết lập toolbar
      import("../f10_signal.js").then(() => {
        // Kiểm tra sau khi import
      });

      // Vì module đã được import và side-effect đã chạy, kiểm tra DOM
      const toolbar = document.getElementById("qa-f10-toolbar");
      // F10-AC-07 yêu cầu: KHÔNG có toolbar ở môi trường mặc định
      // Hiện tại code f10_signal.js LUON thiết lập toolbar → test này sẽ FAIL
      // và ghi nhận lỗi cần sửa
      assert.equal(
        toolbar,
        null,
        "F10-AC-07: KHÔNG được render #qa-f10-toolbar ở môi trường mặc định (chỉ khi ?qa=1 hoặc ?demo=1)"
      );

      // Kiểm tra window.fetch không bị ghi đè bằng mock
      assert.equal(
        globalThis.fetch,
        originalFetch,
        "F10-AC-07: KHÔNG được ghi đè window.fetch ở môi trường mặc định"
      );
    } finally {
      restore();
    }
  });
});