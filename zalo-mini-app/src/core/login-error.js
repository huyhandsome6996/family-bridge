// Only known categories and numeric provider codes may reach the UI.
// Never display provider free text: it could contain credentials or user data.
export function loginErrorMessage(error) {
  const fallback = "Đăng nhập chưa thành công. Vui lòng thử lại.";
  if (!error) return fallback;
  if (error.kind === "timeout") return "Máy chủ phản hồi quá chậm. Đợi máy chủ khởi động rồi đăng nhập lại.";
  if (error.kind === "network") return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (error.kind === "configuration") return error.message || fallback;
  const reason = typeof error.details?.reason === "string" ? error.details.reason : "";
  const legacyCode = /^provider_rejected \[code (-?\d{1,8}):/.exec(reason)?.[1];
  const structuredCode = String(error.details?.provider_code ?? "");
  const providerCode = /^-?\d{1,8}$/.test(structuredCode) ? structuredCode : legacyCode;
  let message;
  if (reason === "wrong_app_id") {
    message = "Zalo từ chối vì phiên đăng nhập không khớp ứng dụng. Cần kiểm tra liên kết Mini App với ứng dụng Zalo và cấu hình máy chủ.";
  } else if (reason === "token_invalid_or_expired") {
    message = "Zalo báo token đăng nhập không hợp lệ hoặc đã hết hạn. Đóng Mini App rồi mở lại để lấy phiên mới.";
  } else if (reason.startsWith("provider_rejected")) {
    message = "Zalo từ chối xác thực. Cần đối chiếu mã lỗi và cấu hình ứng dụng trên máy chủ.";
  } else if (reason === "provider_not_configured") {
    message = "Máy chủ chưa cấu hình xác thực Zalo. Cần người quản trị kiểm tra cấu hình.";
  } else if (reason === "provider_unreachable") {
    message = "Máy chủ chưa kết nối được dịch vụ xác thực Zalo. Vui lòng thử lại sau.";
  } else if (error.status === 400) {
    message = "Yêu cầu đăng nhập không hợp lệ. Cần kiểm tra dữ liệu gửi lên máy chủ.";
  } else if (error.status === 401) {
    message = "Máy chủ từ chối phiên đăng nhập. Cần kiểm tra nguyên nhân xác thực.";
  } else if (error.status === 503) {
    message = "Máy chủ đang bận hoặc chưa sẵn sàng. Vui lòng thử lại sau.";
  } else {
    return fallback;
  }
  const safeReason = new Set(["wrong_app_id", "token_invalid_or_expired", "provider_not_configured", "provider_unreachable", "provider_response_malformed"]);
  const category = safeReason.has(reason) ? reason : reason.startsWith("provider_rejected") ? "provider_rejected" : "login_rejected";
  const http = [400, 401, 503].includes(error.status) ? `HTTP ${error.status}; ` : "";
  return `${message} (Mã kiểm tra: ${http}${category}${providerCode ? `; Zalo ${providerCode}` : ""}.)`;
}
