// U01 — Welcome (Stitch port 2026-10-20): màn chào công khai theo
// references/stitch-original/stitch_family_bridge_companion_management/
// welcome_01_gi_i_thi_u_family_bridge/ (code.html + screen.png, desktop
// 1120px, hero split 55/45). Tái biểu diễn bằng token + component repo,
// KHÔNG Tailwind/CDN (css riêng: styles/pages-welcome.css).
//
// Ràng buộc giữ nguyên từ nền tảng:
// - KHÔNG gọi getUserInfo/SDK ở màn mở đầu — đăng nhập đi qua /login với
//   adapter (loginWithCredentials bằng mã tài khoản + mật khẩu).
// - CTA chính "Tiếp tục để đăng nhập" dẫn đúng luồng thật: /login.
// - Liên kết trợ giúp LUÔN hiển thị (header + footer), không phụ thuộc
//   vai trò/kết nối.
//
// Copy trung thực (bắt buộc, khác prototype cũ):
// - KHÔNG "bảo mật tuyệt đối"/"tự chủ tuyệt đối"/"xác thực bởi trường"/
//   "kênh bảo mật gia đình", KHÔNG số liệu chưa kiểm chứng (vd "Hơn 1,200
//   gia đình"), KHÔNG banner "Dữ liệu minh họa" toàn cục.
// - Logo là logo chính chủ (createLogo) — KHÔNG dùng icon family-group
//   của HTML tham chiếu.
// - Ảnh minh họa là MINH HỌA (không phải ảnh người dùng thật): alt mô tả
//   nội dung vẽ, caption chỉ ghi "Minh họa".
// - Footer KHÔNG link chết: bỏ "Chính sách & Riêng tư" trỏ #/privacy
//   (đó là trang điều khiển riêng tư cần phiên đăng nhập, không phải
//   trang chính sách công khai) và không bịa route terms.
import "../../styles/pages-welcome.css";
import { h } from "../../app/dom.js";
import { createLogo, createIcon } from "../../components/index.js";
import heroWebpUrl from "../../assets/illustrations/family-conversation-stitch.webp";
import heroPngUrl from "../../assets/illustrations/family-conversation-stitch.png";

// Bốn tuần lấy NGUYÊN VĂN từ catalog nội dung của bản giao Stitch
// (data/content-items.json — f02_program "Bốn tuần lắng nghe và gần nhau
// hơn"). Mô tả tuần tóm tắt từ goals của catalog, không bịa thêm.
const WEEKS = [
  {
    no: "01",
    label: "Tuần 1",
    title: "Nhận diện cảm xúc và Tiếng lòng chưa nói",
    desc: "Thử gọi tên cảm xúc bằng từ của riêng mình; luyện nghe trọn một lượt mà không phán xét.",
  },
  {
    no: "02",
    label: "Tuần 2",
    title: "Giảm so sánh và Bản sắc riêng",
    desc: "Ghi nhận một nỗ lực cụ thể của nhau và tìm một khoảng hiện diện phù hợp cho cả hai.",
  },
  {
    no: "03",
    label: "Tuần 3",
    title: "Ranh giới riêng tư và niềm tin",
    desc: "Tập hỏi trước khi xem hoặc kể lại; nói rõ một ranh giới sinh hoạt tự nguyện.",
  },
  {
    no: "04",
    label: "Tuần 4",
    title: "Cảm ơn, xin lỗi và Thỏa ước gia đình mới",
    desc: "Nói một lời cảm ơn hoặc xin lỗi nếu muốn; cùng chọn một đến ba cam kết khả thi.",
  },
];

/** Header công khai 64px (sticky) — brand thật + nav + đăng nhập. */
function renderPublicHeader({ active }) {
  const navLink = (href, label, isActive) =>
    h(
      "a",
      {
        class: `fb-pub-header__link${isActive ? " fb-pub-header__link--active" : ""}`,
        href,
        ...(isActive ? { "aria-current": "page" } : {}),
      },
      label,
    );

  const brand = h("a", { class: "fb-pub-header__brand", href: "#/welcome" });
  brand.appendChild(createLogo({ size: "sm" }));
  brand.appendChild(
    h("span", { class: "fb-pub-header__brand-text" },
      h("span", { class: "fb-pub-header__brand-name" }, "Family Bridge"),
      h("span", { class: "fb-pub-header__brand-tag" }, "Nhịp cầu thấu cảm"),
    ),
  );

  return h("header", { class: "fb-pub-header" },
    h("div", { class: "fb-pub-header__inner" },
      brand,
      h("nav", { class: "fb-pub-header__nav", "aria-label": "Điều hướng công khai" },
        navLink("#/welcome", "Giới thiệu", active === "welcome"),
        navLink("#/how-to-use", "Cách sử dụng", active === "how-to-use"),
        navLink("#/help", "Tìm trợ giúp", active === "help"),
      ),
      h("a", { class: "fb-pub-header__login", href: "#/login" }, "Đăng nhập"),
    ),
  );
}

