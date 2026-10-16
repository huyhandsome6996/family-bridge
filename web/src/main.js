// Entry chính của Family Bridge Web ĐỘC LẬP (ADR-3, task 19-a).
// Port luồng boot từ zalo-mini-app/src/main.js, KHÁC BIỆT CÓ CHỦ ĐÍCH:
// - KHÔNG silent login (web không có zmp-sdk/getAccessToken — ADR-5): luôn
//   hiện màn đăng nhập khi chưa có phiên sống (guard requiresAuth router).
// - Thiếu VITE_API_BASE_URL -> màn lỗi cấu hình RÕ RÀNG tiếng Việt NGAY khi
//   boot (không fallback mock, không fake-success).
// - Demo (?demo=1) chọn adapter mock từ shared RÕ RÀNG — isolation như
//   qa-demo-isolation của mini (demo không tạo token/phiên thật).

import "./styles/index.css"; // fonts -> tokens -> base -> components -> shell

import { initStore, getState, setRole, resetState, setMockScenario } from "./app/store.js";
import { createRouter, navigate } from "./app/router.js";
import { isDemoModeRequested, getApiBaseUrl } from "./core/config.js";
import { getLoginStartupPlan } from "./core/login-startup.js";
import { hasLiveSession } from "./core/session.js";
import { resolveAdapterMode, createAdapter } from "./adapter/web-adapter.js";

/** Màn lỗi cấu hình: thiếu VITE_API_BASE_URL khi build. Trung thực, rõ ràng,
 * không có nút "bỏ qua" hay fallback dữ liệu minh họa. */
function renderConfigErrorScreen(root) {
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "fb-boot-error";
  box.setAttribute("role", "alert");
  box.textContent =
    "Ứng dụng chưa cấu hình địa chỉ máy chủ. Thêm VITE_API_BASE_URL khi build " +
    "(HTTPS, không có dấu / cuối) rồi build lại. Không có dữ liệu dự phòng.";
  root.appendChild(box);
}

async function boot() {
  const demoMode = isDemoModeRequested();
  const apiBaseUrl = getApiBaseUrl();

  // Thiếu cấu hình -> dừng boot với màn lỗi cấu hình rõ ràng (KHÔNG fallback
  // mock — bất biến không fake-success). Demo mode cũng cần biết mình đang
  // thiếu cấu hình thật: hiển thị lỗi như production.
  if (!apiBaseUrl) {
    renderConfigErrorScreen(document.getElementById("app"));
    console.error("boot-failed:", "ApiError"); // không in dữ liệu nhạy cảm
    return;
  }

  initStore({ demoMode });

  // Adapter chế độ duy nhất, chọn RÕ theo demo mode — không fallback tự động.
  const adapterMode = resolveAdapterMode(demoMode);
  let currentScenario = null;
  const adapter = createAdapter({ mode: adapterMode, scenario: currentScenario });

  const ctx = {
    // store là API object (không phải snapshot) theo CONTRACTS.md mục 5.
    store: { getState, setRole },
    adapter,
    navigate,
    setRole: (role) => {
      if (role === null) resetState();
      else setRole(role);
      return getState();
    },
    // Demo mode: đổi kịch bản giả lập cho adapter mock (ok/error/timeout).
    rebuildAdapter: (scenario) => {
      currentScenario = scenario;
      setMockScenario(scenario);
      Object.assign(adapter, createAdapter({ mode: adapterMode, scenario }));
      return adapter;
    },
  };

  const root = document.getElementById("app");
  const router = createRouter({ root, ctx });
  const startup = getLoginStartupPlan({
    demoMode,
    hasSession: hasLiveSession(),
    path: window.location.hash.replace(/^#/, "").split("?")[0] || "/",
  });
  if (startup.initialRoute) navigate(startup.initialRoute);
  router.start();

  // Web KHÔNG silent login (ADR-5): khởi động luôn dừng ở đây. Người dùng
  // chưa có phiên sẽ được guard requiresAuth dẫn tới #/login.
}

boot().catch((error) => {
  // Lỗi khởi động: hiển thị rõ ràng, không im lặng, không fake-success.
  const root = document.getElementById("app");
  if (root) {
    root.innerHTML = "";
    const box = document.createElement("div");
    box.className = "fb-boot-error";
    box.setAttribute("role", "alert");
    box.textContent = "Không khởi động được ứng dụng. Vui lòng thử lại sau.";
    root.appendChild(box);
  }
  // Console log chỉ chứa tên lỗi, không in dữ liệu nhạy cảm.
  console.error("boot-failed:", error && error.name);
});
