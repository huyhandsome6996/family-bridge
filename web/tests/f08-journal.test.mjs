// tests/f08-journal.test.mjs — Kiểm thử toàn diện F08 Web (US-016 & US-031)
// Chạy: node --test tests/f08-journal.test.mjs

// ---------------------------------------------------------------- globals
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

// --------------------------------------------------- app code
const { clearSession, setSession } = await import("../src/core/session.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const diaryPage = (await import("../src/pages/diary/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SAMPLE_PAGE_V1 = {
  page_id: "p-001",
  owner_id: "u-001",
  topic_code: "dieu_muon_hieu",
  title: "Mong có khoảng tự học",
  content: "Con muốn tự sắp xếp bài tập buổi tối mà không cần nhắc nhở liên tục.",
  revision: 1,
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-20T08:00:00Z",
};

const SAMPLE_SHARE = {
  share_id: "s-001",
  page_id: "p-001",
  recipient_id: "u-002",
  owner_id: "u-001",
  approved_revision: 1,
  revoked: false,
  status: "active",
  created_at: "2026-10-20T08:15:00Z",
};

const SAMPLE_REPLY = {
  reply_id: "r-001",
  share_id: "s-001",
  page_id: "p-001",
  author_id: "u-002",
  body: "Mẹ ghi nhận và sẽ để con chủ động từ 19h đến 21h.",
  updated_at: "2026-10-20T09:00:00Z",
};

function makeMockAdapter(overrides = {}) {
  const calls = {
    createPage: [],
    editPage: [],
    deletePage: [],
    sharePage: [],
    revokeShare: [],
    replyShared: [],
    listPages: [],
  };

  const adapter = {
    listJournalPrompts: async () => ({
      results: [
        { topic_code: "dieu_muon_hieu", prompt_text: "Điều mình muốn được hiểu mà chưa dễ nói thành lời" },
        { topic_code: "ranh_gioi", prompt_text: "Khoảnh khắc thấy được tôn trọng không gian riêng" },
      ],
    }),
    listJournalPages: async (params = {}) => {
      calls.listPages.push(params);
      if (params.cursor === "cur-2") {
        return {
          results: [{ ...SAMPLE_PAGE_V1, page_id: "p-002", title: "Trang số hai", revision: 1 }],
          nextCursor: null,
        };
      }
      return {
        results: [SAMPLE_PAGE_V1],
        nextCursor: "cur-2",
      };
    },
    createJournalPage: async (payload) => {
      calls.createPage.push(payload);
      return {
        page_id: "p-new",
        owner_id: "u-001",
        topic_code: payload.topicCode || "",
        title: payload.title || "",
        content: payload.content,
        revision: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    getJournalPage: async (id) => ({
      ...SAMPLE_PAGE_V1,
      page_id: id,
      title: "Bản mới nhất máy chủ",
      content: "Nội dung cập nhật mới từ thiết bị khác",
      revision: 2,
    }),
    editJournalPage: async (id, payload) => {
      calls.editPage.push({ id, ...payload });
      if (payload.expectedRevision !== 1) {
        const err = new Error("Revision conflict");
        err.status = 409;
        err.code = "revision_conflict";
        throw err;
      }
      return {
        ...SAMPLE_PAGE_V1,
        page_id: id,
        title: payload.title ?? SAMPLE_PAGE_V1.title,
        content: payload.content ?? SAMPLE_PAGE_V1.content,
        revision: 2,
      };
    },
    deleteJournalPage: async (id) => {
      calls.deletePage.push(id);
      return { ok: true };
    },
    listJournalPageShares: async (pageId) => ({
      results: [SAMPLE_SHARE],
    }),
    shareJournalPage: async (pageId, payload) => {
      calls.sharePage.push({ pageId, ...payload });
      return SAMPLE_SHARE;
    },
    revokeJournalShare: async (shareId) => {
      calls.revokeShare.push(shareId);
      return { ...SAMPLE_SHARE, revoked: true, status: "revoked" };
    },
    listJournalPageReplies: async (pageId) => ({
      results: [SAMPLE_REPLY],
    }),
    listSharedJournalPages: async () => ({
      results: [
        {
          share_id: "s-001",
          page_id: "p-001",
          owner_id: "u-001",
          title: "Mong có khoảng tự học",
          approved_revision: 1,
          shared_at: "2026-10-20T08:15:00Z",
        },
      ],
    }),
    getSharedJournalPage: async (shareId) => ({
      share_id: shareId,
      page_id: "p-001",
      title: "Mong có khoảng tự học",
      content: "Con muốn tự sắp xếp bài tập buổi tối mà không cần nhắc nhở liên tục.",
      owner_id: "u-001",
      approved_revision: 1,
      shared_at: "2026-10-20T08:15:00Z",
    }),
    replySharedJournalPage: async (shareId, payload) => {
      calls.replyShared.push({ shareId, ...payload });
      return {
        reply_id: "r-new",
        share_id: shareId,
        page_id: "p-001",
        author_id: "u-002",
        body: payload.body,
        updated_at: new Date().toISOString(),
      };
    },
    listMyJournalReplies: async () => ({
      results: [SAMPLE_REPLY],
    }),
    listConnections: async () => ({
      results: [
        {
          connection_id: "c-1",
          other_party_id: "u-002",
          status: "active",
          counterpart: { display_name: "Bố / Mẹ", identity_basis: "self_declared" },
        },
      ],
    }),
    ...overrides,
  };
  return { adapter, calls };
}

function makeCtx({ demo = false, role = "student", adapter, searchParams = "" } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState },
      adapter: adapter || makeMockAdapter().adapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (next) => setRole(next),
      rebuildAdapter: () => {},
      params: new URLSearchParams(searchParams),
      exitDemo: () => {},
    },
    navigateCalls,
  };
}

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function unmount(host) {
  host.remove();
  document.querySelectorAll(".fb-sheet-root, .fb-dialog-root, .fb-sheet, .fb-dialog").forEach((el) => el.remove());
}

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

