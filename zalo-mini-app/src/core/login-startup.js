// Device-test builds may require an explicit login click. This changes only
// startup behavior; the same SDK and server verification remain mandatory.
export function getLoginStartupPlan({ manualLoginTest = false, demoMode = false, inZalo = false, hasSession = false, path = "/" } = {}) {
  if (manualLoginTest) {
    return { initialRoute: path === "/help" ? null : "/login", silentLogin: false };
  }
  return { initialRoute: null, silentLogin: !demoMode && inZalo && !hasSession };
}
