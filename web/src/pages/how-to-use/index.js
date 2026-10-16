// U02 — How to use: 4 bước sử dụng, ghi chú dữ liệu minh họa, CTA sang chọn vai trò.
import { h } from "../../app/dom.js";
import { createButton, createCard, createTopBar } from "../../components/index.js";

const STEPS = [
  {
    title: "Bước 1. Đăng nhập bằng mã tài khoản",
    description:
      "Mở Family Bridge trên web và đăng nhập bằng mã tài khoản + mật khẩu do người phụ trách lớp bàn giao. Mật khẩu chỉ giữ trong bộ nhớ trình duyệt và gửi thẳng qua HTTPS đến máy chủ.",
  },
  {
    title: "Bước 2. Kết nối hai bên bằng mã mời",
    description:
      "Một bên tạo mã mời 12 ký tự, bên kia nhập mã và đồng ý, người tạo mã xác nhận cuối cùng. Cả hai bên đều phải đồng ý thì kết nối mới được tạo — và kết nối không cho phép đọc nhật ký hay dữ liệu riêng của nhau.",
  },
  {
    title: "Bước 3. Dùng thẻ cảm xúc và hộp thư để mở lời",
    description:
      "Chọn một thẻ cảm xúc hoặc viết lời nhắn ngắn trong hộp thư để bắt đầu câu chuyện một cách nhẹ nhàng.",
  },
  {
    title: "Bước 4. Đồng hành 4 tuần tự nguyện",
    description:
      "Lộ trình 4 tuần gợi ý mỗi tuần một việc nhỏ để hai bên hiểu nhau hơn. Tự nguyện — bạn có thể bỏ qua hoặc quay lại bất cứ lúc nào.",
  },
];

export const page = {
  id: "u02-how-to-use",
  title: "Cách dùng Family Bridge",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "u02-how-to-use" } });

    root.appendChild(
      createTopBar({
        title: "Cách dùng Family Bridge",
        showBack: true,
        onBack: () => ctx.navigate("/welcome"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(h("h2", { class: "fb-page__heading" }, "Bốn bước để bắt đầu"));

    for (const step of STEPS) {
      body.appendChild(createCard({ title: step.title, description: step.description }));
    }

    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Chế độ xem trước (?demo=1) dùng dữ liệu minh họa, không tạo phiên thật.",
      ),
    );

    body.appendChild(
      createButton({
        label: "Tiếp tục",
        variant: "cta",
        size: "lg",
        onClick: () => ctx.navigate("/login"),
      }),
    );

    return root;
  },
};
