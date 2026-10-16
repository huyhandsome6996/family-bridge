// Device-test builds may require an explicit login click. This changes only
// startup behavior; the same SDK and server verification remain mandatory.
//
// Bản phát hành HS/PH (2026-10-16): silent SDK login của Zalo cũ được giữ DORMANT
// (silentLogin: false) để phục hồi sau theo yêu cầu mới của Huy. Khi mở app
// chưa có phiên, người dùng đăng nhập bằng mã tài khoản HS/PH qua form thật.
export function getLoginStartupPlan({ manualLoginTest = false, demoMode = false, inZalo = false, hasSession = false, path = "/" } = {}) {
  if (manualLoginTest) {
    return { initialRoute: path === "/help" ? null : "/login", silentLogin: false };
  }
  // silentLogin = false: giữ dormant cơ chế silent SDK cũ, không chạy ngầm trong bản HS/PH.
  return { initialRoute: null, silentLogin: false };
}

/** Implementation dormant phục hồi khi có yêu cầu release Zalo SDK mới từ Huy */
export function getLegacyZaloSilentLoginCondition({ demoMode = false, inZalo = false, hasSession = false } = {}) {
  return !demoMode && inZalo && !hasSession;
}
