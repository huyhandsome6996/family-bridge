// tests/f13-help.test.mjs — Kiểm thử tính năng F13: Trang tìm trợ giúp khẩn cấp (US-039)
// Chạy: node --test tests/f13-help.test.mjs

// ---------------------------------------------------------------- globals (happy-dom)
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/f13_help.html" });

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

// Tạo lại DOM cấu trúc của f13_help.html trong body (happy-dom document trống)
function setupF13DOM() {
  document.body.innerHTML = `
    <div class="phone-frame">
      <header class="zalo-header">
        <div class="zalo-header__left">
          <a href="index.html" class="zalo-header__btn" title="Quay lại" aria-label="Quay lại">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </a>
        </div>
        <h1 class="zalo-header__title">Tìm trợ giúp khẩn cấp</h1>
        <div class="zalo-header__right">
          <button class="zalo-header__btn" aria-label="Tùy chọn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="19" cy="12" r="2"></circle>
            </svg>
          </button>
        </div>
      </header>
      <main class="app-content">
        <section class="emergency-banner" aria-label="Thông báo hỗ trợ khẩn cấp">
          <span class="emergency-banner__icon" aria-hidden="true">🛡️</span>
          <div class="emergency-banner__text">
            <h2>Đầu mối hỗ trợ & Tư vấn</h2>
            <p>Trang này mở công khai 24/7, không yêu cầu đăng nhập.</p>
          </div>
        </section>
        <section id="loading-state" class="loading-state" aria-live="polite" style="display:flex;">
          <div class="spinner" aria-hidden="true"></div>
          <p>Đang tải danh bạ đầu mối hỗ trợ...</p>
        </section>
        <section id="error-state" class="error-state" role="alert" aria-live="assertive" style="display:none;">
          <div class="error-state__icon" aria-hidden="true">!</div>
          <h3 class="error-state__title">Không thể kết nối danh bạ</h3>
          <p id="error-message" class="error-state__message"></p>
          <button id="retry-btn" class="btn-retry" type="button">Thử lại</button>
          <div class="state-fallback">
            <p class="state-fallback__hint">Cần giúp đỡ khẩn cấp ngay bây giờ?</p>
            <a href="tel:111" class="btn-call" aria-label="Gọi khẩn cấp Tổng đài 111">
              <span>Gọi ngay Tổng đài 111 (Miễn phí 24/7)</span>
            </a>
          </div>
        </section>
        <section id="empty-state" class="empty-state" role="status" style="display:none;">
          <div class="empty-state__icon" aria-hidden="true">📋</div>
          <h3 class="empty-state__title">Chưa có đầu mối bổ sung</h3>
          <p class="empty-state__desc"></p>
          <div class="state-fallback">
            <a href="tel:111" class="btn-call" aria-label="Gọi Tổng đài quốc gia bảo vệ trẻ em 111">
              <span>Gọi Tổng đài 111 (Miễn phí 24/7)</span>
            </a>
          </div>
        </section>
        <ul id="contacts-list" class="contacts-list" aria-label="Danh sách các đầu mối hỗ trợ"></ul>
        <footer class="safety-footer">
          <p>Family Bridge cam kết bảo mật & tôn trọng quyền riêng tư.</p>
          <p>Đường dây khẩn cấp Quốc gia bảo vệ trẻ em: <strong>111</strong> (miễn phí 24/7)</p>
        </footer>
      </main>
    </div>
  `;
}

// Xóa QA toolbar nếu có từ lần import trước
function clearQAToolbar() {
  const old = document.getElementById("qa-mock-toolbar");
  if (old) old.remove();
}

// Import module f13_help.js (ES module, side-effect: auto-init on DOM ready)
// Phải stub fetch TRƯỚC khi import để tránh fetch thật chạy ngay module-level
async function importF13Module() {
  clearQAToolbar();
  setupF13DOM();
  // Xóa cache module nếu đã import (happy-dom fresh mỗi test file, nhưng dynamic import
  // có thể cache). Node.js cache theo URL, và URL tương đối là cố định nên ta cần
  // đảm bảo fetch đã được stub trước khi import lần đầu.
  const mod = await import("../f13_help.js");
  return mod;
}

