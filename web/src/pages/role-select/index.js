// U04 — Chọn góc nhìn xem trước (Stitch port 2026-10, tài liệu tham chiếu
// fb_web_role_ch_n_g_c_nh_n_xem_tr_c_desktop_responsive: header public 64px +
// layout 4/8 cột + radio-card 2 lựa chọn).
//
// BẤT BIẾN AN TOÀN (giữ nguyên từ nền tảng, làm nổi bật hơn):
// - Trang này CHỈ XEM TRƯỚC. Không tạo tài khoản, không tạo phiên, không đổi
//   quyền thật. Lựa chọn vai trò chỉ là state in-memory (store.setRole — cùng
//   cơ chế trang cũ dùng) để định hướng giao diện xem trước; vai trò THẬT do
//   máy chủ gán khi đăng nhập (loginWithCredentials → setRole từ response).
// - Không precheck, không auto-advance: chưa chọn gì khi mới vào, chọn radio
//   KHÔNG tự chuyển trang. CTA dẫn đúng luồng thật /login, nhãn trung thực
//   "Đăng nhập để dùng thật".
// - Không ship "State Playground" / directive thiết kế / tên-avatar mẫu của
//   prototype (control kiểm thử không thuộc luồng người dùng nào).
// - Không dùng ảnh/tên mẫu ("Nguyễn Minh Phương", "Lê Hoàng Long", lớp, badge
//   online) — dữ liệu người thật chỉ đến từ phiên đăng nhập.
//
// Trạng thái: chưa chọn / đã chọn / busy (chặn bấm đôi CTA) / lỗi điều hướng
// (alert + Thử lại) / đã có phiên (banner thông tin, vai trò thật do máy chủ).
import "../../styles/pages-role-select.css";

import { h } from "../../app/dom.js";
import { hasLiveSession, getSession } from "../../core/session.js";
import { createIcon } from "../../components/index.js";

const ROLE_OPTIONS = [
  {
    value: "student",
    eyebrow: "Góc nhìn A",
    title: "Học sinh THPT",
    subtitle: "Không gian của con",
    icon: "chat",
    points: [
      { icon: "edit_note", label: "Ghi nhận cảm xúc của mình" },
      { icon: "forum", label: "Mở lời khi đã sẵn sàng" },
      { icon: "lock", label: "Tự chọn điều muốn chia sẻ" },
    ],
  },
  {
    value: "caregiver",
    eyebrow: "Góc nhìn B",
    title: "Phụ huynh – người chăm sóc",
    subtitle: "Đồng hành cùng con",
    icon: "hearing",
    points: [
      { icon: "favorite", label: "Lắng nghe điều con muốn nói" },
      { icon: "volunteer_activism", label: "Đồng hành từng việc nhỏ" },
      { icon: "shield", label: "Tôn trọng ranh giới riêng tư" },
    ],
  },
];

const ROLE_LABELS = {
  student: "Học sinh THPT",
  caregiver: "Phụ huynh – người chăm sóc",
};

