// F15 privacy page-core — MỘT NGUỒN LOGIC dùng chung cho:
//   - packages/family_bridge_mobile/f15_privacy/pages/privacy.js (page factory)
//   - zalo-mini-app/src/pages/privacy/index.js (official router render(ctx))
//
// Trách nhiệm: trạng thái, phân loại lỗi, guard double-submit, unknown
// outcome sau mutation (K7), cleanup khi destroy. KHÔNG đụng DOM ở đây —
// hai wrapper DOM render từ getView() và gọi các action.
//
// An toàn (K7 + SEC): token chỉ trong bộ nhớ qua getToken(); mutation KHÔNG
// tự retry; sau mutation mất response -> trạng thái "unknown_outcome" và
// CHÍNH XÁC MỘT lần GET đọc lại để đối chiếu (có trần, không polling).

const STATUS = {
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",          // lỗi máy chủ/phản hồi không hợp lệ
  OFFLINE: "offline",      // mạng/timeout ở lần đọc
  NO_SESSION: "no_session", // chưa có phiên (F01 chưa merge hoặc chưa login)
  UNKNOWN_OUTCOME: "unknown_outcome", // mutation không xác định -> đọc lại
};

const CATEGORY_LABELS = {
  mood: "Ghi nhận tâm trạng",
  journal: "Nhật ký",
  drafts: "Bản thảo AI",
  messages: "Tin đã gửi",
  appointments: "Lịch hẹn",
  surveys: "Khảo sát",
  connections: "Kết nối",
  ai: "Dữ liệu AI",
  program_progress: "Tiến trình chương trình",
  account: "Tài khoản",
};

const ITEM_TYPE_LABELS = {
  mood_entry: "Tâm trạng",
  journal_page: "Trang nhật ký",
};

export function classifyError(err) {
  // Hai hình dạng lỗi: zalo-mini-app ApiError {kind, status} và
  // mobile-core ApiError {code, status}. Phân loại tại nơi ném, không suy
  // từ message.
  const kind = err && typeof err.kind === "string" ? err.kind : null;
  const code = err && typeof err.code === "string" ? err.code : null;
  const status = err && Number(err.status) || 0;
  if (kind === "configuration") return "configuration";
  if (status === 401 || code === "not_authenticated" || kind === "http" && status === 401) {
    return "unauthenticated";
  }
  if (kind === "network" || kind === "timeout"
      || code === "temporarily_unavailable" || code === "rate_limited"
      || (kind === "http" && status >= 500) || status === 0) {
    return "transient";
  }
  return "fatal";
}

