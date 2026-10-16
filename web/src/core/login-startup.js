// Kế hoạch khởi động web (ADR-3, ADR-5): web KHÔNG có silent login — không
// zmp-sdk, không getAccessToken. Mọi phiên đều do người dùng chủ động đăng
// nhập bằng mã tài khoản + mật khẩu (pages/login), guard requiresAuth của
// router dẫn về #/login?reason=expired khi chưa có phiên sống.
//
// API giữ giống mini (getLoginStartupPlan) để main.js port nguyên luồng boot;
// web luôn trả { initialRoute: null, silentLogin: false }.
export function getLoginStartupPlan() {
  return { initialRoute: null, silentLogin: false };
}
