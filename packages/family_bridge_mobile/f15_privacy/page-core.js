// F15 privacy page-core — MỘT NGUỒN LOGIC dùng chung cho:
//   - packages/family_bridge_mobile/f15_privacy/pages/privacy.js (page factory)
//   - zalo-mini-app/src/pages/privacy/index.js (official router render(ctx))
//
// Trách nhiệm: trạng thái, phân loại lỗi, guard double-submit, unknown
// outcome sau mutation (K7), cleanup khi destroy. KHÔNG đụng DOM ở đây —
// hai wrapper DOM render từ getView() và gọi các action.
//
// An toàn (K7 + SEC + R03):
//   - token chỉ trong bộ nhớ qua getToken(); không storage, không URL;
//   - mutation KHÔNG tự retry;
//   - MỐC PHIÊN (session guard): mọi request ghi token-at-start lại và
//     KIỂM LẠI token trước khi commit state — response của actor cũ không
//     bao giờ ghi đè state của actor mới, logout giữa chừng thì response
//     muộn bị bỏ và state riêng tư bị dọn (items/connections/receipt/
//     deletionRequests/consent note/pagination);
//   - sau mutation mất response -> "unknown_outcome" và ĐÚNG MỘT lần GET
//     đọc lại theo LOẠI tài nguyên (overview + deletion list) — có trần,
//     không polling.

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