export function createPrivacyPageCore({ api, getToken, confirm = null } = {}) {
  if (!api || typeof api.get !== "function" || typeof api.post !== "function") {
    throw new TypeError("api với get/post là bắt buộc");
  }
  if (typeof getToken !== "function") {
    throw new TypeError("getToken là bắt buộc");
  }

  let destroyed = false;
  let loadSeq = 0;            // chặn response cũ ghi đè state mới
  let busyCount = 0;          // double-submit guard toàn trang
  let receipt = null;         // biên nhận xóa — chỉ hiện một lần
  let receiptNote = null;
  let unknownOutcomeNote = null;
  const listeners = new Set();

  let view = {
    status: STATUS.LOADING,
    statusText: "Đang tải quyền riêng tư…",
    items: [],
    connections: [],
    hasMore: false,
    nextCursor: null,
    deletionRequests: [],
    receipt: null,
    receiptNote: null,
    consentNote: null,
    busy: false,
  };

  function setView(patch) {
    view = { ...view, ...patch };
    for (const fn of Array.from(listeners)) {
      try { fn(view); } catch { /* listener lỗi không chặn core */ }
    }
  }

  function itemLabel(itemType) {
    return ITEM_TYPE_LABELS[itemType] || itemType;
  }

  function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || cat;
  }

  async function currentToken() {
    try {
      return await getToken();
    } catch {
      return null;
    }
  }

  async function refreshDeletionRequests() {
    // Owner-only recovery: đọc lại trạng thái yêu cầu sau mất response/khi
    // mở lại app (GET có trần, không phải POST tra cứu).
    try {
      const data = await api.get(
        "/api/v1/privacy/deletion-requests/list?limit=10", {});
      if (destroyed) return;
      setView({
        deletionRequests: Array.isArray(data && data.results)
          ? data.results : [],
      });
    } catch {
      // trạng thái yêu cầu là phụ; lỗi không che trạng thái chính
    }
  }

  async function load({ silent = false } = {}) {
    if (destroyed) return;
    const seq = ++loadSeq;
    if (!silent) setView({ status: STATUS.LOADING, statusText: "Đang tải quyền riêng tư…" });
    const token = await currentToken();
    if (destroyed || seq !== loadSeq) return;
    if (!token) {
      setView({
        status: STATUS.NO_SESSION,
        statusText: "Chưa có phiên đăng nhập. Mở lại Mini App để đăng nhập, "
          + "hoặc quay lại sau khi phiên đăng nhập được tích hợp.",
        items: [], connections: [], busy: false,
      });
      return;
    }
    try {
      const data = await api.get("/api/v1/privacy/overview", {});
      if (destroyed || seq !== loadSeq) return;
      const shared = Array.isArray(data && data.shared_by_me)
        ? data.shared_by_me : [];
      setView({
        status: STATUS.READY,
        statusText: "",
        items: shared.map((item) => ({
          ...item,
          label: itemLabel(item.item_type),
          busy: false,
        })),
        connections: Array.isArray(data && data.connections)
          ? data.connections : [],
        hasMore: Boolean(data && data.has_more),
        nextCursor: (data && data.next_cursor) || null,
        busy: busyCount > 0,
      });
      refreshDeletionRequests();
    } catch (err) {
      if (destroyed || seq !== loadSeq) return;
      const cls = classifyError(err);
      if (cls === "transient") {
        setView({
          status: STATUS.OFFLINE,
          statusText: "Mạng không ổn định hoặc máy chủ chưa phản hồi. "
            + "Kiểm tra kết nối rồi thử lại.",
          busy: false,
        });
      } else if (cls === "unauthenticated") {
        setView({
          status: STATUS.NO_SESSION,
          statusText: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. "
            + "Mở lại Mini App để đăng nhập lại.",
          items: [], connections: [], busy: false,
        });
      } else {
        setView({
          status: STATUS.ERROR,
          statusText: cls === "configuration"
            ? "Ứng dụng chưa cấu hình địa chỉ máy chủ. Vui lòng cập nhật bản mới."
            : "Không tải được trạng thái quyền riêng tư. Thử lại sau.",
          busy: false,
        });
      }
    }
  }

  // -- mutations (double-submit guard + unknown-outcome reconcile) -----------
  function beginBusy() {
    if (busyCount > 0 || destroyed) return false;
    busyCount += 1;
    setView({ busy: true });
    return true;
  }

  function endBusy() {
    busyCount = Math.max(0, busyCount - 1);
    setView({ busy: busyCount > 0 });
  }

  function isTransient(err) {
    return classifyError(err) === "transient";
  }

  async function reconcileAfterUnknown() {
    // Đúng MỘT lần GET đọc lại (có trần) — không polling, không tự mutation.
    try {
      const data = await api.get("/api/v1/privacy/overview", {});
      if (destroyed) return;
      const shared = Array.isArray(data && data.shared_by_me)
        ? data.shared_by_me : [];
      setView({
        status: STATUS.READY,
        statusText: "",
        items: shared.map((item) => ({
          ...item, label: itemLabel(item.item_type), busy: false,
        })),
        connections: Array.isArray(data && data.connections)
          ? data.connections : [],
        hasMore: Boolean(data && data.has_more),
        nextCursor: (data && data.next_cursor) || null,
      });
    } catch {
      if (!destroyed) {
        setView({
          status: STATUS.UNKNOWN_OUTCOME,
          statusText: "Chưa xác định kết quả thao tác. Mở lại trang này để "
            + "đọc trạng thái thật; không gửi thêm thao tác cho đến khi rõ.",
        });
      }
    }
  }

  async function revokeGrant(item) {
    if (!item || !item.item_type || !item.item_id) {
      return { status: "invalid_input" };
    }
    if (!beginBusy()) return { status: "busy" };
    if (typeof confirm === "function"
        && !confirm("Thu hồi chia sẻ mục này? Người nhận sẽ không đọc được nữa. "
          + "Ảnh chụp ngoài ứng dụng không thu hồi được.")) {
      endBusy();
      return { status: "cancelled" };
    }
    try {
      await api.post(
        `/api/v1/privacy/grants/${encodeURIComponent(item.item_type)}/`
        + `${encodeURIComponent(item.item_id)}/revoke`,
        { body: item.recipient_id ? { recipient_id: item.recipient_id } : {} });
      if (!destroyed) {
        unknownOutcomeNote = null;
        setView({ statusText: "Đã thu hồi. Lần đọc mới sẽ bị chặn." });
      }
      endBusy();
      await load({ silent: true });
      return { status: "ok" };
    } catch (err) {
      endBusy();
      if (destroyed) return { status: "destroyed" };
      if (isTransient(err)) {
        await reconcileAfterUnknown();
        return { status: "unknown" };
      }
      setView({
        statusText: "Không thu hồi được (yêu cầu bị từ chối). "
          + "Đọc lại trang để thấy trạng thái thật.",
      });
      await load({ silent: true });
      return { status: "rejected" };
    }
  }

  async function requestDeletion(categories) {
    if (!Array.isArray(categories) || !categories.length) {
      return { status: "invalid_input" };
    }
    if (!beginBusy()) return { status: "busy" };
    if (typeof confirm === "function"
        && !confirm("Gửi yêu cầu xóa dữ liệu? Sau khi xử lý bắt đầu, "
          + "không thể hủy. Trạng thái sẽ phản ánh thật.")) {
      endBusy();
      return { status: "cancelled" };
    }
    try {
      const result = await api.post("/api/v1/privacy/deletion-requests",
                                    { body: { categories } });
      if (destroyed) return { status: "destroyed" };
      if (result && result.duplicate) {
        receipt = null;
        receiptNote = "Bạn đã có yêu cầu đang mở — xem trạng thái bên dưới.";
      } else {
        receipt = (result && result.receipt) || null;
        receiptNote = receipt
          ? "Đã ghi nhận yêu cầu. Mã biên nhận chỉ hiện MỘT lần, hãy lưu lại:"
          : null;
      }
      unknownOutcomeNote = null;
      setView({ receipt, receiptNote });
      endBusy();
      refreshDeletionRequests();
      return { status: "ok", receipt };
    } catch (err) {
      endBusy();
      if (destroyed) return { status: "destroyed" };
      if (isTransient(err)) {
        await reconcileAfterUnknown();
        return { status: "unknown" };
      }
      setView({
        statusText: "Không gửi được yêu cầu xóa (yêu cầu bị từ chối). "
          + "Thử lại sau khi kiểm tra phạm vi đã chọn.",
      });
      return { status: "rejected" };
    }
  }

  async function cancelDeletionRequest(requestId, expectedRevision) {
    if (!requestId) return { status: "invalid_input" };
    if (!beginBusy()) return { status: "busy" };
    if (typeof confirm === "function"
        && !confirm("Hủy yêu cầu xóa này? Chỉ hủy được trước khi xử lý.")) {
      endBusy();
      return { status: "cancelled" };
    }
    try {
      await api.post(
        `/api/v1/privacy/deletion-requests/${encodeURIComponent(requestId)}/cancel`,
        { body: expectedRevision == null ? {} : { expected_revision: expectedRevision } });
      endBusy();
      if (!destroyed) {
        receiptNote = "Đã hủy yêu cầu xóa.";
        setView({ receiptNote });
      }
      refreshDeletionRequests();
      return { status: "ok" };
    } catch (err) {
      endBusy();
      if (destroyed) return { status: "destroyed" };
      if (isTransient(err)) {
        setView({
          statusText: "Chưa xác định kết quả hủy. Mở lại trang để đọc trạng "
          + "thái thật; không hủy thêm lần nữa cho đến khi rõ.",
        });
        return { status: "unknown" };
      }
      setView({
        statusText: "Không hủy được (yêu cầu có thể đang xử lý). "
          + "Đọc lại trạng thái thật trên trang.",
      });
      return { status: "rejected" };
    }
  }

  async function withdrawConsent(purpose, description) {
    if (!purpose) return { status: "invalid_input" };
    if (!beginBusy()) return { status: "busy" };
    if (typeof confirm === "function"
        && !confirm(`Rút đồng ý "${description || purpose}"? Hành động này `
          + "áp dụng cho các lần xử lý mới.")) {
      endBusy();
      return { status: "cancelled" };
    }
    try {
      const result = await api.post(
        `/api/v1/privacy/consents/${encodeURIComponent(purpose)}/withdraw`,
        { body: {} });
      endBusy();
      if (destroyed) return { status: "destroyed" };
      const withdrawn = Boolean(result && result.withdrawn);
      setView({
        consentNote: withdrawn
          ? `Đã rút đồng ý "${description || purpose}". Các xử lý mới sẽ bị chặn.`
          : `Hiện chưa có đồng ý nào đang hiệu lực cho "${description || purpose}".`,
      });
      return { status: "ok", withdrawn };
    } catch (err) {
      endBusy();
      if (destroyed) return { status: "destroyed" };
      if (isTransient(err)) {
        setView({
          consentNote: "Chưa xác định kết quả rút đồng ý. Mở lại trang để "
            + "đọc trạng thái thật.",
        });
        return { status: "unknown" };
      }
      setView({
        consentNote: "Không rút được đồng ý lúc này. Thử lại sau.",
      });
      return { status: "rejected" };
    }
  }

  function showLocalNote(text) {
    if (!destroyed) setView({ statusText: text });
  }

  function destroy() {
    destroyed = true;
    loadSeq += 1; // mọi response đang bay sẽ bị bỏ qua
    listeners.clear();
  }

  return {
    STATUS,
    categoryLabel,
    getView: () => view,
    subscribe(fn) {
      if (destroyed || typeof fn !== "function") return () => {};
      listeners.add(fn);
      fn(view);
      return () => listeners.delete(fn);
    },
    load,
    refreshDeletionRequests,
    showLocalNote,
    revokeGrant,
    requestDeletion,
    cancelDeletionRequest,
    withdrawConsent,
    destroy,
    get destroyed() { return destroyed; },
  };
}