describe("F08 — Nhật ký riêng và nhật ký song hành (Web UI Tests)", () => {
  it("Hiển thị auth gate khi chưa đăng nhập và không ở demo mode", () => {
    clearSession();
    const { ctx } = makeCtx({ demo: false });
    const { host, el } = mount(diaryPage, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Cần đăng nhập để mở nhật ký"));
    assert.ok(text.includes("bạn chọn chia sẻ trang đó"));
    unmount(host);
  });

  it("Tải chủ đề gợi ý và danh sách trang của chính mình khi có session", async () => {
    setSession({ token: "tok-test", userId: "u-001", displayName: "Lan", expiresAt: Date.now() + 60_000 });
    const { adapter } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(diaryPage, ctx);

    await wait(20);
    const text = textOf(el);
    assert.ok(text.includes("Không gian suy ngẫm cá nhân"));
    assert.ok(text.includes("Mong có khoảng tự học"));
    assert.ok(text.includes("Phiên bản #1"));

    // Kiểm tra options chủ đề
    const select = el.querySelector("select");
    assert.ok(select);
    assert.ok(select.options.length >= 2);
    unmount(host);
  });

  it("Tạo trang nhật ký riêng mới qua createJournalPage", async () => {
    setSession({ token: "tok-test", userId: "u-001", displayName: "Lan", expiresAt: Date.now() + 60_000 });
    const { adapter, calls } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(diaryPage, ctx);
    await wait(20);

    const titleInput = el.querySelector("input[maxlength='120']");
    const contentInput = el.querySelector("textarea");
    const saveBtn = findButton(el, "Lưu trang riêng");

    assert.ok(titleInput && contentInput && saveBtn);
    titleInput.value = "Tiêu đề thử nghiệm";
    titleInput.dispatchEvent(new Event("input"));
    contentInput.value = "Nội dung nhật ký thử nghiệm riêng tư.";
    contentInput.dispatchEvent(new Event("input"));

    saveBtn.click();
    await wait(20);

    assert.equal(calls.createPage.length, 1);
    assert.equal(calls.createPage[0].title, "Tiêu đề thử nghiệm");
    assert.equal(calls.createPage[0].content, "Nội dung nhật ký thử nghiệm riêng tư.");
    unmount(host);
  });

  it("Tìm kiếm trang theo từ khóa và phân trang Tải thêm", async () => {
    setSession({ token: "tok-test", userId: "u-001", displayName: "Lan", expiresAt: Date.now() + 60_000 });
    const { adapter, calls } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(diaryPage, ctx);
    await wait(20);

    const searchInput = el.querySelector("input[type='search']");
    const searchBtn = findButton(el, "Tìm");
    assert.ok(searchInput && searchBtn);

    searchInput.value = "bài tập";
    searchInput.dispatchEvent(new Event("input"));
    searchBtn.click();
    await wait(20);

    const lastCall = calls.listPages[calls.listPages.length - 1];
    assert.equal(lastCall.search, "bài tập");

    // Nút tải thêm
    const loadMoreBtn = findButton(el, "Tải thêm");
    assert.ok(loadMoreBtn);
    loadMoreBtn.click();
    await wait(20);

    const afterLoadCall = calls.listPages[calls.listPages.length - 1];
    assert.equal(afterLoadCall.cursor, "cur-2");
    unmount(host);
  });

  it("Mở sửa trang và xử lý xung đột phiên bản 409 revision_conflict", async () => {
    setSession({ token: "tok-test", userId: "u-001", displayName: "Lan", expiresAt: Date.now() + 60_000 });
    const { adapter, calls } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(diaryPage, ctx);
    await wait(20);

    const editBtn = findButton(el, "Mở & Sửa");
    assert.ok(editBtn);
    editBtn.click();
    await wait(10);

    const textBefore = textOf(el);
    assert.ok(textBefore.includes("Đang sửa trang (phiên bản hiện tại: #1)"));

    const contentInput = el.querySelector("textarea");
    contentInput.value = "Nội dung sửa đổi cục bộ";
    contentInput.dispatchEvent(new Event("input"));

    const saveEditBtn = findButton(el, "Lưu phiên bản mới");
    assert.ok(saveEditBtn);
    saveEditBtn.click();
    await wait(20);

    assert.equal(calls.editPage.length, 1);
    assert.equal(calls.editPage[0].expectedRevision, 1);
    unmount(host);
  });

  it("Mở Sheet Xem trước & Chia sẻ từng trang, gửi expectedRevision và thu hồi", async () => {
    setSession({ token: "tok-test", userId: "u-001", displayName: "Lan", expiresAt: Date.now() + 60_000 });
    const { adapter, calls } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(diaryPage, ctx);
    await wait(20);

    const shareBtn = findButton(el, "Chia sẻ / Quản lý quyền");
    assert.ok(shareBtn);
    shareBtn.click();
    await wait(30);

    const sheet = document.querySelector(".fb-sheet");
    assert.ok(sheet, "Sheet chia sẻ phải mở trong DOM");

    const sheetText = textOf(sheet);
    assert.ok(sheetText.includes("Xem trước nội dung sẽ chia sẻ"));
    assert.ok(sheetText.includes("Phiên bản: #1"));

    const recipientSelect = sheet.querySelector("select");
    if (recipientSelect && !recipientSelect.value) {
      recipientSelect.value = "u-002";
      recipientSelect.dispatchEvent(new Event("change"));
    }

    // Bấm nút xác nhận chia sẻ trang này
    const confirmShareBtn = findButton(sheet, "Xác nhận chia sẻ trang này");
    assert.ok(confirmShareBtn);
    confirmShareBtn.click();
    await wait(30);

    assert.equal(calls.sharePage.length, 1);
    assert.equal(calls.sharePage[0].expectedRevision, 1);
    assert.equal(calls.sharePage[0].recipientId, "u-002");

    // Thu hồi quyền xem
    const revokeBtn = findButton(sheet, "Thu hồi quyền xem");
    assert.ok(revokeBtn);
    revokeBtn.click();
    await wait(20);

    const dialog = document.querySelector(".fb-dialog");
    assert.ok(dialog, "Dialog xác nhận thu hồi phải xuất hiện");
    const confirmRevokeBtn = findButton(dialog, "Thu hồi quyền xem");
    assert.ok(confirmRevokeBtn);
    confirmRevokeBtn.click();
    await wait(20);

    assert.equal(calls.revokeShare.length, 1);
    assert.equal(calls.revokeShare[0], "s-001");
    unmount(host);
  });

  it("Xóa trang nhật ký qua hộp thoại xác nhận", async () => {
    setSession({ token: "tok-test", userId: "u-001", displayName: "Lan", expiresAt: Date.now() + 60_000 });
    const { adapter, calls } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(diaryPage, ctx);
    await wait(20);

    const deleteBtn = findButton(el, "Xóa trang");
    assert.ok(deleteBtn);
    deleteBtn.click();
    await wait(20);

    const dialog = document.querySelector(".fb-dialog");
    assert.ok(dialog, "Dialog xác nhận xóa trang phải mở");
    const confirmDeleteBtn = findButton(dialog, "Xóa trang");
    assert.ok(confirmDeleteBtn);
    confirmDeleteBtn.click();
    await wait(20);

    assert.equal(calls.deletePage.length, 1);
    assert.equal(calls.deletePage[0], "p-001");
    unmount(host);
  });

  it("Tab Được chia sẻ & Song hành: đọc trang được chia sẻ và viết phản hồi song hành", async () => {
    setSession({ token: "tok-test", userId: "u-002", displayName: "Bố Mẹ", expiresAt: Date.now() + 60_000 });
    const { adapter, calls } = makeMockAdapter();
    const { ctx } = makeCtx({ demo: false, adapter, searchParams: "tab=shared" });
    const { host, el } = mount(diaryPage, ctx);
    await wait(20);

    const text = textOf(el);
    assert.ok(text.includes("người đồng hành đang chia sẻ"));
    assert.ok(text.includes("Mong có khoảng tự học"));

    const openReadBtn = findButton(el, "Mở đọc & Phản hồi song hành");
    assert.ok(openReadBtn);
    openReadBtn.click();
    await wait(20);

    const sheet = document.querySelector(".fb-sheet");
    assert.ok(sheet, "Sheet đọc trang được chia sẻ phải xuất hiện trong DOM");

    const readerText = textOf(sheet);
    assert.ok(readerText.includes("Đọc trang nhật ký được chia sẻ"));
    assert.ok(readerText.includes("Con muốn tự sắp xếp bài tập"));

    const replyInput = sheet.querySelector("textarea[maxlength='4000']");
    assert.ok(replyInput);
    replyInput.value = "Bố mẹ rất đồng tình, cùng cố gắng nhé!";
    replyInput.dispatchEvent(new Event("input"));

    const submitReplyBtn = findButton(sheet, "Gửi / Cập nhật phản hồi song hành");
    assert.ok(submitReplyBtn);
    submitReplyBtn.click();
    await wait(20);

    assert.equal(calls.replyShared.length, 1);
    assert.equal(calls.replyShared[0].shareId, "s-001");
    assert.equal(calls.replyShared[0].body, "Bố mẹ rất đồng tình, cùng cố gắng nhé!");
    unmount(host);
  });

  it("page.destroy() dọn dẹp sạch sẽ listener và sheet/dialog", () => {
    const { ctx } = makeCtx({ demo: true });
    const { host } = mount(diaryPage, ctx);
    diaryPage.destroy();
    unmount(host);
    assert.equal(document.querySelectorAll(".fb-sheet, .fb-dialog").length, 0);
  });
});