// R12: trạng thái máy chủ (tiếng Anh kỹ thuật) được map sang tiếng Việt —
// không render raw enum cho người dùng.
const DELETION_STATUS_LABELS = {
  requested: "chờ xác minh",
  verified: "đã xác minh",
  processing: "đang xử lý",
  completed: "hoàn tất",
  failed_needs_action: "cần can thiệp thủ công",
  rejected: "bị từ chối",
  cancelled: "đã hủy",
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
    deletionHasMore: false,
    deletionNextCursor: null,
    deletionRequestsError: false,
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

  // R03: private state bị xóa khỏi bộ nhớ khi mất phiên/destroy — status
  // giữ nguyên cho renderer, dữ liệu riêng tư thì không lưu lại.
  const PRIVATE_VIEW_DEFAULTS = {
    items: [], connections: [], deletionRequests: [],
    receipt: null, receiptNote: null, consentNote: null,
    hasMore: false, nextCursor: null,
    deletionHasMore: false, deletionNextCursor: null,
  };

  function clearPrivateState() {
    receipt = null;
    receiptNote = null;
    unknownOutcomeNote = null;
    view = { ...view, ...PRIVATE_VIEW_DEFAULTS };
  }

  function itemLabel(itemType) {
    return ITEM_TYPE_LABELS[itemType] || itemType;
  }

  function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || cat;
  }

  function deletionStatusLabel(status) {
    return DELETION_STATUS_LABELS[status] || status;
  }

  async function currentToken() {
    try {
      return await getToken();
    } catch {
      return null;
    }
  }

  // R03: vào trạng thái no_session một cách TƯỚC MINH — dọn toàn bộ dữ
  // liệu riêng tư của actor cũ, không giữ lại gì để "hồi sau hiện lại".
  function enterNoSession(message) {
    clearPrivateState();
    setView({
      status: STATUS.NO_SESSION,
      statusText: message
        || "Chưa có phiên đăng nhập. Mở lại Mini App để đăng nhập, "
          + "hoặc quay lại sau khi phiên đăng nhập được tích hợp.",
      busy: false,
    });
  }

  // R03: mỗi lần đọc/mutation ghi lại token lúc bắt đầu; trước khi commit
  // state kiểm tra lại — token đổi (logout / đổi actor) thì response cũ bị
  // bỏ, không chạm vào view của actor hiện tại.
  async function tokenChangedSince(tokenAtStart) {
    if (destroyed) return true;
    const tokenNow = await currentToken();
    return tokenNow !== tokenAtStart;
  }

  async function refreshDeletionRequests({ cursor = null, append = false } = {}) {
    // Owner-only recovery: đọc lại trạng thái yêu cầu sau mất response/khi
    // mở lại app (GET có trần, không phải POST tra cứu).
    const tokenAtStart = await currentToken();
    if (!tokenAtStart) return; // không gọi API riêng tư khi mất phiên
    try {
      const path = "/api/v1/privacy/deletion-requests/list?limit=10"
        + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const data = await api.get(path, {});
      if (destroyed) return;
      if (await tokenChangedSince(tokenAtStart)) return; // R03: actor đổi
      const results = Array.isArray(data && data.results) ? data.results : [];
      setView({
        deletionRequests: append
          ? [...view.deletionRequests, ...results]
          : results,
        deletionHasMore: Boolean(data && data.has_more),
        deletionNextCursor: (data && data.next_cursor) || null,
        deletionRequestsError: false,
      });
    } catch {
      // R12: lỗi đọc list KHÔNG bị nuốt thành "empty im lặng" — ghi cờ để
      // UI báo thật; dữ liệu cũ không bị xóa oan.
      if (!destroyed && !append) {
        setView({ deletionRequestsError: true });
      }
    }
  }

  async function load({ silent = false } = {}) {
    if (destroyed) return;
    const seq = ++loadSeq;
    if (!silent) setView({ status: STATUS.LOADING, statusText: "Đang tải quyền riêng tư…" });
    const tokenAtStart = await currentToken();
    if (destroyed || seq !== loadSeq) return;
    if (!tokenAtStart) {
      enterNoSession();
      return;
    }
    try {
      const data = await api.get("/api/v1/privacy/overview", {});
      if (destroyed || seq !== loadSeq) return;
      if (await tokenChangedSince(tokenAtStart)) {
        // R03: response của actor cũ về sau logout/đổi actor — bỏ, dọn
        // state riêng tư và đọc lại theo phiên hiện tại (một lần, có trần).
        enterNoSession();
        void load({ silent: true });
        return;
      }
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
      void refreshDeletionRequests();
    } catch (err) {
      if (destroyed || seq !== loadSeq) return;
      if (await tokenChangedSince(tokenAtStart)) {
        // 401/lỗi của phiên cũ không được xóa state của phiên mới (R03).
        enterNoSession();
        void load({ silent: true });
        return;
      }
      const cls = classifyError(err);
      if (cls === "transient") {
        setView({
          status: STATUS.OFFLINE,
          statusText: "Mạng không ổn định hoặc máy chủ chưa phản hồi. "
            + "Kiểm tra kết nối rồi thử lại.",
          busy: false,
        });
      } else if (cls === "unauthenticated") {
        enterNoSession("Phiên đăng nhập đã hết hạn hoặc không hợp lệ. "
          + "Mở lại Mini App để đăng nhập lại.");
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

  // -- load-more (R09/R12: phân trang thật trên UI) ---------------------------
  async function loadMoreShares() {
    if (!view.nextCursor) return { status: "end" };
    if (busyCount > 0) return { status: "busy" };
    const tokenAtStart = await currentToken();
    if (!tokenAtStart) return { status: "no_session" };
    try {
      const path = "/api/v1/privacy/overview?cursor="
        + encodeURIComponent(view.nextCursor);
      const data = await api.get(path, {});
      if (destroyed) return { status: "destroyed" };
      if (await tokenChangedSince(tokenAtStart)) return { status: "stale" };
      const shared = Array.isArray(data && data.shared_by_me)
        ? data.shared_by_me : [];
      const known = new Set(view.items.map((it) =>
        `${it.item_type}|${it.item_id}|${it.share_id || ""}`));
      const fresh = shared
        .filter((it) => !known.has(`${it.item_type}|${it.item_id}|${it.share_id || ""}`))
        .map((item) => ({ ...item, label: itemLabel(item.item_type), busy: false }));
      setView({
        items: [...view.items, ...fresh],
        hasMore: Boolean(data && data.has_more),
        nextCursor: (data && data.next_cursor) || null,
      });
      return { status: "ok" };
    } catch (err) {
      if (destroyed) return { status: "destroyed" };
      const cls = classifyError(err);
      setView({
        statusText: cls === "transient"
          ? "Chưa tải thêm được (mạng). Thử lại."
          : "Chưa tải thêm được. Đọc lại trang.",
      });
      return { status: cls === "transient" ? "transient" : "rejected" };
    }
  }

  async function loadMoreDeletionRequests() {
    if (!view.deletionNextCursor) return { status: "end" };
    await refreshDeletionRequests({ cursor: view.deletionNextCursor,
                                    append: true });
    return { status: "ok" };
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
    // R12: đối chiếu THEO LOẠI — đọc cả overview (quyền/kết nối) VÀ danh
    // sách yêu cầu xóa (kết quả POST xóa đã được máy chủ nhận hay chưa).
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
    await refreshDeletionRequests();
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
        if (result.covers_requested_categories === false) {
          // R12: mismatch phạm vi phải được giải thích thật — không báo
          // thành công giả cho ý định chưa nằm trong yêu cầu đang mở.
          const pendingScope = (Array.isArray(result.scope_categories)
            ? result.scope_categories : []).map(categoryLabel).join(", ");
          receiptNote = "Bạn đã có yêu cầu đang mở (phạm vi: "
            + (pendingScope || "—")
            + "). Ý định lần này CHƯA nằm trong yêu cầu đó; yêu cầu chỉ "
            + "được nhận mới khi yêu cầu hiện tại hoàn tất hoặc bị hủy.";
        } else {
          receiptNote = "Bạn đã có yêu cầu đang mở — xem trạng thái bên dưới.";
        }
      } else {
        receipt = (result && result.receipt) || null;
        receiptNote = receipt
          ? "Đã ghi nhận yêu cầu. Mã biên nhận chỉ hiện MỘT lần, hãy lưu lại:"
          : null;
      }
      unknownOutcomeNote = null;
      setView({ receipt, receiptNote });
      endBusy();
      await refreshDeletionRequests();
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
      await refreshDeletionRequests();
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

  async function unlinkConnection(connectionId) {
    // R12: hành động hủy kết nối trên trang quyền riêng tư dùng API thật
    // của F01 + confirm; mất response -> đối chiếu lại trạng thái kết nối.
    if (!connectionId) return { status: "invalid_input" };
    if (!beginBusy()) return { status: "busy" };
    if (typeof confirm === "function"
        && !confirm("Hủy kết nối này? Mọi chia sẻ giữa hai bên sẽ chấm dứt "
          + "và kết nối mới phải qua lời mời hai bên.")) {
      endBusy();
      return { status: "cancelled" };
    }
    try {
      await api.post(
        `/api/v1/connections/${encodeURIComponent(connectionId)}/revoke`,
        { body: {} });
      endBusy();
      if (!destroyed) {
        setView({ statusText: "Đã hủy kết nối. Quyền chia sẻ liên quan "
          + "chấm dứt từ lúc này." });
      }
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
        statusText: "Không hủy được kết nối lúc này (yêu cầu bị từ chối). "
          + "Đọc lại trang để thấy trạng thái thật.",
      });
      await load({ silent: true });
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
    // R03: dọn dữ liệu riêng tư khỏi bộ nhớ khi rời trang (không phát
    // event — renderer đã unmount; hợp đồng cũ "state đóng băng lúc
    // destroy" vẫn đúng với status).
    clearPrivateState();
  }

  return {
    STATUS,
    categoryLabel,
    deletionStatusLabel,
    getView: () => view,
    subscribe(fn) {
      if (destroyed || typeof fn !== "function") return () => {};
      listeners.add(fn);
      fn(view);
      return () => listeners.delete(fn);
    },
    load,
    refreshDeletionRequests,
    loadMoreShares,
    loadMoreDeletionRequests,
    showLocalNote,
    revokeGrant,
    requestDeletion,
    cancelDeletionRequest,
    unlinkConnection,
    withdrawConsent,
    destroy,
    get destroyed() { return destroyed; },
  };
}