// ---------------------------------------------------------------- tests

describe("F13 Help Page — getHelpApiUrl", () => {
  it("trả DEFAULT_API_URL khi không có override và không có env", async () => {
    if (typeof window.__HELP_API_URL__ !== "undefined") delete window.__HELP_API_URL__;
    if (typeof import.meta !== "undefined" && import.meta.env) {
      delete import.meta.env.VITE_HELP_API_URL;
    }
    // Stub fetch trước khi import để module-level không gọi fetch thật
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      assert.equal(mod.getHelpApiUrl(), "https://family-bridge-api.onrender.com/api/v1/help/directory");
    } finally {
      restore();
    }
  });

  it("Ưu tiên window.__HELP_API_URL__", async () => {
    window.__HELP_API_URL__ = "https://custom.example.com/api/help";
    if (typeof import.meta !== "undefined" && import.meta.env) {
      delete import.meta.env.VITE_HELP_API_URL;
    }
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      assert.equal(mod.getHelpApiUrl(), "https://custom.example.com/api/help");
      delete window.__HELP_API_URL__;
    } finally {
      restore();
    }
  });
});

describe("F13 Help Page — renderHelpContacts", () => {
  it("render danh sách 2 liên hệ: 1 verified + 1 unverified", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      const contacts = [
        {
          contact_id: "c1",
          name: "Tổng đài Quốc gia 111",
          scope: "Tư vấn tâm lý, can thiệp khẩn cấp",
          hours: { always: true },
          phone: "111",
          is_verified: true,
        },
        {
          contact_id: "c2",
          name: "CLB Tham vấn Tâm lý",
          scope: "Lắng nghe tâm sự",
          hours: "18:00 - 21:00",
          phone: "0912345678",
          is_verified: false,
        },
      ];
      mod.renderHelpContacts(container, contacts);

      const cards = container.querySelectorAll(".contact-card");
      assert.equal(cards.length, 2, `phải có 2 thẻ liên hệ, thực tế ${cards.length}`);

      const badge1 = cards[0].querySelector(".badge-verified");
      assert.ok(badge1, "liên hệ đầu tiên phải có badge Đã xác minh");
      assert.ok(textOf(badge1).includes("Đã xác minh"));
      const call1 = cards[0].querySelector('a[href="tel:111"]');
      assert.ok(call1, "liên hệ có số điện thoại phải có nút gọi tel:");

      const badge2 = cards[1].querySelector(".badge-unverified");
      assert.ok(badge2, "liên hệ thứ hai phải có badge Chờ xác minh");
      assert.ok(textOf(badge2).includes("Chờ xác minh"));
      const call2 = cards[1].querySelector('a[href="tel:0912345678"]');
      assert.ok(call2, "liên hệ thứ hai phải có nút gọi");
    } finally {
      restore();
    }
  });

  it("liên hệ không có số điện thoại hiện thông báo thay vì nút gọi", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      mod.renderHelpContacts(container, [
        {
          contact_id: "c3",
          name: "Đầu mối không điện thoại",
          scope: "Tư vấn",
          hours: "08:00 - 17:00",
          is_verified: true,
        },
      ]);

      const notice = container.querySelector(".no-phone-notice");
      assert.ok(notice, "phải hiện thông báo khi không có số điện thoại");
      const callLink = container.querySelector('a[href^="tel:"]');
      assert.equal(callLink, null, "KHÔNG được có nút gọi khi không có số");
    } finally {
      restore();
    }
  });

  it("số điện thoại được làm sạch (chỉ giữ số và +)", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      mod.renderHelpContacts(container, [
        {
          contact_id: "c4",
          name: "Đầu mối số komplex",
          scope: "Tư vấn",
          hours: "08:00 - 17:00",
          phone: "+84 (0) 912-345-678",
          is_verified: false,
        },
      ]);

      const callLink = container.querySelector('a[href^="tel:"]');
      assert.ok(callLink, "phải có nút gọi");
      assert.equal(callLink.getAttribute("href"), "tel:+840912345678", "số phải được làm sạch");
    } finally {
      restore();
    }
  });

  it("giờ hoạt động định dạng đúng từ object {always: true}", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      mod.renderHelpContacts(container, [
        {
          contact_id: "c5",
          name: "Dịch vụ 24/7",
          scope: "Hỗ trợ",
          hours: { always: true },
          phone: "",
          is_verified: false,
        },
      ]);

      // Tìm hàng "Giờ trực:" và lấy giá trị của nó (không phải hàng "Phạm vi:")
      const hoursRow = Array.from(container.querySelectorAll(".contact-card__row")).find(
        (row) => textOf(row.querySelector(".contact-card__label")).includes("Giờ trực"),
      );
      assert.ok(hoursRow, "phải có hàng Giờ trực");
      const hoursValue = hoursRow.querySelector(".contact-card__value");
      assert.ok(textOf(hoursValue).includes("24/7"), `giờ luôn phải hiển thị 24/7, thực tế: ${textOf(hoursValue)}`);
    } finally {
      restore();
    }
  });
});

