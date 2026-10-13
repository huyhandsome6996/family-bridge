// Entry chính của Family Bridge Mini App (US-003 foundation + F01 login).
// Lead sở hữu file này — thay đổi lớn cần phối hợp.

import "./styles/index.css"; // tokens -> base -> components

import { initStore, getState, setRole, resetState, setMockScenario } from "./app/store.js";
import { createRouter, navigate } from "./app/router.js";
import { isDemoModeRequested, isZaloHost, isManualLoginTest } from "./core/config.js";
import { getLoginStartupPlan } from "./core/login-startup.js";
import { hasLiveSession } from "./core/session.js";
import { resolveAdapterMode, createAdapter } from "./core/adapter/adapter.js";

async function boot() {
  const demoMode = isDemoModeRequested();
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
    manualLoginTest: isManualLoginTest(), demoMode, inZalo: isZaloHost(),
    hasSession: hasLiveSession(),
    path: window.location.hash.replace(/^#/, "").split("?")[0] || "/",
  });
  if (startup.initialRoute) navigate(startup.initialRoute);
  router.start();

  // F01: mở lại Mini App trong Zalo thật -> thử đăng nhập lại IM LẶNG đúng
  // MỘT lần (getAccessToken + POST /auth/session). Không lặp, không polling:
  // thất bại thì người dùng vẫn đăng nhập thủ công từ trang /login.
  // A11: khi đăng nhập im lặng THÀNH CÔNG, view đang mở phải cập nhật theo
  // auth transition — render lại route hiện tại (home đang "Chưa đăng nhập"
  // phải chuyển thành trạng thái đã đăng nhập) một lần duy nhất.
  if (startup.silentLogin && adapter.trySilentLogin) {
    adapter.trySilentLogin().then((ok) => {
      if (!ok) return false;
      const path = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
      // Trang đăng nhập tự điều hướng theo luồng của nó — không đè lên.
      if (path === "/login" || path === "/consent") return true;
      router.render();
      return true;
    }).catch(() => false);
  }
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
