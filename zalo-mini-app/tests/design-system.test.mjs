// tests/design-system.test.mjs — smoke test design system (Task 3-a).
// Chạy bởi Lead sau khi tích hợp: npm test (KHÔNG chạy trong nhiệm vụ 3-a).
// Yêu cầu môi trường: happy-dom 20.x (đã có trong devDependencies — Lead quản lý).
//
// QUAN TRỌNG: các module component dùng `document`/`Node` toàn cục thông qua
// src/app/dom.js — file này PHẢI thiết lập globalThis.window/document/Node/…
// TRƯỚC KHI import động ../src/components/index.js.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

// ---------- Thiết lập DOM toàn cục (trước khi import component) ----------
const happyWindow = new Window({ url: "https://family-bridge.local/" });
globalThis.window = happyWindow;
globalThis.document = happyWindow.document;
globalThis.Node = happyWindow.Node;
globalThis.HTMLElement = happyWindow.HTMLElement;
globalThis.HTMLButtonElement = happyWindow.HTMLButtonElement;
globalThis.KeyboardEvent = happyWindow.KeyboardEvent;
globalThis.MouseEvent = happyWindow.MouseEvent;

// Import động SAU khi global đã sẵn sàng (dom.js đọc document tại thời điểm gọi,
// nhưng để an toàn tuyệt đối thì import cũng nằm sau phần setup).
const {
  createButton,
  createInput,
  createTextarea,
  createList,
  createCard,
  createSheet,
  createDialog,
  createSkeleton,
  createEmptyState,
  createErrorState,
  createStatusBadge,
  createTopBar,
  createBottomNav,
  createDemoBanner,
  createLogo,
} = await import("../src/components/index.js");

const { NAV_ITEMS } = await import("../src/app/nav.js");