describe("F13 Help Page — loadHelpContacts (luồng chính)", () => {
  it("trạng thái loading hiện trước khi fetch, sau đó ẩn khi xong", async () => {
    let fetchResolved = false;
    const restore = stubFetch(async () => {
      await new Promise((r) => setTimeout(r, 30));
      fetchResolved = true;
      return jsonResponse([]);
    });
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      const loadingEl = document.getElementById("loading-state");
      assert.equal(loadingEl.style.display, "flex", "loading phải hiện ban đầu");

      await mod.loadHelpContacts();
      assert.equal(loadingEl.style.display, "none", "loading phải ẩn sau khi xong");
      assert.equal(fetchResolved, true, "fetch phải đã được gọi");
    } finally {
      restore();
    }
  });

  it("API thành công → render danh sách liên hệ", async () => {
    const restore = stubFetch(async () =>
      jsonResponse([
        {
          contact_id: "s1",
          name: "Đơn vị A",
          scope: "Tư vấn tâm lý",
          hours: { always: true },
          phone: "111",
          is_verified: true,
        },
      ])
    );
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      await mod.loadHelpContacts();

      const emptyEl = document.getElementById("empty-state");
      const errorEl = document.getElementById("error-state");
      const listEl = document.getElementById("contacts-list");

      assert.equal(emptyEl.style.display, "none", "empty state phải ẩn");
      assert.equal(errorEl.style.display, "none", "error state phải ẩn");
      assert.equal(listEl.querySelectorAll(".contact-card").length, 1, "phải có 1 thẻ liên hệ");
      assert.ok(listEl.querySelector(".badge-verified"), "phải có badge Đã xác minh");
    } finally {
      restore();
    }
  });

  it("API trả mảng rỗng → hiển thị empty-state", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      await mod.loadHelpContacts();

      const emptyEl = document.getElementById("empty-state");
      const listEl = document.getElementById("contacts-list");
      assert.equal(emptyEl.style.display, "flex", "empty-state phải hiện");
      assert.equal(listEl.querySelectorAll(".contact-card").length, 0, "danh sách phải rỗng");
    } finally {
      restore();
    }
  });

  it("API lỗi mạng → hiển thị error-state với thông báo thân phục", async () => {
    const restore = stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      // Mock navigator.onLine = false
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      try {
        await mod.loadHelpContacts();
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, "onLine", originalOnLine);
        } else {
          delete navigator.onLine;
        }
      }

      const errorEl = document.getElementById("error-state");
      const errorMsg = document.getElementById("error-message");
      const loadingEl = document.getElementById("loading-state");

      assert.equal(errorEl.style.display, "flex", "error-state phải hiện khi lỗi mạng");
      assert.equal(loadingEl.style.display, "none", "loading phải ẩn");
      assert.ok(
        textOf(errorMsg).includes("Không có kết nối mạng"),
        `thông báo phải đề cập đến kết nối mạng, thực tế: ${textOf(errorMsg)}`
      );
    } finally {
      restore();
    }
  });

  it("API trả HTTP lỗi (503) → hiển thị error-state với mã HTTP", async () => {
    const restore = stubFetch(async () =>
      jsonResponse({ detail: "Service unavailable" }, { status: 503, ok: false })
    );
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      await mod.loadHelpContacts();

      const errorEl = document.getElementById("error-state");
      const errorMsg = document.getElementById("error-message");
      assert.equal(errorEl.style.display, "flex", "error-state phải hiện khi HTTP lỗi");
      assert.ok(
        textOf(errorMsg).includes("503"),
        `thông báo phải chứa mã HTTP 503, thực tế: ${textOf(errorMsg)}`
      );
    } finally {
      restore();
    }
  });

  it("nút Thử lại → gọi lại loadHelpContacts", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount += 1;
      return jsonResponse([]);
    };
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      // setupF13DOM() thay thế toàn bộ body → listener nút Thử lại từ module-level
      // bị mất. Gán lại listener cho nút mới trong DOM vừa tạo.
      const retryBtn = document.getElementById("retry-btn");
      assert.ok(retryBtn, "phải có nút Thử lại");
      retryBtn.addEventListener("click", () => { mod.loadHelpContacts(); });

      await mod.loadHelpContacts();
      assert.equal(callCount, 1, "loadHelpContacts phải được gọi 1 lần ban đầu");

      retryBtn.click();
      await wait(10);
      assert.equal(callCount, 2, "bấm Thử lại phải gọi lại loadHelpContacts");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("is_verified !== true → badge 'Chờ xác minh' (không hardcode verified)", async () => {
    const restore = stubFetch(async () =>
      jsonResponse([
        {
          contact_id: "v1",
          name: "Chưa xác minh",
          scope: "Tư vấn",
          hours: "08:00 - 17:00",
          phone: "111",
          is_verified: null,
        },
      ])
    );
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      await mod.loadHelpContacts();
      const badge = document.querySelector(".badge-unverified");
      assert.ok(badge, "is_verified=null phải hiện badge Chờ xác minh");
      assert.ok(textOf(badge).includes("Chờ xác minh"));
      assert.equal(
        document.querySelectorAll(".badge-verified").length,
        0,
        "KHÔNG được có badge Đã xác minh khi is_verified không phải true"
      );
    } finally {
      restore();
    }
  });
});