/** Footer công khai — chỉ link route thật, không link chết. */
function renderPublicFooter() {
  const brand = h("div", { class: "fb-pub-footer__brand" });
  brand.appendChild(createLogo({ size: "sm" }));
  brand.appendChild(
    h("span", {},
      h("span", { class: "fb-pub-footer__brand-name" }, "Family Bridge"),
      h("span", { class: "fb-pub-footer__brand-sub" },
        "Dự án hỗ trợ kết nối học đường & gia đình"),
    ),
  );

  return h("footer", { class: "fb-pub-footer" },
    h("div", { class: "fb-pub-footer__inner" },
      brand,
      h("nav", { class: "fb-pub-footer__nav", "aria-label": "Liên kết chân trang" },
        h("a", { href: "#/welcome" }, "Giới thiệu"),
        h("a", { href: "#/how-to-use" }, "Cách sử dụng"),
        h("a", { href: "#/help" }, "Tìm trợ giúp"),
        h("a", { href: "#/login" }, "Đăng nhập"),
      ),
    ),
    h("div", { class: "fb-pub-footer__note" },
      h("p", {},
        "Family Bridge tôn trọng quyền lựa chọn cá nhân và quyền riêng tư của học sinh và gia đình.",
      ),
    ),
  );
}

export const page = {
  id: "u01-welcome",
  title: "Family Bridge",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", {
      class: "fb-page fb-wc-page",
      dataset: { page: "u01-welcome" },
    });

    root.appendChild(renderPublicHeader({ active: "welcome" }));

    const main = h("main", { class: "fb-wc-main" });

    // ---- HERO (split 55/45) ----
    const copy = h("div", { class: "fb-wc-hero__copy" });
    copy.appendChild(
      h("span", { class: "fb-wc-eyebrow" },
        h("span", { class: "fb-wc-eyebrow__dot", "aria-hidden": "true" }),
        "Dành cho học sinh THPT và người chăm sóc",
      ),
    );
    copy.appendChild(
      h("h1", { class: "fb-wc-title" },
        h("span", {}, "Mở lời nhẹ nhàng,"),
        " ",
        h("span", {}, "gần nhau hơn."),
      ),
    );
    copy.appendChild(
      h("p", { class: "fb-wc-lead" },
        "Một không gian để con và người chăm sóc mở lời theo nhịp của mình. " +
        "Ghi nhận cảm xúc, viết điều muốn nói và cùng thực hành lắng nghe — " +
        "hoàn toàn tự nguyện, không áp lực theo dõi.",
      ),
    );

    const actions = h("div", { class: "fb-wc-actions" });
    const loginCta = h("button", {
      class: "fb-wc-btn fb-wc-btn--primary",
      type: "button",
      onclick: () => ctx.navigate("/login"),
    });
    loginCta.appendChild(
      createIcon({ name: "arrow_forward", size: 18, className: "fb-wc-btn__icon" }),
    );
    loginCta.appendChild(h("span", {}, "Tiếp tục để đăng nhập"));
    actions.appendChild(loginCta);
    actions.appendChild(
      h("button", {
        class: "fb-wc-btn fb-wc-btn--secondary",
        type: "button",
        onclick: () => ctx.navigate("/how-to-use"),
      },
        h("span", {}, "Tìm hiểu cách Family Bridge hoạt động"),
      ),
    );
    copy.appendChild(actions);

    // Minh bạch nguồn tài khoản (luồng tài khoản được cấp sẵn).
    copy.appendChild(
      h("p", { class: "fb-wc-notice" },
        createIcon({ name: "verified_user", size: 18, className: "fb-wc-notice__icon" }),
        h("span", {},
          "Tài khoản và người đồng hành được người phụ trách nhà trường thiết lập sẵn. " +
          "Không yêu cầu đăng ký mở hay mã mời bắt buộc.",
        ),
      ),
    );

    // ---- Thẻ minh họa (decorative — KHÔNG phải ảnh người dùng thật) ----
    const figure = h("figure", { class: "fb-wc-figure" });
    figure.appendChild(
      h("div", { class: "fb-wc-figure__media" },
        h("picture", {},
          h("source", { type: "image/webp", srcset: heroWebpUrl }),
          h("img", {
            src: heroPngUrl,
            alt: "Minh họa một học sinh và người chăm sóc đang trò chuyện",
            width: "1200",
            height: "896",
            loading: "eager",
            decoding: "async",
          }),
        ),
      ),
    );
    figure.appendChild(
      h("figcaption", { class: "fb-wc-figure__caption" },
        h("p", { class: "fb-wc-figure__caption-title" },
          "Không gian đồng hành tự nguyện · Tôn trọng ranh giới riêng tư"),
        h("p", { class: "fb-wc-figure__caption-sub" }, "Minh họa của Family Bridge"),
      ),
    );

    main.appendChild(
      h("section", { class: "fb-wc-hero", "aria-label": "Giới thiệu Family Bridge" },
        copy,
        h("div", { class: "fb-wc-hero__media" }, figure),
      ),
    );

    // ---- DẢI CAM KẾT (2 phần bất đối xứng 7/5) ----
    const colA = h("div", { class: "fb-wc-commit__col fb-wc-commit__col--a" },
      h("span", { class: "fb-wc-commit__head" },
        createIcon({ name: "lock", size: 20 }),
        "Ranh giới rõ ràng",
      ),
      h("h3", {}, "Bạn tự quyết định nội dung muốn chia sẻ"),
      h("p", {},
        "Nội dung nhật ký và cảm xúc riêng tư không tự động chia sẻ với người đồng hành " +
        "hay người phụ trách. Chỉ những tâm sự bạn chủ động gửi qua Hộp thư mới xuất hiện " +
        "phía đối phương.",
      ),
    );
    const colB = h("div", { class: "fb-wc-commit__col fb-wc-commit__col--b" },
      h("span", { class: "fb-wc-commit__head" },
        createIcon({ name: "timer", size: 20 }),
        "Chủ động và có thể thu hồi",
      ),
      h("h3", {}, "Tạm dừng trước khi gửi"),
      h("p", {},
        "Bạn luôn có khoảng thở để cân nhắc, chỉnh sửa hoặc thu hồi quyền tương tác " +
        "bất kỳ lúc nào tại mục Cài đặt & Riêng tư sau khi đăng nhập.",
      ),
    );
    main.appendChild(
      h("section", { class: "fb-wc-commit", "aria-label": "Cam kết bảo mật & ranh giới" },
        h("h2", { class: "fb-wc-commit__title" }, "Cam kết bảo mật & ranh giới"),
        h("div", { class: "fb-wc-commit__grid" }, colA, colB),
      ),
    );

    // ---- HÀNH TRÌNH 4 TUẦN (tự nguyện, có thể bỏ qua, không khóa tuần) ----
    const journeyIntro = h("div", { class: "fb-wc-journey__intro" },
      h("span", { class: "fb-wc-journey__eyebrow" },
        createIcon({ name: "explore", size: 18 }),
        "Hành trình tự nguyện",
      ),
      h("h2", {}, "Bốn tuần, những bước nhỏ để hiểu nhau hơn"),
      h("p", {},
        "Không có bài kiểm tra, không chấm điểm tâm lý. Mỗi tuần là một gợi ý nhỏ: " +
        "bạn tự nguyện tham gia, có thể bỏ qua bất kỳ hoạt động nào và không bị khóa tuần nào.",
      ),
    );
    const weekCards = WEEKS.map((week) =>
      h("article", { class: "fb-wc-week" },
        h("div", {},
          h("span", { class: "fb-wc-week__num", "aria-hidden": "true" }, week.no),
          h("span", { class: "fb-wc-week__label" }, week.label),
          h("h3", { class: "fb-wc-week__title" }, week.title),
          h("p", { class: "fb-wc-week__desc" }, week.desc),
        ),
        h("p", { class: "fb-wc-week__foot" }, "Tự nguyện · Không khóa tuần"),
      ),
    );
    main.appendChild(
      h("section", { class: "fb-wc-journey", "aria-label": "Hành trình 4 tuần" },
        journeyIntro,
        h("div", { class: "fb-wc-weeks" }, weekCards),
      ),
    );

    // ---- BANNER XEM TRƯỚC GÓC NHÌN ----
    const previewBtn = h("button", {
      class: "fb-wc-preview__btn",
      type: "button",
      onclick: () => ctx.navigate("/role-select"),
    });
    previewBtn.appendChild(h("span", {}, "Chọn góc nhìn xem trước"));
    previewBtn.appendChild(createIcon({ name: "chevron_right", size: 16 }));
    main.appendChild(
      h("section", { class: "fb-wc-preview", "aria-label": "Xem trước giao diện" },
        h("div", { class: "fb-wc-preview__text" },
          h("h3", {}, "Muốn tìm hiểu giao diện trước khi đăng nhập?"),
          h("p", {},
            "Bạn có thể xem trước góc nhìn của Học sinh THPT hoặc Phụ huynh / Người chăm sóc " +
            "mà không cần đăng nhập hay tạo phiên làm việc.",
          ),
        ),
        previewBtn,
      ),
    );

    root.appendChild(main);
    root.appendChild(renderPublicFooter());
    return root;
  },
};
