// U02 — Cách sử dụng (Stitch port 2026-10-20): trang hướng dẫn công khai
// theo references/stitch-original/stitch_family_bridge_companion_management/
// howto_01_c_ch_d_ng_family_bridge_desktop_1120px/ (code.html + screen.png —
// desktop 1120px: sidebar mục lục 1/3 + luồng 4 bước 2/3 + FAQ accordion).
// Tái biểu diễn bằng token + component repo (css riêng:
// styles/pages-how-to-use.css), KHÔNG Tailwind/CDN.
//
// NỘI DUNG LUỒNG TÀI KHOẢN ĐƯỢC CẤP SẴN (prelinked — bắt buộc, 4 bước):
// 1) Đăng nhập bằng mã tài khoản + mật khẩu do người phụ trách lớp cấp.
// 2) Xem người đồng hành ở mục Kết nối — cặp đã được ghép sẵn, không cần
//    mã mời (KHÔNG còn bước "tạo mã mời 12 ký tự").
// 3) Cùng chọn hoạt động 4 tuần — lời mời tham gia hoạt động vẫn cần hai
//    bên tự đồng ý (đề xuất → đồng ý), không ai bị ép, không khóa tuần.
// 4) Nhật ký/cảm xúc là của riêng bạn — chỉ chia sẻ khi bạn chủ động chọn
//    (thẻ cảm xúc / gợi ý mở lời / hộp thư đều chỉ gửi khi bạn bấm gửi).
//
// Copy trung thực: không "bảo mật tuyệt đối", không số liệu chưa kiểm chứng,
// không giả thông báo; FAQ nói rõ hệ thống không mở đăng ký tự do.
// Mục lục dùng nút cuộn (không đổi hash) — hash router dùng #/ cho route,
// anchor "#step-1" thường sẽ bị hiểu nhầm thành route.
import "../../styles/pages-how-to-use.css";
import { h } from "../../app/dom.js";
import { createLogo, createIcon } from "../../components/index.js";

// Bốn tuần lấy NGUYÊN VĂN từ catalog nội dung (data/content-items.json).
const WEEK_THEMES = [
  ["Tuần 1", "Nhận diện cảm xúc và Tiếng lòng chưa nói"],
  ["Tuần 2", "Giảm so sánh và Bản sắc riêng"],
  ["Tuần 3", "Ranh giới riêng tư và niềm tin"],
  ["Tuần 4", "Cảm ơn, xin lỗi và Thỏa ước gia đình mới"],
];

const FAQS = [
  {
    q: "Người đồng hành có tự đọc được nội dung riêng của tôi không?",
    a: "Hoàn toàn không. Kết nối giữa hai tài khoản không trao quyền tự động xem nhật ký, " +
      "ghi chú tâm trạng hay thư nháp. Nội dung chỉ được đối phương nhìn thấy khi bạn " +
      "chủ động gửi qua Hộp thư hoặc chọn chia sẻ.",
    open: true,
  },
  {
    q: "Chưa có mã tài khoản thì cần làm gì?",
    a: "Family Bridge hoạt động theo hình thức cấp tài khoản có phụ trách. Vui lòng liên hệ " +
      "thầy cô chủ nhiệm hoặc người phụ trách của lớp để nhận mã tài khoản và mật khẩu " +
      "khởi tạo; hệ thống không mở đăng ký tự do trên web.",
  },
  {
    q: "Tôi có bắt buộc phải tham gia đủ 4 tuần không?",
    a: "Không. Tinh thần của Family Bridge là tự nguyện và không cưỡng ép. Các gợi ý theo " +
      "tuần chỉ mang tính tham khảo; bạn có thể bỏ qua bất kỳ hoạt động nào, không bị khóa " +
      "tuần, và chỉ dùng những phần mình thấy thoải mái.",
  },
  {
    q: "Tìm và thu hồi quyền chia sẻ ở đâu?",
    a: "Sau khi đăng nhập, bạn vào mục Cài đặt & Riêng tư (đường dẫn #/privacy trong ứng " +
      "dụng) để xem lại các mục đã chia sẻ hoặc thu hồi quyền truy cập bất cứ lúc nào.",
  },
];

