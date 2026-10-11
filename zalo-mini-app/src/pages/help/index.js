// Help — LUÔN hiển thị, không cần đăng nhập/kết nối. Đầu mối chưa được xác
// minh -> chỉ hiển thị "Thông tin đang được xác minh", KHÔNG bịa số điện
// thoại/hotline (an toàn nội dung Task 2-a: không tuyên bố trực 24/7).
import { h } from "../../app/dom.js";
import { createCard, createTopBar } from "../../components/index.js";

const HELP_CONTACTS = [
  { title: "Đầu mối hỗ trợ của trường", detail: "Thông tin đang được xác minh." },
  { title: "Đầu mối tư vấn tâm lý học đường", detail: "Thông tin đang được xác minh." },
];

export const page = {
  id: "help",
  title: "Tìm trợ giúp",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "help" } });

    root.appendChild(
      createTopBar({
        title: "Tìm trợ giúp",
        showBack: true,
        onBack: () => ctx.navigate("/welcome"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(h("h2", { class: "fb-page__heading" }, "Tìm trợ giúp"));

    body.appendChild(
      h("p", {},
        "Nếu bạn cần trò chuyện với ai đó ngay, hãy tìm một người lớn mà bạn tin tưởng — cha mẹ, người thân hoặc giáo viên — và chia sẻ những gì bạn đang cảm thấy.",
      ),
    );

    const contactList = h("ul", { class: "fb-list" });
    for (const contact of HELP_CONTACTS) {
      contactList.appendChild(
        h("li", { class: "fb-list__item" },
          h("h3", { class: "fb-list__title" }, contact.title),
          h("p", { class: "fb-page__note" }, contact.detail),
        ),
      );
    }

    body.appendChild(
      createCard({
        title: "Đầu mối hỗ trợ",
        description: "Khi cần người ngoài gia đình để tâm sự, bạn có thể tìm các đầu mối dưới đây.",
        children: h("div", {},
          contactList,
          h("p", { class: "fb-page__note" },
            "Khi danh bạ đầu mối đã được xác minh và duyệt, thông tin liên hệ sẽ hiển thị tại đây.",
          ),
        ),
      }),
    );

    body.appendChild(
      createCard({
        title: "Thông tin nhà phát triển",
        children: h("div", {},
          h("p", {}, "Ứng dụng: Family Bridge"),
          h("p", {}, "Phiên bản: 0.3.0 (US-003)"),
          h("p", {}, "Kênh hỗ trợ/khiếu nại: Thông tin đang được cập nhật."),
        ),
      }),
    );

    return root;
  },
};
