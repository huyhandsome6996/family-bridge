// Helper thuần để phân loại lỗi ở màn "Kiểm tra kết nối máy chủ" — tách từ
// zalo-mini-app/src/pages/connection-check/index.js theo ADR-1 (task 18-a),
// copy NGUYÊN VĂN để mini app và web hiển thị lỗi giống hệt nhau.
//
// Phân loại lỗi: CHỈ đọc thuộc tính `kind` của ApiError (không suy loại từ
// status 0, không dò câu thông báo). Năm loại:
//   - "timeout"          -> "Kết nối quá thời gian chờ" (AbortError từ timer client).
//   - "configuration"    -> "Chưa cấu hình địa chỉ máy chủ" (thiếu/sai địa chỉ backend).
//   - "network"          -> "Chưa kết nối được máy chủ" (fetch ném lỗi mạng).
//   - "invalid_response" -> "Không kiểm tra được kết nối" (JSON trả về không hợp lệ).
//   - "http" / không kind -> "Không kiểm tra được kết nối" (fallback lỗi chung an toàn:
//     ApiError cũ hoặc Error thường KHÔNG BAO GIỜ bị coi là timeout).
// Thuần ESM: KHÔNG DOM, KHÔNG zmp-sdk, KHÔNG storage (purity contract README.md).

export function errorKind(error) {
  // Fallback an toàn: lỗi không có `kind` (ApiError cũ, Error thường) là
  // "unknown" — rơi vào nhánh lỗi chung, KHÔNG BAO GIỜ nhánh timeout.
  return error && typeof error.kind === "string" ? error.kind : "unknown";
}

export function messageOf(error, fallback) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/** Chọn nội dung ErrorState theo `kind` của lỗi — không suy loại từ status/message. */
export function failureFor(error) {
  switch (errorKind(error)) {
    case "timeout":
      return {
        title: "Kết nối quá thời gian chờ",
        description: "Máy chủ không phản hồi trong thời gian cho phép. Vui lòng thử lại.",
      };
    case "configuration":
      // Màn kiểm tra kỹ thuật: được phép nêu tên biến cấu hình.
      return {
        title: "Chưa cấu hình địa chỉ máy chủ",
        description: messageOf(
          error,
          "Ứng dụng chưa biết địa chỉ máy chủ. Cần cấu hình địa chỉ backend khi build trước khi kiểm tra kết nối.",
        ),
      };
    case "network":
      return {
        title: "Chưa kết nối được máy chủ",
        description: messageOf(error, "Không tiếp cận được máy chủ. Kiểm tra mạng rồi thử lại."),
      };
    case "invalid_response":
      return {
        title: "Không kiểm tra được kết nối",
        description: messageOf(error, "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại sau."),
      };
    default:
      // "http", "unknown" (ApiError cũ không kind, Error thường) — lỗi chung.
      return {
        title: "Không kiểm tra được kết nối",
        description: messageOf(error, "Không thể hoàn tất yêu cầu. Vui lòng thử lại sau."),
      };
  }
}
