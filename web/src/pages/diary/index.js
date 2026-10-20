// Hub "Nhật ký & Cảm xúc" (route #/diary) — port bố cục Stitch
// references/stitch-original/stitch_family_bridge_companion_management/
// diary_current_nh_t_k_c_m_x_c_hi_n_h_nh (screen.png 1600x1560 + code.html).
//
// HUB LIÊN KẾT — TRUNG THỰC, KHÔNG GIẢ LẬP:
// - Trang này là hub điều hướng, KHÔNG phải trình soạn thảo: nói thẳng
//   "Nhật ký riêng chưa mở" — không ô nhập giả, không mục nhật ký/ngày
//   giả, không số liệu giả, không ảnh đại diện/badge chưa đọc giả, không
//   "nộp bài". Không hiển thị mã tính năng (F08…) trong UI.
// - "Lối đi nhanh" chỉ dẫn route THẬT đang hoạt động: #/mood (Cảm xúc),
//   #/mood-shared (ghi đúng bản chất: mục TÂM TRẠNG được người đồng hành
//   chủ động chia sẻ — KHÔNG gọi là "nhật ký được chia sẻ"), #/privacy
//   (Quyền riêng tư). Không bịa route mới.
// - Copy trung thực: không "bảo mật tuyệt đối"/"tự chủ tuyệt đối". Cam kết
//   nói đúng cơ chế: chỉ khi bạn chủ động chia sẻ, người đồng hành mới xem
//   được trang đó. Gợi ý sổ giấy là văn bản tĩnh cho phép (không upload).
// - Chip "Chưa phát hành" chỉ nói về TÍNH NĂNG nhật ký; trang này nằm trong
//   app-shell nên không có gợi ý "cần đăng nhập" nào để phân biệt.
// - Topbar tham chiếu ghi nhầm "Người đồng hành" — sửa thành "Nhật ký"
//   (đúng tiêu đề trang).
import "../../styles/pages-diary.css";

import { h } from "../../app/dom.js";
import { createIcon, createTopBar } from "../../components/index.js";

// SVG minh họa quyển sổ — markup TĨNH trong file này (không dữ liệu người
// dùng), cùng quy tắc innerHTML-tĩnh như createTopBar/createSheet. Màu lấy
// đúng giá trị token: #FFE9E5 (surface-container), #9D3D27 (primary),
// #8A726C (outline).
const BOOK_SVG =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" '
  + 'stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" '
  + 'aria-hidden="true" focusable="false">'
  + '<path d="M32 46c-5-4-13-5-20-4v-24c7-1 15 0 20 4m0 20c5-4 13-5 20-4'
  + 'v-24c-7-1-15 0-20 4m0 20v-20" fill="#FFE9E5"></path>'
  + '<path d="M22 22v12l4-3 4 3V22" fill="#9D3D27" opacity="0.8" stroke="none"></path>'
  + '<line stroke="#8A726C" stroke-width="1.5" x1="16" x2="26" y1="28" y2="28"></line>'
  + '<line stroke="#8A726C" stroke-width="1.5" x1="16" x2="24" y1="33" y2="33"></line>'
  + '<line stroke="#8A726C" stroke-width="1.5" x1="38" x2="48" y1="28" y2="28"></line>'
  + '<line stroke="#8A726C" stroke-width="1.5" x1="38" x2="46" y1="33" y2="33"></line>'
  + '<path d="M42 20c-1.5-1.5-4 0-4 1.5 0 1.5 4 4.5 4 4.5s4-3 4-4.5c0-1.5-2.5-3-4-1.5z" '
  + 'fill="#9D3D27" stroke="none"></path>'
  + "</svg>";

/* ------------------------------- Đầu trang ------------------------------- */