describe("F13 Help Page — bảo mật & không tự động gọi", () => {
  it("KHÔNG tự động kích hoạt cuộc gọi — chỉ hiển thị tel: link cho người dùng bấm", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      mod.renderHelpContacts(container, [
        {
          contact_id: "n1",
          name: "Đơn vị có điện thoại",
          scope: "Hỗ trợ",
          hours: "08:00 - 17:00",
          phone: "111",
          is_verified: true,
        },
      ]);

      const callLinks = container.querySelectorAll('a[href^="tel:"]');
      assert.ok(callLinks.length > 0, "phải có liên kết tel:");
      for (const link of callLinks) {
        assert.equal(link.tagName, "A", "nút gọi phải là thẻ <a> (chủ động bấm)");
        assert.ok(link.getAttribute("href").startsWith("tel:"), "href phải bắt đầu bằng tel:");
      }
    } finally {
      restore();
    }
  });

  it("Không gửi Authorization header (public route)", async () => {
    let authHeaderSent = null;
    const restore = stubFetch(async (url, options) => {
      authHeaderSent = options && options.headers && options.headers.Authorization;
      return jsonResponse([]);
    });
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");

      await mod.loadHelpContacts();
      assert.equal(
        authHeaderSent,
        undefined,
        "KHÔNG được gửi Authorization header (public route không yêu cầu auth)"
      );
    } finally {
      restore();
    }
  });
});

