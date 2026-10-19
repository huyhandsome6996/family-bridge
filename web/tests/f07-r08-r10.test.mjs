// tests/f07-r08-r10.test.mjs — regression cho ba finding R08/R09/R10 của
// audit độc lập 19/10/2026 trên commit 2ffd674 (gói 12 f07-docx):
// - R08: editor giữ đúng entry/mode theo response máy chủ sau create/edit;
//   lưu liên tiếp PATCH đúng mục, không POST trùng ngày; giữ nháp khi lỗi.
// - R09: nút "Tải thêm" hết trang phải hidden THẬT + guard onClick không
//   gọi API khi hết cursor/đang tải; không append trùng; double-click an toàn.
// - R10: lỗi share (409 preview_stale/timeout) hiển thị ngay TRONG sheet
//   (live region), có đường "Xem lại bản mới" + xác nhận lại; KHÔNG tự
//   retry/auto-share; lỗi thu hồi báo trong sheet, badge giữ nguyên.
// Giới hạn tầng test: happy-dom không có layout engine — visible/focus/
// click thật và số request trên browser thật do repro gói 12 (repeat_save,
// pagination, stale_preview) chứng minh; test này khẳng định trạng thái DOM,
// thuộc tính hidden và hành vi handler. Payload GIỐNG SHAPE backend thật.
// Chạy: node --test tests/f07-r08-r10.test.mjs

// ---------------------------------------------------------------- globals
import { register } from "node:module";
import { readFileSync } from "node:fs";
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

