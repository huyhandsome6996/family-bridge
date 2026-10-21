// Help — LUÔN hiển thị, không cần đăng nhập/kết nối (cả khi soạn thư đang
// tạm dừng). Đầu mối chưa được xác minh → CHỈ hiển thị trạng thái "đang xác
// minh" hiện hành; KHÔNG số điện thoại/hotline/nút gọi/lịch hẹn; không cam
// kết tuyệt đối (an toàn nội dung Task 2-a + DESIGN-REVIEW M22).
import { h } from "../../app/dom.js";
import {
  createCard, createIcon, createStatusBadge, createTopBar,
} from "../../components/index.js";

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
        onBack: () => ctx.navigate(ctx.store.getState().role ? "/home" : "/welcome"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    // Hero (frame M22): không gian an toàn & tin cậy — hướng dẫn trung thực.
    body.appendChild(
      h("section", { class: "fbc-banner" },
        h("span", { class: "fbc-banner__icon", "aria-hidden": "true" },
          createIcon({ name: "volunteer_activism", size: 20 })),
        h("div", { class: "fbc-banner__body" },
          h("h2", { class: "fbc-banner__title" }, "Bạn không phải vượt qua một mình"),
          h("p", { class: "fbc-banner__text" },
            "Khi gặp khó khăn về cảm xúc, hãy tìm một người lớn mà bạn tin tưởng — "
            + "cha mẹ, người thân hoặc giáo viên — và chia sẻ những gì bạn đang cảm thấy."),
        ),
      ),
    );

    body.appendChild(
      createCard({
        title: "Đầu mối hỗ trợ",
        description:
          "Khi cần người ngoài gia đình để tâm sự, bạn có thể tìm các đầu mối dưới đây.",
        children: h("div", {},
          h("div", { class: "fbc-contact-list" },
            HELP_CONTACTS.map((contact) =>
              h("div", { class: "fbc-contact" },
                h("span", { class: "fbc-contact__icon", "aria-hidden": "true" },
                  createIcon({ name: "support_agent", size: 20 })),
                h("div", { class: "fbc-contact__body" },
                  h("span", { class: "fbc-contact__title" }, contact.title),
                  h("span", { class: "fbc-contact__note" }, contact.detail),
                ),
                h("span", { class: "fbc-contact__badge" },
                  createStatusBadge({ tone: "info", label: "Đang xác minh" })),
              )),
          ),
          h("p", { class: "fb-page__note" },
            "Khi danh bạ đầu mối đã được xác minh và duyệt, thông tin liên hệ sẽ hiển thị tại đây."),
        ),
      }),
    );

    // Gợi ý nhẹ nhàng (frame M22) — không hẹn giờ, không cam kết.
    body.appendChild(
      createCard({
        title: "Một gợi ý nhỏ cho lúc này",
        description:
          "Nếu bạn cảm thấy bối rối chưa biết bắt đầu từ đâu, hãy thử hít thở sâu "
          + "vài nhịp hoặc viết vài dòng cho riêng bạn. Khi đã sẵn sàng, một cuộc "
          + "trò chuyện ngắn với người mà bạn thấy yên tâm nhất luôn là khởi đầu tốt.",
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