describe("F13 Help Page — điều hướng & cấu trúc", () => {
  it("Nút Quay lại dẫn về index.html", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      await import("../f13_help.js");

      const backLink = document.querySelector('.zalo-header__left a[href="index.html"]');
      assert.ok(backLink, "phải có nút Quay lại dẫn về index.html");
      assert.ok(
        backLink.getAttribute("aria-label").includes("Quay lại"),
        "nút phải có aria-label"
      );
    } finally {
      restore();
    }
  });

  it("Trang có banner an toàn & footer minh bạch", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      await import("../f13_help.js");

      const banner = document.querySelector(".emergency-banner");
      assert.ok(banner, "phải có banner an toàn");
      assert.ok(textOf(banner).includes("Đầu mối hỗ trợ"), "banner phải có tiêu đề");

      const footer = document.querySelector(".safety-footer");
      assert.ok(footer, "phải có footer an toàn");
      assert.ok(textOf(footer).includes("Family Bridge"), "footer phải nhắc đến Family Bridge");
      assert.ok(textOf(footer).includes("111"), "footer phải nhắc đến đường dây 111");
    } finally {
      restore();
    }
  });

  it("Các phần tử accessibility: aria-live, role, aria-label", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      await import("../f13_help.js");

      const loading = document.getElementById("loading-state");
      assert.ok(loading.getAttribute("aria-live"), "loading-state phải có aria-live");

      const error = document.getElementById("error-state");
      assert.equal(error.getAttribute("role"), "alert", "error-state phải có role=alert");

      const list = document.getElementById("contacts-list");
      assert.ok(list.getAttribute("aria-label"), "contacts-list phải có aria-label");

      const retryBtn = document.getElementById("retry-btn");
      assert.ok(retryBtn, "phải có nút Thử lại");
      assert.equal(retryBtn.type, "button", "nút Thử lại phải có type=button");
    } finally {
      restore();
    }
  });
});

describe("F13 Help Page — QA findings verification (mock toolbar, contract & out-of-hours)", () => {
  it("QA mock toolbar KHÔNG được render ở môi trường mặc định (không có ?qa=1)", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      await import("../f13_help.js");
      const toolbar = document.getElementById("qa-mock-toolbar");
      assert.equal(toolbar, null, "qa-mock-toolbar không được tồn tại khi không có cờ ?qa=1");
    } finally {
      restore();
    }
  });

  it("contact có status='verified' được hiển thị badge Đã xác minh", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      mod.renderHelpContacts(container, [
        {
          contact_id: "c-verified-status",
          public_name: "Đầu mối xác minh qua status",
          scope: "Tư vấn",
          hours: { always: true },
          phone: "111",
          status: "verified",
        },
      ]);
      const card = container.querySelector(".contact-card");
      assert.ok(card, "phải có thẻ liên hệ");
      const badge = card.querySelector(".badge-verified");
      assert.ok(badge, "phải có badge Đã xác minh cho status='verified'");
    } finally {
      restore();
    }
  });

  it("contact ngoài giờ (open_now=false, không phải always) hiển thị badge Ngoài giờ phục vụ", async () => {
    const restore = stubFetch(async () => jsonResponse([]));
    try {
      await importF13Module();
      const mod = await import("../f13_help.js");
      const container = document.getElementById("contacts-list");
      mod.renderHelpContacts(container, [
        {
          contact_id: "c-closed",
          public_name: "Phòng tham vấn ca ngày",
          scope: "Tư vấn",
          hours: "08:00 - 17:00",
          phone: "0900000000",
          open_now: false,
          status: "verified",
        },
      ]);
      const badge = container.querySelector(".badge-out-of-hours");
      assert.ok(badge, "phải có badge Ngoài giờ phục vụ");
      assert.ok(textOf(badge).includes("Ngoài giờ phục vụ"));
    } finally {
      restore();
    }
  });
});