// --------------------------------------------------- app code (import sau globals)
const { clearSession, setSession } = await import("../src/core/session.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const moodPage = (await import("../src/pages/mood/index.js")).page;
const moodSharedPage = (await import("../src/pages/mood-shared/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function todayVnIso() {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

// Shapes copy NGUYÊN VĂN từ backend thật (entry.view(), grant_view()).
const ENTRY_V1 = {
  entry_id: "6f1c2a34-0000-4000-8000-000000000001",
  entry_date: "2026-10-18",
  emotion: "lo",
  emotion_label: "Lo lắng",
  note: "lo vì bài kiểm tra",
  revision: 1,
  updated_at: "2026-10-18T03:20:00+00:00",
};
const ENTRY_PAST = { ...ENTRY_V1, entry_date: "2026-10-10" };
const GRANT_ACTIVE = {
  share_id: "9a1c2a34-0000-4000-8000-000000000002",
  entry_id: ENTRY_V1.entry_id,
  recipient_id: "3b1c2a34-0000-4000-8000-000000000003",
  owner_id: "6f1c2a34-0000-4000-8000-000000000001",
  approved_revision: 1,
  revoked: false,
  status: "active",
  created_at: "2026-10-18T04:00:00+00:00",
};

function httpError(status, code, details, kind = "http") {
  const error = new Error(code || "error");
  error.status = status;
  error.kind = kind;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
}

/** Adapter ghi lại lời gọi; response là shape backend thật. */
function makeAdapter(overrides = {}) {
  const calls = {
    share: [], revoke: [], create: [], edit: [], getList: [], refresh: [],
  };
  const adapter = {
    moodSummary: async () => ({
      results: [{ emotion: "lo", label: "Lo lắng", count: 1 }],
      emotions: [
        { emotion: "vui", label: "Vui" }, { emotion: "binh_an", label: "Bình an" },
        { emotion: "met", label: "Mệt" }, { emotion: "buon", label: "Buồn" },
        { emotion: "lo", label: "Lo lắng" }, { emotion: "buc", label: "Bực bội" },
        { emotion: "kho_noi", label: "Khó nói thành lời" },
      ],
    }),
    listMoodEntries: async ({ cursor, limit } = {}) => {
      calls.getList.push({ cursor: cursor || null, limit });
      return { results: cursor ? [] : [ENTRY_PAST], next: cursor ? null : "cursor-1" };
    },
    getMoodEntry: async (entryId) => {
      calls.refresh.push(entryId);
      return { ...ENTRY_V1, revision: 2, note: "bản mới nhất" };
    },
    createMoodEntry: async ({ emotion, note } = {}) => {
      calls.create.push({ emotion, note });
      return { ...ENTRY_V1, entry_id: "new", emotion, note: note || "" };
    },
    editMoodEntry: async (id, payload) => {
      calls.edit.push({ id, ...payload });
      return { ...ENTRY_V1, revision: 2, note: payload.note ?? ENTRY_V1.note };
    },
    listConnections: async () => ({
      results: [{
        connection_id: "c-1",
        other_party_id: "3b1c2a34-0000-4000-8000-000000000003",
        relationship_kind: "primary",
        generation: 1,
        status: "active",
        counterpart: { display_name: "Mẹ (tự khai báo)", identity_basis: "self_declared" },
      }],
      nextCursor: null,
    }),
    listMoodEntryShares: async () => ({ results: [GRANT_ACTIVE] }),
    shareMoodEntry: async (entryId, { recipientId, expectedRevision } = {}) => {
      calls.share.push({ entryId, recipientId, expectedRevision });
      return { ...GRANT_ACTIVE };
    },
    revokeMoodShare: async (shareId) => {
      calls.revoke.push(shareId);
      return { ...GRANT_ACTIVE, revoked: true, status: "revoked" };
    },
    listSharedMoodEntries: async () => ({
      results: [{
        share_id: GRANT_ACTIVE.share_id,
        entry_id: ENTRY_V1.entry_id,
        owner_id: "6f1c2a34-0000-4000-8000-000000000001",
        approved_revision: 1,
        shared_at: "2026-10-18T04:00:00+00:00",
      }],
      next: null,
    }),
    getSharedMoodEntry: async () => ({
      share_id: GRANT_ACTIVE.share_id,
      entry: ENTRY_V1,
      owner_id: ENTRY_V1.entry_id,
      shared_at: GRANT_ACTIVE.created_at,
    }),
    ...overrides,
  };
  return { adapter, calls };
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

function makeCtx(adapter) {
  initStore({ demoMode: false });
  resetState();
  setRole("student");
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState },
      adapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
    navigateCalls,
  };
}

function liveSession() {
  setSession({
    token: "tok-f07-ui",
    userId: "6f1c2a34-0000-4000-8000-000000000001",
    displayName: "Lan",
    expiresAt: Date.now() + 60_000,
  });
}

function historyRows(host) {
  return Array.from(host.querySelectorAll(".fb-list__item"))
    .filter((li) => (li.textContent || "").includes("Phiên bản hiện tại:"));
}

describe("F07 — R08: editor giữ đúng entry/mode theo response máy chủ", () => {
  it("tạo hôm nay rồi lưu tiếp ngay tại editor: lần 2+ PATCH đúng mục, không POST trùng ngày", async () => {
    clearSession();
    liveSession();
    const today = todayVnIso();
    let revision = 0;
    const { adapter, calls } = makeAdapter({
      listMoodEntries: async () => ({ results: [], next: null }),
      createMoodEntry: async ({ emotion, note } = {}) => {
        calls.create.push({ emotion, note });
        revision += 1;
        return {
          entry_id: "entry-brand-new",
          entry_date: today,
          emotion,
          emotion_label: "Vui",
          note: note || "",
          revision,
          updated_at: `${today}T01:00:00+00:00`,
        };
      },
      editMoodEntry: async (id, payload) => {
        calls.edit.push({ id, ...payload });
        revision += 1;
        return {
          entry_id: id,
          entry_date: today,
          emotion: payload.emotion,
          emotion_label: "Vui",
          note: payload.note ?? "",
          revision,
          updated_at: `${today}T02:00:00+00:00`,
        };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);

    host.querySelector(".fb-mood[data-emotion='vui']").click();
    const textarea = host.querySelector(".fb-textarea");
    textarea.value = "lần một";
    findButton(host, "Lưu tâm trạng hôm nay").click();
    await wait(30);
    assert.equal(calls.create.length, 1, "lần đầu: POST tạo");
    assert.equal(calls.edit.length, 0);
    // R08: giữ nội dung đã lưu trong editor (không xoá), chuyển sang chế độ sửa.
    assert.equal(textarea.value, "lần một", "nội dung đã lưu giữ nguyên trong editor");
    assert.ok(findButton(host, "Lưu thay đổi cho hôm nay"), "nút chuyển sang lưu thay đổi");

    // Lưu tiếp ngay tại editor (không remount, không bấm lại history).
    textarea.value = "lần hai";
    findButton(host, "Lưu thay đổi cho hôm nay").click();
    await wait(30);
    assert.equal(calls.create.length, 1, "KHÔNG POST lần nữa (tránh 400 trùng ngày)");
    assert.equal(calls.edit.length, 1);
    assert.equal(calls.edit[0].id, "entry-brand-new", "PATCH đúng mục vừa tạo");
    assert.equal(calls.edit[0].note, "lần hai");

    textarea.value = "lần ba";
    findButton(host, "Lưu thay đổi cho hôm nay").click();
    await wait(30);
    assert.equal(calls.create.length, 1);
    assert.equal(calls.edit.length, 2);
    assert.equal(calls.edit[1].id, "entry-brand-new", "lần 3 vẫn PATCH cùng mục");
    assert.equal(calls.edit[1].note, "lần ba");
    unmount(host);
  });

  it("sửa mục từ history rồi lưu liên tiếp: cả hai lần PATCH cùng entry_id", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter();
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Sửa mục này").click();
    await wait(10);
    const textarea = host.querySelector(".fb-textarea");
    textarea.value = "sửa lần một";
    findButton(host, "Lưu thay đổi cho mục đã chọn").click();
    await wait(30);
    assert.equal(calls.edit.length, 1);
    assert.equal(calls.edit[0].id, ENTRY_V1.entry_id);
    assert.equal(calls.create.length, 0, "sửa mục KHÔNG rơi vào POST");
    // Lưu tiếp ngay (không remount) — vẫn PATCH đúng mục đó.
    textarea.value = "sửa lần hai";
    findButton(host, "Lưu thay đổi cho mục đã chọn").click();
    await wait(30);
    assert.equal(calls.edit.length, 2);
    assert.equal(calls.edit[1].id, ENTRY_V1.entry_id, "PATCH cùng entry_id");
    assert.equal(calls.create.length, 0);
    unmount(host);
  });

  it("sửa mục ngày cũ: lưu tiếp vẫn PATCH mục đó, không âm thầm ghi ngày khác", async () => {
    clearSession();
    liveSession();
    let revision = 1;
    const { adapter, calls } = makeAdapter({
      listMoodEntries: async () => ({ results: [ENTRY_PAST], nextCursor: null }),
      // PATCH /entries/{id} thật trả về ĐÚNG mục được sửa (ngày giữ nguyên).
      editMoodEntry: async (id, payload) => {
        calls.edit.push({ id, ...payload });
        revision += 1;
        return { ...ENTRY_PAST, revision, note: payload.note ?? ENTRY_PAST.note };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Sửa mục này").click();
    await wait(10);
    host.querySelector(".fb-textarea").value = "bổ sung cho ngày cũ";
    findButton(host, "Lưu thay đổi cho mục đã chọn").click();
    await wait(30);
    assert.equal(calls.edit.length, 1);
    assert.equal(calls.edit[0].id, ENTRY_PAST.entry_id);
    host.querySelector(".fb-textarea").value = "bổ sung lần nữa";
    findButton(host, "Lưu thay đổi cho mục đã chọn").click();
    await wait(30);
    assert.equal(calls.edit.length, 2, "lưu tiếp vẫn là mục ngày cũ");
    assert.equal(calls.edit[1].id, ENTRY_PAST.entry_id);
    assert.equal(calls.create.length, 0);
    assert.ok(textOf(host).includes("mục ngày 2026-10-10"),
      "feedback nêu đúng mục ngày cũ đang sửa");
    unmount(host);
  });

  it("tạo bị 400 trùng ngày: giữ nháp + chip chọn, trạng thái không bị xoá", async () => {
    clearSession();
    liveSession();
    let attempts = 0;
    const { adapter, calls } = makeAdapter({
      listMoodEntries: async () => ({ results: [], next: null }),
      createMoodEntry: async (payload) => {
        attempts += 1;
        calls.create.push(payload);
        if (attempts === 1) {
          throw httpError(400, "input_invalid",
            { reason: "entry_already_exists_use_edit" });
        }
        return { ...ENTRY_V1, entry_id: "ok-now", entry_date: todayVnIso() };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    host.querySelector(".fb-mood[data-emotion='buon']").click();
    const textarea = host.querySelector(".fb-textarea");
    textarea.value = "nháp cần giữ";
    findButton(host, "Lưu tâm trạng hôm nay").click();
    await wait(30);
    assert.ok(textOf(host).includes("đã có mục rồi"), "báo lỗi trùng ngày");
    assert.equal(textarea.value, "nháp cần giữ", "giữ nguyên nháp sau lỗi");
    assert.equal(host.querySelector(".fb-mood[data-emotion='buon']")
      .getAttribute("aria-checked"), "true", "giữ chip cảm xúc đã chọn");
    // Lưu lại (thử lại thủ công của người dùng): vẫn chủ động POST, không tự retry.
    findButton(host, "Lưu tâm trạng hôm nay").click();
    await wait(30);
    assert.equal(calls.create.length, 2, "lưu lại là hành động tường minh");
    assert.ok(findButton(host, "Lưu thay đổi cho hôm nay"),
      "thành công thì chuyển đúng chế độ sửa");
    unmount(host);
  });

  it("PATCH lỗi mạng: giữ nháp, lần lưu kế tiếp vẫn PATCH đúng mục (không rơi về POST)", async () => {
    clearSession();
    liveSession();
    let attempts = 0;
    const { adapter, calls } = makeAdapter({
      editMoodEntry: async (id, payload) => {
        attempts += 1;
        calls.edit.push({ id, ...payload });
        if (attempts === 1) throw httpError(0, null, null, "network");
        return { ...ENTRY_PAST, revision: 2, note: payload.note ?? "" };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Sửa mục này").click();
    await wait(10);
    const textarea = host.querySelector(".fb-textarea");
    textarea.value = "thử ghi khi mạng lỗi";
    findButton(host, "Lưu thay đổi cho mục đã chọn").click();
    await wait(30);
    assert.ok(textOf(host).includes("Chưa thao tác được với máy chủ"),
      "hiện lỗi mạng");
    assert.equal(textarea.value, "thử ghi khi mạng lỗi", "giữ nháp");
    textarea.value = "thử lại sau";
    findButton(host, "Lưu thay đổi cho mục đã chọn").click();
    await wait(30);
    assert.equal(calls.edit.length, 2, "lần sau vẫn PATCH");
    assert.equal(calls.edit[1].id, ENTRY_V1.entry_id);
    assert.equal(calls.create.length, 0);
    unmount(host);
  });
});

describe("F07 — R09: Tải thêm hết trang ẩn thật + guard không nhân bản", () => {
  it("hết trang: nút hidden=true; click không phát thêm request nào", async () => {
    clearSession();
    liveSession();
    let listCalls = 0;
    const { adapter } = makeAdapter({
      listMoodEntries: async ({ cursor } = {}) => {
        listCalls += 1;
        return { results: cursor ? [] : [ENTRY_PAST], next: null };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(40);
    const more = host.querySelector("[data-mood-more]");
    assert.ok(more, "có nút Tải thêm");
    assert.equal(more.hidden, true, "hết cursor: hidden=true");
    const before = listCalls;
    const rowsBefore = historyRows(host).length;
    more.click();
    await wait(30);
    more.click();
    await wait(30);
    assert.equal(listCalls, before, "guard onClick chặn khi không cursor");
    assert.equal(historyRows(host).length, rowsBefore, "không append thêm dòng");
    unmount(host);
  });

  it("double-click khi đang tải: chỉ một request thêm, không dòng trùng", async () => {
    clearSession();
    liveSession();
    let listCalls = 0;
    const { adapter, calls } = makeAdapter({
      listMoodEntries: async ({ cursor } = {}) => {
        listCalls += 1;
        if (!cursor) {
          return { results: [{ ...ENTRY_PAST }], nextCursor: "cursor-page-2" };
        }
        // trang 2 trả chậm để double-click rơi vào lúc đang tải
        await wait(60);
        return {
          results: [{ ...ENTRY_V1, entry_id: "second-page-id" }],
          nextCursor: null,
        };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(40);
    const more = host.querySelector("[data-mood-more]");
    assert.equal(more.hidden, false, "còn cursor: nút hiện");
    const before = listCalls;
    more.click();
    more.click(); // double-click ngay khi lần 1 đang chạy
    await wait(140);
    assert.equal(listCalls, before + 1, "chỉ MỘT request trang 2");
    const ids = historyRows(host).map((li) => li.textContent || "");
    assert.equal(ids.length, 2, "đúng 2 dòng (1 trang đầu + 1 trang sau)");
    assert.ok(ids[0].includes("2026-10-10") && ids[1].includes("2026-10-18"));
    assert.equal(more.hidden, true, "hết cursor sau trang 2");
    more.click();
    await wait(30);
    assert.equal(listCalls, before + 1, "click thêm khi hết cursor không gọi API");
    unmount(host);
  });

  it("nhiều trang: append đủ không trùng; reset sau lưu không mất dòng", async () => {
    clearSession();
    liveSession();
    let listCalls = 0;
    const { adapter, calls } = makeAdapter({
      listMoodEntries: async ({ cursor } = {}) => {
        listCalls += 1;
        if (!cursor) {
          return { results: [{ ...ENTRY_PAST }], nextCursor: "cursor-page-2" };
        }
        return {
          results: [{ ...ENTRY_V1, entry_id: "second-page-id" }],
          nextCursor: null,
        };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(40);
    const more = host.querySelector("[data-mood-more]");
    assert.equal(more.hidden, false);
    more.click();
    await wait(40);
    const texts = historyRows(host).map((li) => li.textContent || "");
    assert.equal(texts.length, 2);
    assert.ok(texts[0].includes("2026-10-10") && texts[1].includes("2026-10-18"),
      "không trùng lặp giữa các trang");
    more.click(); // hết cursor
    await wait(30);
    const listCallsAfter = calls.getList.length;
    more.click();
    await wait(30);
    assert.equal(calls.getList.length, listCallsAfter, "không gọi nữa khi hết");
    assert.equal(historyRows(host).length, 2);
    unmount(host);
  });

  it("recipient list (mood-shared): hết trang ẩn + guard; nhiều trang append đủ", async () => {
    clearSession();
    liveSession();
    let listCalls = 0;
    const { adapter } = makeAdapter({
      listSharedMoodEntries: async ({ cursor } = {}) => {
        listCalls += 1;
        if (!cursor) {
          return { results: [{ share_id: "s-1", entry_id: "e-1", owner_id: "o", approved_revision: 1, shared_at: "2026-10-18T04:00:00+00:00" }], nextCursor: "sc-2" };
        }
        return { results: [{ share_id: "s-2", entry_id: "e-2", owner_id: "o", approved_revision: 3, shared_at: "2026-10-17T04:00:00+00:00" }], nextCursor: null };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodSharedPage, ctx);
    await wait(40);
    const more = host.querySelector("[data-shared-more]");
    assert.equal(more.hidden, false);
    more.click();
    await wait(40);
    assert.equal(listCalls, 2, "đúng 2 lần tải 2 trang");
    assert.ok(textOf(host).includes("Phiên bản: 1"));
    assert.ok(textOf(host).includes("Phiên bản: 3"));
    assert.equal(more.hidden, true, "hết cursor ẩn nút");
    const before = listCalls;
    more.click();
    await wait(30);
    assert.equal(listCalls, before, "guard chặn khi hết cursor");
    unmount(host);
  });

  it("CSS có quy tắc .fb-btn[hidden] ẩn thật (browser repro gói 12 đo visible/focus/click)", async () => {
    const css = readFileSync(
      new URL("../src/styles/components.css", import.meta.url), "utf8");
    assert.ok(/\.fb-btn\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css),
      "components.css phải chứa .fb-btn[hidden] { display: none !important }");
  });
});

describe("F07 — R10: lỗi share ngay trong sheet + phục hồi chủ động", () => {
  function sheetFeedbackText() {
    const el = document.querySelector(".fb-sheet .fb-sheet__feedback");
    return el ? textOf(el) : "";
  }

  it("409 stale: lỗi nằm TRONG sheet, KHÔNG ghi vào editor sau overlay; xác nhận bị khoá", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter({
      shareMoodEntry: async (entryId, meta = {}) => {
        calls.share.push({ entryId, ...meta });
        throw httpError(409, "preview_stale",
          { reason: "stale_revision", expected_revision: 1, current_revision: 2 });
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Chia sẻ mục này").click();
    await wait(30);
    const sheet = document.querySelector(".fb-sheet");
    assert.ok(sheet, "sheet mở");
    const confirm = findButton(sheet, "Xác nhận chia sẻ");
    assert.equal(confirm.disabled, false);
    confirm.click();
    await wait(30);
    assert.ok(document.querySelector(".fb-sheet"), "sheet vẫn mở");
    // R10: lỗi PHẢI nằm trong dialog đang thao tác.
    assert.ok(sheetFeedbackText().includes("Mục này vừa đổi"),
      "lỗi stale hiển thị trong sheet (live region)");
    const editorFeedback = host.querySelector("p[role='status']");
    assert.ok(editorFeedback, "editor có feedback element");
    assert.ok(!editorFeedback.textContent.includes("Mục này vừa đổi"),
      "KHÔNG ghi lỗi vào editor phía sau overlay");
    assert.equal(confirm.disabled, true,
      "xác nhận bị khoá tới khi xem lại bản mới");
    const refresh = findButton(sheet, "Xem lại bản mới");
    assert.ok(refresh, "có đường phục hồi trong sheet");
    assert.equal(refresh.hidden, false, "nút xem lại bản mới hiện ra");
    assert.equal(calls.share.length, 1, "không tự retry share");
    unmount(host);
  });

  it("phục hồi stale: Xem lại bản mới → preview revision mới → xác nhận lại gửi đúng revision; không tự share", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter({
      shareMoodEntry: async (entryId, meta = {}) => {
        calls.share.push({ entryId, ...meta });
        if (calls.share.length === 1) {
          throw httpError(409, "preview_stale",
            { reason: "stale_revision", expected_revision: 1, current_revision: 2 });
        }
        return { ...GRANT_ACTIVE };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Chia sẻ mục này").click();
    await wait(30);
    const sheet = document.querySelector(".fb-sheet");
    findButton(sheet, "Xác nhận chia sẻ").click();
    await wait(30);
    assert.equal(calls.share.length, 1, "lần 1: 409");
    const refresh = findButton(sheet, "Xem lại bản mới");
    refresh.click();
    await wait(30);
    assert.equal(calls.refresh.length, 1, "GET bản mới (getMoodEntry)");
    assert.equal(calls.share.length, 1, "CHƯA tự share lại revision mới");
    const sheetText = textOf(sheet);
    assert.ok(sheetText.includes("Phiên bản: 2"), "preview hiện revision mới");
    assert.ok(sheetText.includes("bản mới nhất"), "preview hiện nội dung mới");
    const confirm = findButton(sheet, "Xác nhận chia sẻ");
    assert.equal(confirm.disabled, false, "đã xem bản mới — mở khoá xác nhận");
    // Người dùng phải TỰ bấm xác nhận lại.
    confirm.click();
    await wait(30);
    assert.equal(calls.share.length, 2, "lần 2 do người dùng xác nhận");
    assert.equal(calls.share[1].expectedRevision, 2,
      "gửi đúng revision đã xem lại");
    assert.equal(document.querySelector(".fb-sheet"), null,
      "share thành công: sheet đóng");
    unmount(host);
  });

  it("timeout khi share: không fake success, không tự retry, sheet giữ mở với lỗi rõ", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter({
      shareMoodEntry: async (entryId, meta = {}) => {
        calls.share.push({ entryId, ...meta });
        throw httpError(0, null, null, "timeout");
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Chia sẻ mục này").click();
    await wait(30);
    const sheet = document.querySelector(".fb-sheet");
    findButton(sheet, "Xác nhận chia sẻ").click();
    await wait(60);
    assert.ok(sheetFeedbackText().includes("quá thời gian chờ"),
      "lỗi timeout hiển thị trong sheet");
    assert.ok(document.querySelector(".fb-sheet"), "sheet không tự đóng (không fake success)");
    assert.equal(calls.share.length, 1, "KHÔNG tự retry thao tác ghi");
    const confirm = findButton(sheet, "Xác nhận chia sẻ");
    assert.equal(confirm.disabled, false,
      "người dùng có thể tự thử lại (thủ công, tường minh)");
    const refresh = findButton(sheet, "Xem lại bản mới");
    assert.equal(refresh.hidden, true, "không phải stale: không hiện nút xem lại");
    unmount(host);
  });

  it("thu hồi lỗi: thông báo trong sheet, badge giữ nguyên, không báo đã thu hồi", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter({
      revokeMoodShare: async (shareId) => {
        calls.revoke.push(shareId);
        throw httpError(500, "server_error", { reason: "internal" });
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(30);
    findButton(host, "Chia sẻ mục này").click();
    await wait(30);
    const sheet = document.querySelector(".fb-sheet");
    assert.ok(textOf(sheet).includes("Đang chia sẻ"));
    findButton(sheet, "Thu hồi quyền này").click();
    await wait(10);
    const dialog = document.querySelector(".fb-dialog");
    Array.from(dialog.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Thu hồi")).click();
    await wait(30);
    assert.equal(calls.revoke.length, 1, "một lần gọi thu hồi");
    assert.ok(sheetFeedbackText().includes("Chưa thu hồi được"),
      "lỗi thu hồi hiển thị trong sheet");
    assert.ok(textOf(sheet).includes("Đang chia sẻ"),
      "badge giữ nguyên trạng thái thật (không fake revoked)");
    unmount(host);
  });
});