function headBlock() {
  const head = h("div", { class: "fb-diary__head" });
  head.appendChild(
    h("p", { class: "fb-diary__tagline" },
      "Một khoảng riêng để hiểu mình hơn."),
  );
  // Dải tin cậy: nói đúng cơ chế chia sẻ từng trang — không "tuyệt đối".
  head.appendChild(
    h("aside", { class: "fb-diary__privacy", "aria-label": "Cam kết riêng tư" },
      h("span", { class: "fb-diary__privacy-icon", "aria-hidden": "true" },
        createIcon({ name: "shield", size: 18, fill: true })),
      h("p", { class: "fb-diary__privacy-text" },
        "Nội dung riêng ",
        h("strong", {}, "không tự động chia sẻ"),
        " với người đồng hành."),
    ),
  );
  return head;
}

/* ------------------- Thẻ 1: nhật ký riêng chưa mở ------------------- */

function statusCard() {
  const card = h("article", { class: "fb-scard fb-diary__status" });
  card.appendChild(
    h("span", { class: "fb-diary__deco", "aria-hidden": "true" }));

  const head = h("div", { class: "fb-diary__status-head" });
  const tile = h("span", { class: "fb-diary__tile", "aria-hidden": "true" });
  tile.appendChild(createIcon({ name: "edit_note", size: 24 }));
  head.appendChild(
    h("div", { class: "fb-diary__idrow" },
      tile,
      h("div", { class: "fb-diary__idtext" },
        h("h2", { class: "fb-diary__title" }, "Nhật ký riêng chưa mở"),
        h("p", { class: "fb-diary__subtitle" },
          "Không gian an toàn cho những dòng suy ngẫm chân thật"),
      ),
    ),
  );
  // Trạng thái tính năng — trung thực, không mã, không "Đang phát triển".
  head.appendChild(
    h("span", { class: "fb-diary__statuschip" },
      h("span", { class: "fb-diary__dot", "aria-hidden": "true" }),
      "Chưa phát hành"),
  );
  card.appendChild(head);

  const art = h("span", { class: "fb-diary__book-art", "aria-hidden": "true" });
  art.innerHTML = BOOK_SVG; // chuỗi tĩnh trong file này
  card.appendChild(
    h("div", { class: "fb-diary__book" },
      art,
      h("div", { class: "fb-diary__book-body" },
        h("h3", { class: "fb-diary__book-title" }, "Bạn tự quyết từng trang"),
        h("p", { class: "fb-diary__book-text" },
          "Nhật ký là nội dung riêng của bạn. Chỉ khi bạn chủ động chia sẻ, "
          + "người đồng hành mới xem được trang đó."),
      ),
    ),
  );

  // Thông báo trung thực: chưa có trình soạn thảo — không ô nhập giả.
  card.appendChild(
    h("p", { class: "fb-diary__notice" },
      h("span", { class: "fb-diary__notice-icon", "aria-hidden": "true" },
        createIcon({ name: "info", size: 18 })),
      h("span", { class: "fb-diary__notice-text" },
        "Nhật ký sẽ mở ở bản đầy đủ — hiện chưa có ô soạn thảo trên web. "
        + "Khi mở, bạn chọn chia sẻ trang đó hay giữ riêng cho mình."),
    ),
  );
  return card;
}

/* ------------------- Thẻ 2: nếu bạn thích viết trên giấy ------------------- */

const PAPER_PROMPTS = [
  {
    title: "Hôm nay mình cảm thấy…",
    text: "Nhận diện cảm giác hiện tại mà không cần phán xét. Đặt tên cho "
      + "cảm xúc là bước đầu để lắng nghe mình.",
  },
  {
    title: "Điều mình muốn giữ lại…",
    text: "Một khoảnh khắc, một lời nói hoặc một niềm vui nhỏ bất ngờ trong "
      + "ngày mà bạn cảm thấy biết ơn.",
  },
  {
    title: "Một điều nhỏ mình cần…",
    text: "Khoảng nghỉ, một cái ôm, hay chỉ là sự yên tĩnh để nạp lại năng "
      + "lượng cho tâm trí.",
  },
];

