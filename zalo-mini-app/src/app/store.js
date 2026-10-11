// State của phiên làm việc — in-memory + sessionStorage.
// Quy tắc riêng tư: KHÔNG lưu nhật ký/tâm trạng/AI vào localStorage công khai
// (SEC-10, đề bài VII). State ở đây chỉ chứa lựa chọn vai trò xem trước và
// cờ demo — không chứa dữ liệu riêng tư, không tạo auth session.

const STORAGE_KEY = "fb.ui.session.v1";

function readPersisted() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      role: state.role,
    }));
  } catch {
    // sessionStorage có thể bị chặn trong webview — app vẫn chạy in-memory.
  }
}

const state = {
  /** 'student' | 'caregiver' | null — lựa chọn vai trò mức XEM TRƯỚC, không phải auth session. */
  role: null,
  /** Bật chỉ khi URL có ?demo=1 — không fallback tự động. */
  demoMode: false,
  /** Scenario mock cho màn kiểm tra kết nối: 'ok' | 'error' | 'timeout' | null. */
  mockScenario: null,
};

export function initStore({ demoMode = false } = {}) {
  const persisted = readPersisted();
  state.role = persisted.role === "student" || persisted.role === "caregiver" ? persisted.role : null;
  state.demoMode = Boolean(demoMode);
  return getState();
}

export function setRole(role) {
  state.role = role === "student" || role === "caregiver" ? role : null;
  persist();
  return getState();
}

export function setMockScenario(scenario) {
  state.mockScenario = ["ok", "error", "timeout", null].includes(scenario) ? scenario : null;
  return getState();
}

export function getState() {
  return { role: state.role, demoMode: state.demoMode, mockScenario: state.mockScenario };
}

/** Dọn state khi đổi vai trò/đăng xuất (FL-01: đổi actor dọn cache trước load). */
export function resetState() {
  state.role = null;
  state.mockScenario = null;
  persist();
}