/** Header công khai 64px (sticky) — giống màn welcome. */
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
        "Family Bridge — Nhịp cầu thấu cảm gia đình và học đường"),
    ),
  );

  return h("footer", { class: "fb-pub-footer" },
    h("div", { class: "fb-pub-footer__inner" },
      brand,
      h("nav", { class: "fb-pub-footer__nav", "aria-label": "Liên kết chân trang" },
        h("a", { href: "#/welcome" }, "Giới thiệu"),
        h("a", { href: "#/role-select" }, "Góc nhìn xem trước"),
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

/** Cuộn tới một section của trang (không đổi hash — an toàn với hash router). */
function scrollToSection(sectionEl) {
  return () => {
    if (!sectionEl || typeof sectionEl.scrollIntoView !== "function") return;
    const reduce = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionEl.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };
}

export const page = {
  id: "u02-how-to-use",
  title: "Cách dùng Family Bridge",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", {
      class: "fb-page fb-ht-page",
      dataset: { page: "u02-how-to-use" },
    });

    root.appendChild(renderPublicHeader({ active: "how-to-use" }));
    const main = h("main", { class: "fb-ht-main" });

    // ---- INTRO ----
    main.appendChild(
      h("section", { class: "fb-ht-intro", "aria-label": "Giới thiệu cách sử dụng" },
        h("span", { class: "fb-ht-intro__pill" },
          createIcon({ name: "timer", size: 14 }),
          "Bắt đầu theo nhịp của bạn",
        ),
        h("h1", {}, "Bốn bước để gần nhau hơn"),
        h("p", { class: "fb-ht-intro__lead" },
          "Hướng dẫn ngắn giúp bạn làm quen với Family Bridge trong 1–2 phút. Bạn có thể " +
          "quay lại hướng dẫn này bất cứ lúc nào mà không bị gián đoạn hay mất dữ liệu riêng.",
        ),
      ),
    );

    // ---- LAYOUT: mục lục + 4 bước ----
    const aside = h("aside", { class: "fb-ht-aside" });
    const steps = h("div", { class: "fb-ht-steps" });

    // Các section bước + FAQ (giữ tham chiếu cho mục lục cuộn tới).
    const stepEls = [];

    // ---- STEP 1: đăng nhập bằng tài khoản được cấp ----
    const step1Body = h("div", { class: "fb-ht-step__body" },
      h("div", { class: "fb-ht-step__meta" },
        h("span", { class: "fb-ht-chip" }, "Bắt đầu"),
        h("span", { class: "fb-ht-step__time" }, "Khoảng 1 phút"),
      ),
      h("h2", { class: "fb-ht-step__title" }, "Đăng nhập bằng mã tài khoản được cấp"),
      h("p", { class: "fb-ht-step__desc" },
        "Mỗi học sinh và phụ huynh/người chăm sóc dùng một tài khoản riêng do người phụ " +
        "trách lớp bàn giao sẵn. Bạn chỉ cần đăng nhập bằng mã tài khoản và mật khẩu đã " +
        "được cấp — không cần tự đăng ký.",
      ),
      h("div", { class: "fb-ht-box" },
        h("span", { class: "fb-ht-box__head" },
          createIcon({ name: "info", size: 16 }),
          "Lưu ý quan trọng:",
        ),
        h("ul", { class: "fb-ht-box__list" },
          h("li", {}, "Không cần đăng ký công khai, không yêu cầu liên kết Facebook, Zalo hay mã OTP."),
          h("li", {}, "Mỗi người giữ mật khẩu riêng để bảo vệ không gian riêng tư của chính mình."),
          h("li", {}, "Nếu quên thông tin đăng nhập, hãy liên hệ trực tiếp người phụ trách để nhận lại mã."),
        ),
      ),
    );

    // ---- STEP 2: cặp ghép sẵn, không cần mã mời ----
    stepEls.push(
      h("section", { class: "fb-ht-step", id: "fb-ht-step-2" },
        h("div", { class: "fb-ht-step__inner" },
          h("div", { class: "fb-ht-step__rail" },
            h("span", { class: "fb-ht-step__num", "aria-hidden": "true" }, "2"),
            h("span", { class: "fb-ht-step__line", "aria-hidden": "true" }),
          ),
          h("div", { class: "fb-ht-step__body" },
            h("div", { class: "fb-ht-step__meta" },
              h("span", { class: "fb-ht-chip" }, "Kết nối sẵn"),
              h("span", { class: "fb-ht-step__time" }, "Thiết lập sẵn — không cần thao tác"),
            ),
            h("h2", { class: "fb-ht-step__title" }, "Xem người đồng hành của bạn ở mục Kết nối"),
            h("p", { class: "fb-ht-step__desc" },
              "Cặp học sinh và người chăm sóc đã được người phụ trách ghép sẵn trên hệ thống — " +
              "bạn không cần nhập mã mời hay tự tạo kết nối. Sau khi đăng nhập, mở mục Kết nối " +
              "để xem người đồng hành của mình.",
            ),
            h("div", { class: "fb-ht-connect" },
              h("div", { class: "fb-ht-connect__who" },
                h("span", { class: "fb-ht-connect__avatar" },
                  createIcon({ name: "person", size: 20, label: "Người đồng hành" }),
                ),
                h("div", {},
                  h("div", { class: "fb-ht-connect__name-row" },
                    h("span", {}, "Người đồng hành của bạn"),
                    h("span", { class: "fb-ht-connect__badge" }, "Đã ghép sẵn"),
                  ),
                  h("div", { class: "fb-ht-connect__sub" },
                    "Thiết lập theo danh sách bàn giao của người phụ trách lớp",
                  ),
                ),
              ),
              h("p", { class: "fb-ht-connect__hint" },
                "Xem chi tiết ở mục Người đồng hành sau khi đăng nhập.",
              ),
            ),
            h("p", { class: "fb-ht-note" },
              "* Ghép cặp sẵn chỉ là kênh gửi nhận khi cả hai cùng muốn trò chuyện. Người đồng " +
              "hành không thể xem lén nhật ký, cảm xúc hay thư riêng nếu bạn chưa chủ động gửi.",
            ),
          ),
        ),
      ),
    );

    // ---- STEP 3: cùng chọn hoạt động 4 tuần — lời mời cần hai bên đồng ý ----
    const journeyCells = WEEK_THEMES.map(([week, theme]) =>
      h("div", { class: "fb-ht-journey__cell" },
        h("span", { class: "fb-ht-journey__week" }, week),
        h("span", { class: "fb-ht-journey__theme" }, theme),
      ),
    );
    stepEls.push(
      h("section", { class: "fb-ht-step", id: "fb-ht-step-3" },
        h("div", { class: "fb-ht-step__inner" },
          h("div", { class: "fb-ht-step__rail" },
            h("span", { class: "fb-ht-step__num", "aria-hidden": "true" }, "3"),
            h("span", { class: "fb-ht-step__line", "aria-hidden": "true" }),
          ),
          h("div", { class: "fb-ht-step__body" },
            h("div", { class: "fb-ht-step__meta" },
              h("span", { class: "fb-ht-chip" }, "Tự chủ"),
              h("span", { class: "fb-ht-step__time" }, "Khi bạn sẵn sàng"),
            ),
            h("h2", { class: "fb-ht-step__title" }, "Cùng chọn hoạt động 4 tuần — hai bên cùng đồng ý"),
            h("p", { class: "fb-ht-step__desc" },
              "Chương trình bốn tuần gợi ý những hoạt động nhẹ nhàng cho cặp học sinh và " +
              "người chăm sóc. Không bài kiểm tra, không chấm điểm — bạn tự chọn hoạt động " +
              "muốn cùng thực hiện:",
            ),
            h("div", { class: "fb-ht-journey" },
              h("div", { class: "fb-ht-journey__head" },
                h("span", {}, "Hành trình 4 tuần gợi ý"),
                h("span", {}, "Không tính điểm hay xếp hạng"),
              ),
              h("div", { class: "fb-ht-journey__grid" }, journeyCells),
            ),
            h("p", { class: "fb-ht-step__desc" },
              "Khi bạn gửi lời mời tham gia một hoạt động, lời mời cần cả hai bên đồng ý thì " +
              "cặp hoạt động mới bắt đầu — không ai bị ép tham gia và không bị khóa tuần nào.",
            ),
          ),
        ),
      ),
    );

    // ---- STEP 4: nhật ký/cảm xúc là của riêng bạn — chỉ chia sẻ khi chủ động ----
    stepEls.push(
      h("section", { class: "fb-ht-step fb-ht-step--last", id: "fb-ht-step-4" },
        h("div", { class: "fb-ht-step__inner" },
          h("div", { class: "fb-ht-step__rail" },
            h("span", { class: "fb-ht-step__num", "aria-hidden": "true" }, "4"),
          ),
          h("div", { class: "fb-ht-step__body" },
            h("div", { class: "fb-ht-step__meta" },
              h("span", { class: "fb-ht-chip" }, "Riêng tư"),
              h("span", { class: "fb-ht-step__time" }, "Bạn quyết định"),
            ),
            h("h2", { class: "fb-ht-step__title" }, "Nhật ký và cảm xúc là của riêng bạn"),
            h("p", { class: "fb-ht-step__desc" },
              "Nhật ký, ghi chú cảm xúc và thư nháp chỉ thuộc về bạn. Người đồng hành không " +
              "thể tự ý đọc — chỉ khi bạn chủ động chọn chia sẻ thì nội dung mới được nhìn thấy.",
            ),
            h("p", { class: "fb-ht-step__desc" },
              "Khi muốn mở lời, ghi nhận cảm xúc bằng thẻ cảm xúc và hộp thư trao đổi là những " +
              "cách nhẹ nhàng — bạn chọn cách mình thấy thoải mái nhất:",
            ),
            h("div", { class: "fb-ht-modes" },
              h("div", { class: "fb-ht-mode" },
                h("span", { class: "fb-ht-mode__icon" },
                  createIcon({ name: "favorite", size: 16 }),
                ),
                h("h3", { class: "fb-ht-mode__title" }, "Ghi nhận cảm xúc"),
                h("p", { class: "fb-ht-mode__text" },
                  "Chọn một thẻ tâm trạng hôm nay cho riêng mình hoặc bấm chia sẻ nếu muốn " +
                  "đối phương thấu hiểu.",
                ),
              ),
              h("div", { class: "fb-ht-mode" },
                h("span", { class: "fb-ht-mode__icon" },
                  createIcon({ name: "tips_and_updates", size: 16 }),
                ),
                h("h3", { class: "fb-ht-mode__title" }, "Gợi ý mở lời"),
                h("p", { class: "fb-ht-mode__text" },
                  "Dùng các câu bắt đầu có sẵn khi thấy ngập ngừng hoặc khó diễn đạt bằng lời.",
                ),
              ),
              h("div", { class: "fb-ht-mode" },
                h("span", { class: "fb-ht-mode__icon" },
                  createIcon({ name: "mail", size: 16 }),
                ),
                h("h3", { class: "fb-ht-mode__title" }, "Hộp thư trao đổi"),
                h("p", { class: "fb-ht-mode__text" },
                  "Viết thư ngắn không vội vã. Bạn có thời gian đọc lại và cân nhắc trước khi " +
                  "nhấn nút gửi — không gì được gửi đi nếu bạn không bấm.",
                ),
              ),
            ),
            h("p", { class: "fb-ht-ai-note" },
              createIcon({ name: "shield", size: 16 }),
              h("span", {},
                "Hệ thống không tự động gửi bất cứ nội dung nháp nào; AI (nếu bạn bật) chỉ hỗ " +
                "trợ diễn đạt khi có sự đồng ý của bạn.",
              ),
            ),
          ),
        ),
      ),
    );

    // ---- FAQ ----
    const faqEl = h("section", { class: "fb-ht-faq", id: "fb-ht-faq" },
      h("span", { class: "fb-ht-faq__eyebrow" },
        createIcon({ name: "info", size: 14 }),
        "Hỏi đáp thường gặp",
      ),
      h("h2", {}, "Những điều bạn có thể băn khoăn"),
    );
    const faqList = h("div", { class: "fb-ht-faq__list" });
    for (const item of FAQS) {
      const attrs = { class: "fb-ht-faq__item" };
      if (item.open) attrs.open = true;
      faqList.appendChild(
        h("details", attrs,
          h("summary", { class: "fb-ht-faq__q" },
            h("span", {}, item.q),
            h("span", { class: "fb-ht-faq__chev", "aria-hidden": "true" },
              createIcon({ name: "expand_more", size: 16 }),
            ),
          ),
          h("p", { class: "fb-ht-faq__a" }, item.a),
        ),
      );
    }
    faqEl.appendChild(faqList);

    // ---- Mục lục (aside) — nút cuộn tới bước, không đổi hash ----
    // step1Section tạo TRƯỚC khi build mục lục để tham chiếu cuộn đúng bước 1.
    const step1Section = h("section", { class: "fb-ht-step fb-ht-step--first", id: "fb-ht-step-1" },
      h("div", { class: "fb-ht-step__inner" },
        h("div", { class: "fb-ht-step__rail" },
          h("span", { class: "fb-ht-step__num", "aria-hidden": "true" }, "1"),
          h("span", { class: "fb-ht-step__line", "aria-hidden": "true" }),
        ),
        step1Body,
      ),
    );

    const stepTitles = [
      "Nhận tài khoản & đăng nhập",
      "Kiểm tra người đồng hành",
      "Cùng chọn hoạt động 4 tuần",
      "Nhật ký & cảm xúc riêng tư",
    ];
    const tocList = h("ul", { class: "fb-ht-toc__list" });
    // Thứ tự cuộn: bước 1 (đăng nhập) + 3 section còn lại trong stepEls.
    const stepSections = [step1Section, stepEls[0], stepEls[1], stepEls[2]];

    stepTitles.forEach((label, index) => {
      tocList.appendChild(
        h("li", { class: "fb-ht-toc__item" },
          h("button", {
            class: `fb-ht-toc__link${index === 0 ? " fb-ht-toc__link--active" : ""}`,
            type: "button",
            onclick: scrollToSection(stepSections[index]),
          },
            h("span", { class: "fb-ht-toc__num", "aria-hidden": "true" }, String(index + 1)),
            h("span", {}, label),
          ),
        ),
      );
    });
    tocList.appendChild(
      h("li", { class: "fb-ht-toc__item fb-ht-toc__item--faq" },
        h("button", {
          class: "fb-ht-toc__link",
          type: "button",
          onclick: scrollToSection(faqEl),
        },
          createIcon({ name: "info", size: 18, className: "fb-ht-toc__faq-icon" }),
          h("span", {}, "Hỏi đáp về quyền riêng tư"),
        ),
      ),
    );

    aside.appendChild(
      h("nav", { class: "fb-ht-toc", "aria-label": "Mục lục hướng dẫn" },
        h("div", { class: "fb-ht-toc__head" },
          h("h2", { class: "fb-ht-toc__title" }, "Mục lục trang"),
          h("span", { class: "fb-ht-toc__count" }, "4 bước"),
        ),
        tocList,
      ),
    );

    aside.appendChild(
      h("div", { class: "fb-ht-privacy" },
        h("div", { class: "fb-ht-privacy__top" },
          h("span", { class: "fb-ht-privacy__icon" },
            createIcon({ name: "lock", size: 16 }),
          ),
          h("div", {},
            h("h3", { class: "fb-ht-privacy__title" }, "Ranh giới riêng tư rõ ràng"),
            h("p", { class: "fb-ht-privacy__text" },
              "Người đồng hành không thể tự ý đọc nhật ký, cảm xúc hay thư riêng của bạn. " +
              "Bạn luôn giữ quyền quyết định chia sẻ từng mục.",
            ),
          ),
        ),
        h("div", { class: "fb-ht-privacy__foot" },
          h("span", { class: "fb-ht-privacy__foot-label" }, "Cần giải đáp ngay?"),
          h("a", { class: "fb-ht-privacy__foot-link", href: "#/help" },
            "Tìm trợ giúp",
            createIcon({ name: "arrow_forward", size: 14 }),
          ),
        ),
      ),
    );

    // ---- Ghép layout: step 1 vào đầu luồng bước ----
    steps.appendChild(step1Section);
    for (const el of stepEls) steps.appendChild(el);
    steps.appendChild(faqEl);

    // ---- Banner CTA cuối ----
    const ctaActions = h("div", { class: "fb-ht-cta__actions" },
      h("button", {
        class: "fb-ht-btn fb-ht-btn--secondary",
        type: "button",
        onclick: () => ctx.navigate("/role-select"),
      },
        h("span", {}, "Xem các góc nhìn"),
      ),
      h("button", {
        class: "fb-ht-btn fb-ht-btn--primary",
        type: "button",
        onclick: () => ctx.navigate("/login"),
      },
        h("span", {}, "Tiếp tục để đăng nhập"),
      ),
    );
    steps.appendChild(
      h("section", { class: "fb-ht-cta", "aria-label": "Bắt đầu sử dụng" },
        h("div", { class: "fb-ht-cta__text" },
          h("h3", {}, "Sẵn sàng bắt đầu trò chuyện?"),
          h("p", {},
            "Đăng nhập bằng mã tài khoản được bàn giao để vào không gian đồng hành của bạn.",
          ),
        ),
        ctaActions,
      ),
    );

    // ---- Ghi chú chế độ xem trước (trung thực về ?demo=1) ----
    steps.appendChild(
      h("p", { class: "fb-ht-note", role: "note" },
        "Chế độ xem trước (?demo=1) dùng dữ liệu minh họa, không tạo phiên thật.",
      ),
    );

    const layout = h("div", { class: "fb-ht-layout" }, aside, steps);
    main.appendChild(layout);
    root.appendChild(main);
    root.appendChild(renderPublicFooter());
    return root;
  },
};