function paperCard() {
  const card = h("article", { class: "fb-scard fb-diary__paper" });
  card.appendChild(
    h("p", { class: "fb-diary__kicker" },
      h("span", { class: "fb-diary__kicker-icon", "aria-hidden": "true" },
        createIcon({ name: "spa", size: 16 })),
      h("span", {}, "Gợi ý chiêm nghiệm"),
    ),
  );
  card.appendChild(h("h2", { class: "fb-diary__title" }, "Nếu bạn thích viết trên giấy"));
  card.appendChild(
    h("p", { class: "fb-diary__subtitle" }, "Ba câu gợi mở cho hôm nay"));

  const list = h("div", { class: "fb-diary__prompts" });
  PAPER_PROMPTS.forEach((prompt, index) => {
    list.appendChild(
      h("div", { class: "fb-diary__prompt" },
        h("div", { class: "fb-diary__prompt-head" },
          h("span", { class: "fb-diary__prompt-num", "aria-hidden": "true" },
            String(index + 1)),
          h("h3", { class: "fb-diary__prompt-title" }, prompt.title),
        ),
        h("p", { class: "fb-diary__prompt-text" }, prompt.text),
      ),
    );
  });
  card.appendChild(list);

  // Ranh giới giấy-first: chỉ là gợi ý tĩnh — không upload, không "nộp bài".
  card.appendChild(
    h("p", { class: "fb-diary__paper-note" },
      h("span", { class: "fb-diary__paper-icon", "aria-hidden": "true" },
        createIcon({ name: "menu_book", size: 18 })),
      h("span", { class: "fb-diary__paper-note-text" },
        "Bạn có thể viết ra sổ giấy của riêng bạn — không cần tải lên hay "
        + "nộp bài."),
    ),
  );
  return card;
}

/* -------------------------- Lối đi nhanh (route thật) -------------------------- */

const QUICK_LINKS = [
  {
    href: "#/mood",
    icon: "favorite",
    title: "Cảm xúc",
    desc: "Ghi nhận và theo dõi cảm xúc mỗi ngày.",
  },
  {
    href: "#/mood-shared",
    icon: "diversity_1",
    title: "Được chia sẻ với bạn",
    desc: "Mục tâm trạng mà người đồng hành chủ động gửi cho bạn "
      + "(không phải nhật ký cá nhân).",
  },
  {
    href: "#/privacy",
    icon: "shield",
    title: "Quyền riêng tư",
    desc: "Kiểm soát quyền riêng tư và các quyền chia sẻ của bạn.",
  },
];

function quickLinksCard() {
  const card = h("section", { class: "fb-scard" });
  card.appendChild(
    h("div", { class: "fb-sec__row" },
      h("h2", { class: "fb-scard__title" }, "Lối đi nhanh"),
      h("span", { class: "fb-chip" }, "Sẵn sàng sử dụng"),
    ),
  );
  card.appendChild(
    h("p", { class: "fb-diary__subtitle" },
      "Các trang cảm xúc & chia sẻ bạn có thể mở ngay:"),
  );

  const list = h("div", { class: "fb-diary__links" });
  QUICK_LINKS.forEach((link) => {
    const icon = h("span", { class: "fb-diary__link-icon", "aria-hidden": "true" });
    icon.appendChild(createIcon({ name: link.icon, size: 20 }));
    const arrow = h("span", { class: "fb-diary__link-arrow", "aria-hidden": "true" });
    arrow.appendChild(createIcon({ name: "arrow_forward", size: 18 }));
    list.appendChild(
      h("a", { class: "fb-diary__link", href: link.href },
        icon,
        h("span", { class: "fb-diary__link-main" },
          h("span", { class: "fb-diary__link-row" },
            h("span", { class: "fb-diary__link-title" }, link.title),
            arrow,
          ),
          h("span", { class: "fb-diary__link-desc" }, link.desc),
        ),
      ),
    );
  });
  card.appendChild(list);
  return card;
}

