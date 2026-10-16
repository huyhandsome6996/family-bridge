// Fixtures synthetic — DỮ LIỆU MINH HỌA, không phải người thật.
// Quy tắc an toàn (đề bài VII):
//  - Danh bạ demo KHÔNG chứa số điện thoại có thể gọi.
//  - Khi chưa có đầu mối xác minh -> hiển thị "Thông tin đang được xác minh".
//  - Không bịa hotline, không tuyên bố trực 24/7, không hứa chữa trị.

export const DEMO_LABEL = "Dữ liệu minh họa";

export const fixtures = {
  demoPeer: {
    displayLabel: "Người đồng hành (minh họa)",
    relationship: "Cha mẹ",
    note: "Kết nối này chỉ là dữ liệu minh họa để xem trước giao diện, không phải kết nối thật.",
  },

  demoProfile(role) {
    if (role === "caregiver") {
      return {
        role,
        displayName: "Phụ huynh Minh Tâm (minh họa)",
        connectedStudent: "Con: Bảo Nam (minh họa)",
      };
    }
    return {
      role,
      displayName: "Học sinh Bảo Nam (minh họa)",
      connectedCaregiver: "Người đồng hành: Phụ huynh Minh Tâm (minh họa)",
    };
  },

  // Lộ trình 4 tuần — nội dung tóm tắt theo docs/project-scope.md và
  // docs/product/four-week-flow.md, dùng cho màn Đồng hành mức xem trước.
  weeks: [
    {
      number: 1,
      title: "Nhận diện cảm xúc",
      theme: "Tiếng lòng chưa nói",
      summary: "Học cách gọi tên cảm xúc của mình và chia sẻ điều buồn còn khó mở lời.",
      status: "preview",
    },
    {
      number: 2,
      title: "Giảm so sánh",
      theme: "Bản sắc riêng của con",
      summary: "Ghi nhận cố gắng thay vì so sánh; luyện lắng nghe và dành thời gian cho nhau.",
      status: "coming-soon",
    },
    {
      number: 3,
      title: "Ranh giới riêng tư và niềm tin",
      theme: "Không gian cá nhân được tôn trọng",
      summary: "Thống nhất tôn trọng không gian cá nhân, điện thoại và thông tin riêng.",
      status: "coming-soon",
    },
    {
      number: 4,
      title: "Cảm ơn, xin lỗi",
      theme: "Thỏa ước gia đình mới",
      summary: "Xác nhận những việc cụ thể gia đình sẽ tiếp tục làm sau chương trình.",
      status: "coming-soon",
    },
  ],

  // Danh bạ trợ giúp demo: KHÔNG có số điện thoại. Chỉ mô tả kiểu đầu mối
  // và trạng thái xác minh — số thật sẽ do danh bạ đã duyệt cung cấp (FL-17).
  helpTopics: [
    {
      title: "Đầu mối hỗ trợ của trường",
      detail: "Thông tin đang được xác minh.",
      verified: false,
    },
    {
      title: "Đầu mối tư vấn tâm lý học đường",
      detail: "Thông tin đang được xác minh.",
      verified: false,
    },
  ],
};
