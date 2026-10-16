// Hub Đồng hành — lộ trình 4 tuần mức XEM TRƯỚC, render tĩnh từ copy trong
// page (không import fixtures từ src/core, không gọi adapter). Tuần 1 mở
// được Sheet xem trước chủ đề; tuần 2–4 chỉ badge "Sắp có".
import { h } from "../../app/dom.js";
import { createButton, createCard, createSheet, createStatusBadge, createTopBar } from "../../components/index.js";

const WEEKS = [
  {
    number: 1,
    title: "Nhận diện cảm xúc",
    theme: "Tiếng lòng chưa nói",
    summary: "Học cách gọi tên cảm xúc của mình và chia sẻ điều buồn còn khó mở lời.",
    available: true,
  },
  {
    number: 2,
    title: "Giảm so sánh",
    theme: "Bản sắc riêng của con",
    summary: "Ghi nhận cố gắng thay vì so sánh; luyện lắng nghe và dành thời gian cho nhau.",
    available: false,
  },
  {
    number: 3,
    title: "Ranh giới riêng tư và niềm tin",
    theme: "Không gian cá nhân được tôn trọng",
    summary: "Thống nhất tôn trọng không gian cá nhân, điện thoại và thông tin riêng.",
    available: false,
  },
  {
    number: 4,
    title: "Cảm ơn, xin lỗi",
    theme: "Thỏa ước gia đình mới",
    summary: "Xác nhận những việc cụ thể gia đình sẽ tiếp tục làm sau chương trình.",
    available: false,
  },
];

function openWeekSheet(root, week) {
  let sheet;
  sheet = createSheet({
    title: `Tuần ${week.number} — ${week.theme}`,
    content: h("div", {},
      h("p", {}, week.summary),
      h("p", { class: "fb-page__note" }, "Chủ đề đầy đủ sẽ mở ở bản đầy đủ của ứng dụng."),
    ),
    onClose: () => {
      if (sheet && sheet.isConnected) sheet.remove();
    },
  });
  root.appendChild(sheet);
}

export const page = {
  id: "companion",
  title: "Đồng hành",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "companion" } });

    root.appendChild(createTopBar({ title: "Đồng hành" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(h("h2", { class: "fb-page__heading" }, "Lộ trình Đồng hành 4 tuần"));
    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Lộ trình tự nguyện, bạn có thể bỏ qua hoặc quay lại bất cứ lúc nào.",
      ),
    );

    for (const week of WEEKS) {
      const footer = week.available
        ? createButton({
            label: "Xem trước chủ đề",
            variant: "ghost",
            onClick: () => openWeekSheet(root, week),
          })
        : null;

      const children = week.available
        ? null
        : createStatusBadge({ tone: "neutral", label: "Sắp có" });

      body.appendChild(
        createCard({
          title: `Tuần ${week.number} — ${week.title}: ${week.theme}`,
          description: week.summary,
          children,
          footer,
        }),
      );
    }

    return root;
  },
};