/* ---------------------- FAQ quyền riêng tư & ranh giới ---------------------- */

function faqDetails({ question, open = false }) {
  const details = h("details", { class: "fb-diary__faq-item" });
  if (open) details.setAttribute("open", "");
  const icon = h("span", { class: "fb-diary__faq-icon", "aria-hidden": "true" });
  icon.appendChild(createIcon({ name: "expand_more", size: 20 }));
  details.appendChild(
    h("summary", { class: "fb-diary__faq-summary" },
      h("span", { class: "fb-diary__faq-question" }, question),
      icon,
    ),
  );
  return details;
}

function faqCard() {
  const card = h("section", { class: "fb-scard" });
  card.appendChild(
    h("p", { class: "fb-diary__kicker fb-diary__kicker--primary" },
      h("span", { class: "fb-diary__kicker-icon", "aria-hidden": "true" },
        createIcon({ name: "verified_user", size: 16 })),
      h("span", {}, "Ranh giới an toàn"),
    ),
  );
  card.appendChild(
    h("h2", { class: "fb-scard__title" }, "Quyền riêng tư & Ranh giới"));

  const faq = h("div", { class: "fb-diary__faq" });

  // Câu trả lời nói đúng cơ chế chia sẻ từng trang, không tuyên bố "tuyệt đối".
  const item1 = faqDetails({
    question: "Người đồng hành có tự đọc được nhật ký không?",
    open: true,
  });
  item1.appendChild(
    h("div", { class: "fb-diary__faq-answer" },
      h("p", {},
        "Không tự động. Chỉ khi bạn chủ động chia sẻ một trang, người đồng "
        + "hành mới xem được trang đó."),
    ),
  );
  faq.appendChild(item1);

  const item2 = faqDetails({
    question: "Nếu sau này chia sẻ, mình có chọn từng trang không?",
  });
  item2.appendChild(
    h("div", { class: "fb-diary__faq-answer" },
      h("p", {},
        "Có. Mỗi lần chia sẻ là một quyết định riêng cho từng mục, và bạn có "
        + "thể thu hồi bất cứ lúc nào."),
    ),
  );
  faq.appendChild(item2);

  const item3 = faqDetails({ question: "Tìm quyền chia sẻ ở đâu?" });
  item3.appendChild(
    h("div", { class: "fb-diary__faq-answer" },
      h("p", {},
        "Bạn luôn có thể xem lại và điều chỉnh trong trang Quyền riêng tư."),
      h("a", { class: "fb-diary__faq-link", href: "#/privacy" },
        "Mở trang Quyền riêng tư"),
    ),
  );
  faq.appendChild(item3);

  card.appendChild(faq);
  return card;
}

/* --------------------------------- Page --------------------------------- */

export const page = {
  id: "diary",
  title: "Nhật ký",
  requiresRole: true,
  showBottomNav: true,
  chrome: "app", // render trong app-shell dùng chung — không tự dựng sidebar

  render(ctx) {
    const root = h("div", {
      class: "fb-page fb-page--web fb-diary",
      dataset: { page: "diary" },
    });

    // Topbar đúng tiêu đề trang (tham chiếu Stitch ghi nhầm "Người đồng hành").
    root.appendChild(createTopBar({ title: "Nhật ký" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(headBlock());

    const grid = h("div", { class: "fb-diary__grid" });
    const main = h("div", { class: "fb-diary__col" });
    main.appendChild(statusCard());
    main.appendChild(paperCard());
    const aside = h("div", { class: "fb-diary__col" });
    aside.appendChild(quickLinksCard());
    aside.appendChild(faqCard());
    grid.appendChild(main);
    grid.appendChild(aside);
    body.appendChild(grid);

    return root;
  },
};
