// M02 — Cách dùng (Stitch handoff 2026-10-21). Frame tham chiếu:
// m02_c_ch_d_ng_family_bridge (bố cục 4 bước đánh số + khối cam kết; đã loại
// "Cam kết hỗ trợ miễn phí/chuyên viên 24/7" chưa có nguồn theo DESIGN-REVIEW).
//
// Giữ nguyên nội dung nghiệp vụ đã duyệt: 4 bước, tách rõ hai cơ chế ghép nối
// (cặp do quản trị viên cấp ACTIVE vs mã mời tự nguyện hai phía), ghi chú
// dữ liệu minh họa cho ?demo=1, CTA dẫn /login.
import { h } from "../../app/dom.js";
import { createButton, createIcon, createTopBar } from "../../components/index.js";

const STEPS = [
  {
    title: "Đăng nhập bằng mã tài khoản",
    description:
      "Mở Family Bridge và đăng nhập bằng mã tài khoản + mật khẩu do người phụ trách lớp bàn giao. Mật khẩu chỉ giữ trong bộ nhớ và gửi thẳng qua HTTPS đến máy chủ.",
  },
  {
    title: "Kết nối hai bên bằng mã mời",
    description:
      "Một bên tạo mã mời 12 ký tự, bên kia nhập mã và đồng ý, người tạo mã xác nhận cuối cùng. Cả hai bên đều phải đồng ý thì kết nối mới được tạo — và kết nối không cho phép đọc nhật ký hay dữ liệu riêng của nhau.",
  },
  {
    title: "Dùng thẻ cảm xúc và hộp thư để mở lời",
    description:
      "Chọn một thẻ cảm xúc hoặc viết lời nhắn ngắn trong hộp thư để bắt đầu câu chuyện một cách nhẹ nhàng.",
  },
  {
    title: "Đồng hành 4 tuần tự nguyện",
    description:
      "Lộ trình 4 tuần gợi ý mỗi tuần một việc nhỏ để hai bên hiểu nhau hơn. Tự nguyện — bạn có thể bỏ qua hoặc quay lại bất cứ lúc nào.",
  },
];

/** Hai cơ chế ghép nối (SCREEN-MAP M02: tách cặp admin ACTIVE với mã mời). */
const PAIRING_WAYS = [
  {
    icon: "verified_user",
    text: "Cặp do quản trị viên cấp: đã kích hoạt sẵn (ACTIVE), sẵn sàng trò chuyện ngay khi đăng nhập.",
  },
  {
    icon: "send",
    text: "Mã mời tự nguyện: hai bên cùng nhập/đồng ý, người tạo mã xác nhận cuối cùng.",
  },
];

/** Bốn cam kết vận hành (copy trung thực, không hứa hẹn chưa có nguồn). */
const COMMITMENTS = [
  {
    icon: "lock",
    title: "Ghi chép riêng không tự chia sẻ",
    text: "Nhật ký và bản nháp chỉ đi đến người kia khi bạn chủ động chọn chia sẻ từng mục và bấm gửi.",
  },
  {
    icon: "psychology_alt",
    title: "AI là tùy chọn hỗ trợ",
    text: "Gợi ý diễn đạt chỉ chạy khi bạn yêu cầu và có đồng ý riêng; bạn luôn xem, sửa hoặc gạt gợi ý trước khi gửi.",
  },
  {
    icon: "hourglass_top",
    title: "Khoảng dừng 5 phút chủ động",
    text: "Chế độ đệm 300 giây giúp bạn tĩnh tâm; hết giờ thư vẫn là bản nháp trên máy chủ, không tự gửi.",
  },
  {
    icon: "favorite",
    title: "Mỗi gia đình một nhịp độ",
    text: "Không áp lực trả lời ngay. Bạn có thể nghỉ chương trình hoặc quay lại bất cứ lúc nào.",
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

    // Header theo frame: kicker + tiêu đề + mô tả
    const head = h("header", { class: "fb-htu__head" });
    head.appendChild(
      h("span", { class: "fb-htu__kicker" },
        createIcon({ name: "menu_book", size: 16 }),
        "Hướng dẫn khởi hành",
      ),
    );
    head.appendChild(h("h2", { class: "fb-htu__heading" }, "Bốn bước để bắt đầu"));
    head.appendChild(
      h("p", { class: "fb-htu__sub" },
        "Family Bridge giúp học sinh THPT và người chăm sóc lắng nghe nhau "
        + "trọn vẹn hơn. Mỗi bước bạn đều chủ động quyết định.",
      ),
    );
    body.appendChild(head);

    // Bốn bước đánh số (frame: số trong hình tròn + card nội dung)
    STEPS.forEach((step, index) => {
      const row = h("section", { class: "fb-htu-step" });
      row.appendChild(
        h("span", { class: "fb-htu-step__n", "aria-hidden": "true" }, String(index + 1)),
      );
      const card = h("div", { class: "fb-htu-step__card" });
      card.appendChild(h("h3", { class: "fb-htu-step__title" }, step.title));
      card.appendChild(h("p", { class: "fb-htu-step__desc" }, step.description));
      // Bước 2: tách hai cơ chế ghép nối thành hai hàng con
      if (index === 1) {
        const ways = h("div", { class: "fb-htu-step__ways" });
        PAIRING_WAYS.forEach(({ icon, text }) => {
          const way = h("p", { class: "fb-htu-step__way" });
          way.appendChild(
            createIcon({ name: icon, size: 18, className: "fb-htu-step__way-icon" }),
          );
          way.appendChild(h("span", {}, text));
          ways.appendChild(way);
        });
        card.appendChild(ways);
      }
      row.appendChild(card);
      body.appendChild(row);
    });

    // Khối cam kết (frame: "Nguyên tắc tâm lý an toàn")
    const commit = h("section", { class: "fb-htu-commit" });
    commit.appendChild(
      h("h3", { class: "fb-htu-commit__title" },
        createIcon({ name: "shield", size: 18, className: "fb-htu-commit__icon" }),
        "Nguyên tắc tâm lý an toàn",
      ),
    );
    COMMITMENTS.forEach(({ icon, title, text }) => {
      const item = h("div", { class: "fb-htu-commit__item" });
      const circle = h("span", { class: "fb-htu-commit__icon-circle", "aria-hidden": "true" });
      circle.appendChild(createIcon({ name: icon, size: 18 }));
      item.appendChild(circle);
      item.appendChild(
        h("div", {},
          h("span", { class: "fb-htu-commit__item-title" }, title),
          h("p", { class: "fb-htu-commit__item-text" }, text),
        ),
      );
      commit.appendChild(item);
    });
    body.appendChild(commit);

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

    body.appendChild(
      h("p", { class: "fb-page__aside" },
        h("a", { href: "#/help" },
          createIcon({ name: "support_agent", size: 16, className: "fb-htu__help-icon" }),
          " Tìm trợ giúp học đường & tâm lý",
        ),
      ),
    );

    return root;
  },
};