describe("design-system smoke (Task 3-a)", () => {
  it("createButton trả về HTMLButtonElement với class đúng", () => {
    const btn = createButton({ label: "Bắt đầu", variant: "cta", size: "lg" });
    assert.ok(btn instanceof HTMLButtonElement, "phải là HTMLButtonElement");
    assert.equal(btn.className, "fb-btn fb-btn--cta fb-btn--lg");
    assert.equal(btn.getAttribute("type"), "button");
    assert.equal(btn.textContent, "Bắt đầu");

    // Mặc định: variant primary, size md
    const def = createButton({ label: "Huỷ" });
    assert.equal(def.className, "fb-btn fb-btn--primary fb-btn--md");

    // Disabled
    const disabled = createButton({ label: "Sắp có", disabled: true });
    assert.equal(disabled.disabled, true);
  });

  it("createButton gọi onClick khi bấm", () => {
    let calls = 0;
    const btn = createButton({ label: "Bấm thử", onClick: () => { calls += 1; } });
    btn.click();
    assert.equal(calls, 1);
  });

  it("createEmptyState hiển thị title + description + action", () => {
    const el = createEmptyState({
      title: "Chưa có tin nhắn nào",
      description: "Khi hai bên đã kết nối, lời nhắn sẽ xuất hiện ở đây.",
      action: { label: "Kiểm tra kết nối", onClick: () => {} },
    });
    assert.ok(el.classList.contains("fb-empty"));
    assert.ok(el.textContent.includes("Chưa có tin nhắn nào"), "phải có title text");
    assert.ok(el.textContent.includes("Khi hai bên đã kết nối"));
    const actionBtn = el.querySelector("button.fb-btn");
    assert.ok(actionBtn, "phải có nút action");
    assert.equal(actionBtn.textContent, "Kiểm tra kết nối");

    // action = null → không có nút
    const plain = createEmptyState({ title: "Trống", description: "Mô tả", action: null });
    assert.equal(plain.querySelector("button"), null);
  });

  it("createBottomNav có 5 item từ NAV_ITEMS, aria-current cho mục active, icon có <title>", () => {
    const nav = createBottomNav({ active: "/mailbox" });
    assert.equal(nav.tagName, "NAV");
    assert.equal(nav.getAttribute("aria-label"), "Điều hướng chính");

    const items = nav.querySelectorAll(".fb-bottom-nav__item");
    assert.equal(items.length, NAV_ITEMS.length, "số item phải bằng NAV_ITEMS");

    NAV_ITEMS.forEach((item, index) => {
      assert.equal(items[index].getAttribute("href"), `#${item.path}`);
      assert.ok(items[index].textContent.includes(item.label), `nhãn ${item.label}`);
    });

    // Item "/mailbox" (index 2) active
    assert.equal(items[2].getAttribute("aria-current"), "page");
    assert.equal(items[0].getAttribute("aria-current"), null);

    // Icon SVG inline có <title> tiếng Việt
    const firstTitle = items[0].querySelector("svg title");
    assert.ok(firstTitle, "icon phải có <title>");
    assert.ok(firstTitle.textContent.length > 0);
  });

  it("createSheet: mở (tự gắn DOM) → focus nằm trong sheet → close() remove khỏi DOM + trả focus", () => {
    const trigger = createButton({ label: "Mở sheet" });
    document.body.appendChild(trigger);
    trigger.focus();
    assert.equal(document.activeElement, trigger);

    const root = createSheet({
      title: "Kết nối bằng mã mời",
      content: "Tính năng kết nối sẽ sớm ra mắt.",
    });

    assert.ok(root.isConnected, "sheet phải được gắn vào DOM khi mở");
    const panel = root.querySelector(".fb-sheet");
    assert.ok(panel, "phải có .fb-sheet");
    assert.equal(panel.getAttribute("role"), "dialog");
    assert.equal(panel.getAttribute("aria-modal"), "true");
    assert.ok(panel.getAttribute("aria-labelledby"), "phải có aria-labelledby");
    assert.ok(
      panel.contains(document.activeElement),
      "focus phải nằm trong sheet khi mở"
    );

    root.close();
    assert.equal(root.isConnected, false, "đóng phải remove khỏi DOM");
    assert.equal(document.activeElement, trigger, "phải trả focus về caller");

    trigger.remove();
  });

  it("createSheet: Esc đóng sheet", () => {
    const root = createSheet({ title: "Sheet khác", content: "Nội dung" });
    assert.ok(root.isConnected);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    assert.equal(root.isConnected, false, "Esc phải đóng sheet");
  });

  it("createStatusBadge: tone quyết định class + icon tĩnh", () => {
    const success = createStatusBadge({ tone: "success", label: "Đã kết nối tới máy chủ" });
    assert.equal(success.className, "fb-badge fb-badge--success");
    assert.equal(success.textContent, "Đã kết nối tới máy chủ");

    const warn = createStatusBadge({ tone: "warning", label: "Sắp có", icon: "warning" });
    assert.equal(warn.className, "fb-badge fb-badge--warning");
    assert.ok(warn.querySelector(".fb-badge__icon svg"), "icon tĩnh phải render svg");

    // tone lạ → fallback neutral
    const fallback = createStatusBadge({ tone: "khong-hop-le", label: "X" });
    assert.equal(fallback.className, "fb-badge fb-badge--neutral");
  });

  it("createInput: label luôn hiển thị, giữ giá trị khi lỗi, setError cập nhật động", () => {
    const field = createInput({
      id: "invite-code",
      label: "Mã mời",
      hint: "Nhập mã do người đồng hành gửi",
      error: "Mã mời chưa đúng định dạng",
      value: "FB-1234",
    });

    assert.ok(field.classList.contains("fb-field"));
    const label = field.querySelector("label");
    assert.equal(label.getAttribute("for"), "invite-code");
    assert.ok(label.textContent.includes("Mã mời"), "label phải luôn hiển thị");

    const input = field.querySelector("input");
    assert.equal(input.value, "FB-1234", "lỗi KHÔNG được xoá nội dung đã nhập");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.ok(field.querySelector(".fb-field__error"), "phải có error gần trường");
    assert.ok(field.querySelector(".fb-field__hint"), "phải có hint gần trường");

    field.setError(null);
    assert.equal(field.querySelector(".fb-field__error"), null);
    assert.equal(input.getAttribute("aria-invalid"), null);
  });

  it("createSkeleton: variant + count đúng", () => {
    const sk = createSkeleton({ variant: "card", count: 3 });
    assert.equal(sk.querySelectorAll(".fb-skeleton--card").length, 3);
    assert.equal(sk.getAttribute("role"), "status");

    const circle = createSkeleton({ variant: "circle" });
    assert.equal(circle.querySelectorAll(".fb-skeleton--circle").length, 1);
  });

  it("createDialog: role, focus action đầu, action click đóng; destructive chặn Esc", () => {
    // Dialog thường
    let confirmed = false;
    const root = createDialog({
      title: "Gửi tín hiệu?",
      message: "Tính năng gửi tín hiệu sẽ sớm có ở bản đầy đủ.",
      actions: [{ label: "Đã hiểu", variant: "primary", onClick: () => { confirmed = true; } }],
    });
    const panel = root.querySelector(".fb-dialog");
    assert.equal(panel.getAttribute("role"), "dialog");
    assert.equal(panel.getAttribute("aria-modal"), "true");
    assert.ok(panel.contains(document.activeElement), "focus action đầu tiên");

    const actionBtn = panel.querySelector(".fb-dialog__actions button");
    actionBtn.click();
    assert.equal(confirmed, true, "onClick của action phải chạy");
    assert.equal(root.isConnected, false, "action click phải đóng dialog");

    // Dialog destructive (có action variant "danger")
    const danger = createDialog({
      title: "Xoá trang này?",
      message: "Hành động này không thể hoàn tác.",
      actions: [
        { label: "Huỷ", variant: "ghost", onClick: () => {} },
        { label: "Xoá", variant: "danger", onClick: () => {} },
      ],
    });
    assert.equal(
      danger.querySelector(".fb-dialog").getAttribute("role"),
      "alertdialog",
      "destructive dùng alertdialog"
    );

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    assert.equal(danger.isConnected, true, "Esc KHÔNG đóng dialog destructive");

    danger.close();
    assert.equal(danger.isConnected, false);
  });

  it("Các component còn lại trả về đúng cấu trúc/class gốc", () => {
    // Textarea
    const ta = createTextarea({ id: "note-1", label: "Ghi chú", value: "Xin chào" });
    assert.ok(ta.classList.contains("fb-field"));
    const taEl = ta.querySelector("textarea");
    assert.equal(taEl.value, "Xin chào");
    assert.equal(taEl.getAttribute("rows"), "4");

    // List
    const list = createList({
      items: ["một", "hai"],
      renderItem: (v) => createButton({ label: `Mục ${v}` }),
    });
    assert.equal(list.tagName, "UL");
    assert.equal(list.querySelectorAll(".fb-list__item").length, 2);

    // Card
    const card = createCard({ title: "Thẻ cảm xúc", variant: "brand" });
    assert.ok(card.classList.contains("fb-card"));
    assert.ok(card.classList.contains("fb-card--brand"));
    assert.ok(card.querySelector(".fb-card__title"));

    // Demo banner
    const banner = createDemoBanner();
    assert.equal(banner.getAttribute("role"), "status");
    assert.equal(banner.textContent, "Dữ liệu minh họa — chế độ xem trước");

    // Logo
    const logo = createLogo();
    assert.ok(logo.classList.contains("fb-logo--md"));
    assert.ok(logo.querySelector("svg"), "logo phải là SVG inline");

    // Top bar: back bên trái, KHÔNG có nút góc phải
    const topBar = createTopBar({ title: "Cá nhân", showBack: true });
    assert.ok(topBar.querySelector(".fb-top-bar__back"));
    assert.ok(topBar.querySelector(".fb-top-bar__title"));
    assert.equal(topBar.querySelector(".fb-top-bar__right"), null);

    // Error state: luôn có lối tiếp tục
    const err = createErrorState({ title: "Không kết nối được", description: "Vui lòng thử lại." });
    assert.ok(err.classList.contains("fb-error"));
    assert.equal(err.getAttribute("role"), "alert");
    assert.ok(err.querySelector('a[href="#/home"]'), "phải có đường về trang chủ");

    const errRetry = createErrorState({
      title: "Lỗi",
      description: "Mô tả",
      retryLabel: "Thử lại",
      onRetry: () => {},
    });
    const retryBtn = errRetry.querySelector("button.fb-btn--primary");
    assert.ok(retryBtn);
    assert.equal(retryBtn.textContent, "Thử lại");
  });
});
