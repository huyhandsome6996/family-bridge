// Phiên bản chính sách/điều khoản theo từng mục đích đồng ý (WF-17).
// Khi ban hành bản mới, TĂNG phiên ở đây — bản ghi đồng ý cũ không tự động
// thành đồng ý của bản mới (backend lưu sổ cái theo purpose+policy_version).
export const POLICY_PURPOSES = {
  service: {
    purpose: "service",
    version: "service-v1",
    required: true,
    title: "Điều khoản sử dụng",
    description:
      "Cần chấp nhận để dùng Family Bridge: quy tắc ứng xử, trách nhiệm gia đình và giới hạn hỗ trợ. Không thay thế hỗ trợ chuyên môn.",
  },
  ai_processing: {
    purpose: "ai_processing",
    version: "ai-v1",
    required: false,
    title: "AI gợi ý cách diễn đạt",
    description:
      "Tùy chọn. Cho phép AI gợi ý cách diễn đạt khi bạn viết tin nhắn. Bạn luôn xem và duyệt trước khi gửi; tắt vẫn dùng được các tính năng khác.",
  },
  research: {
    purpose: "research",
    version: "research-v1",
    required: false,
    title: "Nghiên cứu tổng hợp",
    description:
      "Tùy chọn. Cho phép dùng dữ liệu đã ẩn danh cho khảo sát nghiên cứu. Từ chối không ảnh hưởng việc sử dụng ứng dụng.",
  },
};

export const CONSENT_ORDER = ["service", "ai_processing", "research"];