export const page = {
  id: "u04-role-select",
  title: "Chọn vai trò xem trước",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    // State preview in-memory — KHÔNG precheck: luôn bắt đầu ở "chưa chọn"
    // kể cả khi store đang có role (lựa chọn xem trước phải là chủ động).
    let selectedRole = null;
    let navigating = false;

    const root = h("div", { class: "fb-role", dataset: { page: "u04-role-select" } });

    // ---------------- Header public ----------------
    const header = h("header", { class: "fb-role__header" });
    const headerInner = h("div", { class: "fb-role__container fb-role__header-inner" });

    const brand = h("a", { class: "fb-role__brand", href: "#/welcome" });
    const brandMark = h("span", { class: "fb-role__brand-mark", "aria-hidden": "true" });
    brandMark.appendChild(createIcon({ name: "diversity_1", size: 22 }));
    brand.appendChild(brandMark);
    brand.appendChild(
      h("span", {},
        h("span", { class: "fb-role__brand-name" }, "Family Bridge"),
        h("span", { class: "fb-role__brand-tagline" }, "Nhịp cầu thấu cảm"),
      ),
    );
    headerInner.appendChild(brand);

    const nav = h("nav", { class: "fb-role__nav", "aria-label": "Liên kết công khai" });
    nav.appendChild(h("a", { href: "#/how-to-use" }, "Cách sử dụng"));
    nav.appendChild(h("a", { href: "#/help" }, "Tìm trợ giúp"));
    nav.appendChild(h("a", { class: "fb-role__nav-login", href: "#/login" }, "Đăng nhập"));
    headerInner.appendChild(nav);
    header.appendChild(headerInner);
    root.appendChild(header);

    // ---------------- Main ----------------
    const main = h("main", { class: "fb-role__main" });
    const container = h("div", { class: "fb-role__container" });
    main.appendChild(container);
    root.appendChild(main);

    // Eyebrow + tiêu đề
    const intro = h("div", { class: "fb-role__intro" });
    const eyebrow = h("span", { class: "fb-role__eyebrow" });
    eyebrow.appendChild(createIcon({ name: "explore", size: 15 }));
    eyebrow.appendChild(h("span", {}, "Khám phá Family Bridge"));
    intro.appendChild(eyebrow);
    intro.appendChild(h("h1", { class: "fb-role__title" }, "Bạn muốn xem từ góc nhìn nào?"));
    intro.appendChild(
      h("p", { class: "fb-role__subtitle" },
        "Chọn một góc nhìn để tìm hiểu giao diện. Tài khoản và vai trò thực tế được " +
        "người phụ trách lớp cấp riêng — hệ thống tự gán đúng vai trò khi bạn đăng nhập.",
      ),
    );
    container.appendChild(intro);

    // ---------------- Lưới 4/8 ----------------
    const grid = h("div", { class: "fb-role__grid" });
    container.appendChild(grid);

    // ===== Cột trái (1/3): minh bạch về xem trước =====
    const aside = h("aside", { class: "fb-role__aside" });

    const notice = h("section", { class: "fb-role__notice", "aria-labelledby": "fb-role-notice-title" });
    const noticeHead = h("div", { class: "fb-role__notice-head" });
    const noticeIcon = h("span", { class: "fb-role__notice-icon", "aria-hidden": "true" });
    noticeIcon.appendChild(createIcon({ name: "verified_user", size: 18 }));
    noticeHead.appendChild(noticeIcon);
    noticeHead.appendChild(
      h("div", {},
        h("h2", { class: "fb-role__notice-title", id: "fb-role-notice-title" }, "Chế độ xem trước"),
        h("p", { class: "fb-role__notice-text" },
          "Xem trước không tạo tài khoản, không đăng nhập và không gửi dữ liệu ra máy chủ.",
        ),
      ),
    );
    notice.appendChild(noticeHead);
    const noticeList = h("ul", { class: "fb-role__notice-list" });
    const noticeItems = [
      {
        icon: "lock",
        html: null,
        strong: "Không cần tạo mật mã:",
        text: " đây là trải nghiệm tĩnh để bạn hình dung nhịp điệu sử dụng.",
      },
      {
        icon: "shield",
        strong: "Quyền thật cần tài khoản chính thức:",
        text: " truy cập nhật ký hoặc thư riêng luôn yêu cầu đăng nhập bằng tài khoản được cấp.",
      },
    ];
    for (const item of noticeItems) {
      const li = h("li", { class: "fb-role__notice-item" });
      li.appendChild(createIcon({ name: item.icon, size: 16 }));
      const span = h("span", {});
      span.appendChild(h("strong", {}, item.strong));
      span.appendChild(document.createTextNode(item.text));
      li.appendChild(span);
      noticeList.appendChild(li);
    }
    notice.appendChild(noticeList);
    aside.appendChild(notice);

    // Box "Tài khoản chính thức"
    const account = h("section", { class: "fb-role__account" });
    const accountHead = h("div", { class: "fb-role__account-head" });
    accountHead.appendChild(createIcon({ name: "menu_book", size: 16 }));
    accountHead.appendChild(h("span", {}, "Tài khoản chính thức"));
    account.appendChild(accountHead);
    account.appendChild(
      h("p", { class: "fb-role__account-text" },
        "Học sinh và phụ huynh nhận thông tin định danh cùng cặp đồng hành qua người " +
        "phụ trách lớp. Khi đăng nhập thật, hệ thống tự gán đúng vai trò của bạn.",
      ),
    );
    const accountLink = h("a", { class: "fb-role__account-link", href: "#/how-to-use" },
      h("span", {}, "Đọc hướng dẫn nhận tài khoản"),
      createIcon({ name: "arrow_forward", size: 14 }),
    );
    account.appendChild(accountLink);
    aside.appendChild(account);

    // Banner phiên thật (nếu có): vai trò thật do máy chủ — không phải lựa chọn dưới đây
    const session = getSession();
    if (hasLiveSession()) {
      const sessionBox = h("section", { class: "fb-role__session" });
      const sessionHead = h("div", { class: "fb-role__session-head" });
      sessionHead.appendChild(createIcon({ name: "account_circle", size: 20 }));
      const sessionBody = h("div", {});
      sessionBody.appendChild(h("div", { class: "fb-role__session-title" }, "Bạn đang đăng nhập"));
      const name = session && session.displayName ? String(session.displayName) : null;
      sessionBody.appendChild(
        h("p", { class: "fb-role__session-text" },
          (name ? `Phiên của “${name}” đang hoạt động. ` : "Bạn đang có phiên đăng nhập hoạt động. ") +
          "Vai trò thật của bạn do máy chủ gán khi đăng nhập — lựa chọn bên dưới chỉ " +
          "dùng để xem trước giao diện.",
        ),
      );
      sessionBody.appendChild(
        h("a", { class: "fb-role__session-btn", href: "#/home" },
          h("span", {}, "Về trang chủ"),
          createIcon({ name: "arrow_forward", size: 14 }),
        ),
      );
      sessionHead.appendChild(sessionBody);
      sessionBox.appendChild(sessionHead);
      aside.appendChild(sessionBox);
    }

    grid.appendChild(aside);

    // ===== Cột phải (2/3): panel lựa chọn =====
    const panel = h("section", { class: "fb-role__panel", "aria-labelledby": "fb-role-panel-title" });
    const panelHead = h("div", { class: "fb-role__panel-head" });
    panelHead.appendChild(
      h("div", {},
        h("h2", { class: "fb-role__panel-title", id: "fb-role-panel-title" }, "Chọn 1 trong 2 góc nhìn"),
      ),
    );
    const statusBadge = h("span", { class: "fb-role__status", "data-role-status": "" });
    const statusDot = h("span", { class: "fb-role__status-dot", "aria-hidden": "true" });
    const statusText = h("span", { "data-role-status-text": "" }, "Chưa chọn góc nhìn");
    statusBadge.appendChild(statusDot);
    statusBadge.appendChild(statusText);
    panelHead.appendChild(statusBadge);
    panel.appendChild(panelHead);

    // Fieldset radio-card — input radio thật, ẩn bằng sr-only
    const fieldset = h("fieldset", { class: "fb-role__fieldset" });
    fieldset.appendChild(
      h("legend", { class: "fb-visually-hidden" }, "Lựa chọn góc nhìn xem trước"),
    );
    const optionsWrap = h("div", { class: "fb-role__options" });

    const cardEls = new Map();
    for (const option of ROLE_OPTIONS) {
      const inputId = `fb-role-${option.value}`;
      const card = h("label", { class: "fb-role__card", for: inputId, dataset: { roleOption: option.value } });
      const input = h("input", {
        type: "radio",
        name: "preview_role",
        id: inputId,
        value: option.value,
        class: "fb-visually-hidden",
      });
      input.addEventListener("change", () => {
        if (navigating) {
          input.checked = false;
          return;
        }
        selectRole(option.value);
      });
      card.appendChild(input);

      const cardTop = h("div", { class: "fb-role__card-top" });
      const iconBox = h("span", { class: "fb-role__card-icon", "aria-hidden": "true" });
      iconBox.appendChild(createIcon({ name: option.icon, size: 26 }));
      cardTop.appendChild(iconBox);
      const radio = h("span", { class: "fb-role__radio", "aria-hidden": "true" });
      // Dấu tick vẽ bằng CSS (không icon "check" trong bộ local) — trạng thái
      // thật của lựa chọn nằm ở input radio + nhãn trạng thái.
      radio.appendChild(h("span", { class: "fb-role__radio-tick" }));
      cardTop.appendChild(radio);
      card.appendChild(cardTop);

      const body = h("div", { class: "fb-role__card-body" });
      body.appendChild(h("span", { class: "fb-role__card-eyebrow" }, option.eyebrow));
      body.appendChild(h("h3", { class: "fb-role__card-title" }, option.title));
      body.appendChild(h("div", { class: "fb-role__card-sub" }, option.subtitle));
      const list = h("ul", { class: "fb-role__card-list" });
      for (const point of option.points) {
        const li = h("li", {});
        li.appendChild(createIcon({ name: point.icon, size: 17 }));
        li.appendChild(h("span", {}, point.label));
        list.appendChild(li);
      }
      body.appendChild(list);
      card.appendChild(body);

      optionsWrap.appendChild(card);
      cardEls.set(option.value, card);
    }
    fieldset.appendChild(optionsWrap);
    panel.appendChild(fieldset);

    // ---------------- Alert lỗi điều hướng ----------------
    const alert = h("div", { class: "fb-role__alert", role: "alert", hidden: true });
    const alertMsg = h("div", { class: "fb-role__alert-msg" });
    alertMsg.appendChild(createIcon({ name: "error", size: 18 }));
    const alertText = h("span", { "data-role-alert-text": "" },
      "Không thể mở trang đăng nhập ngay bây giờ. Vui lòng thử lại.");
    alertMsg.appendChild(alertText);
    alert.appendChild(alertMsg);
    const retryButton = h("button", { class: "fb-role__alert-retry", type: "button" }, "Thử lại");
    alert.appendChild(retryButton);
    panel.appendChild(alert);

    // ---------------- Hàng hành động ----------------
    const actions = h("div", { class: "fb-role__actions" });
    const hint = h("div", { class: "fb-role__hint", "data-role-hint": "" });
    hint.appendChild(createIcon({ name: "info", size: 16 }));
    hint.appendChild(h("span", {}, "Chọn một góc nhìn để tiếp tục"));
    actions.appendChild(hint);

    const cta = h("button", {
      class: "fb-role__cta",
      type: "button",
      disabled: true,
      "data-role-cta": "",
    }, "Đăng nhập để dùng thật");
    actions.appendChild(cta);
    panel.appendChild(actions);

    panel.appendChild(
      h("p", { class: "fb-role__login-note" },
        "Đã có tài khoản chính thức do nhà trường cấp? ",
        h("a", { href: "#/login" },
          h("span", {}, "Đăng nhập ngay"),
          createIcon({ name: "arrow_forward", size: 14 }),
        ),
      ),
    );

    grid.appendChild(panel);

    // ---------------- Footer public ----------------
    const footer = h("footer", { class: "fb-role__footer" });
    const footerInner = h("div", { class: "fb-role__container fb-role__footer-inner" });
    footerInner.appendChild(
      h("div", { class: "fb-role__footer-brand" },
        h("strong", {}, "Family Bridge"),
        h("span", {}, "•"),
        h("span", {}, "Dự án hỗ trợ kết nối tâm lý học đường"),
      ),
    );
    footerInner.appendChild(h("a", { href: "#/help" }, "Trung tâm trợ giúp"));
    footer.appendChild(footerInner);
    root.appendChild(footer);

    // ---------------- Hành vi ----------------
    function selectRole(role) {
      selectedRole = role;
      // Cơ chế xem trước của trang cũ: setRole in-memory — KHÔNG tạo phiên,
      // KHÔNG đổi quyền thật, KHÔNG điều hướng (không auto-advance).
      Promise.resolve(ctx.setRole(role)).catch(() => { /* giữ UI nhất quán */ });
      for (const [value, card] of cardEls.entries()) {
        card.classList.toggle("fb-role__card--selected", value === role);
        const input = card.querySelector("input");
        if (input) input.checked = value === role;
      }
      statusBadge.classList.add("fb-role__status--selected");
      statusText.textContent = `Đã chọn: ${ROLE_LABELS[role] || role}`;
      cta.disabled = false;
      hint.classList.add("fb-role__hint--ready");
      hint.replaceChildren(
        createIcon({ name: "check_circle", size: 16 }),
        h("span", {}, "Sẵn sàng — tiếp tục bằng đăng nhập thật"),
      );
      alert.hidden = true;
    }

    function goToLogin() {
      if (navigating) return; // chặn bấm đôi (busy)
      navigating = true;
      cta.disabled = true;
      alert.hidden = true;
      cta.replaceChildren("Đang mở đăng nhập…");
      try {
        ctx.navigate("/login");
      } catch {
        navigating = false;
        cta.disabled = false;
        cta.replaceChildren("Đăng nhập để dùng thật");
        alert.hidden = false;
      }
    }

    retryButton.addEventListener("click", () => {
      alert.hidden = true;
      goToLogin();
    });
    cta.addEventListener("click", goToLogin);

    return root;
  },
};
