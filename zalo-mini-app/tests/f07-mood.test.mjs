// tests/f07-mood.test.mjs — UI F07 với payload GIỐNG SHAPE backend thật
// (entry.view(), grant_view(), read_shared của packages/.../f07_mood):
// editor lưu riêng tư, trùng ngày, share flow preview + expected_revision,
// 409 stale, quản lý grant + thu hồi, phía nhận 404 không lộ nội dung.
// Chạy: node --test tests/f07-mood.test.mjs

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

// --------------------------------------------------- app code (import sau globals)
const { clearSession, setSession } = await import("../src/core/session.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const moodPage = (await import("../src/pages/mood/index.js")).page;
const moodSharedPage = (await import("../src/pages/mood-shared/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Shapes copy NGUYÊN VĂN từ backend thật (f07_mood models/services) — không
// bịa field theo tiện UI (bài học F02: UI phải đọc đúng response thật).
const ENTRY_TODAY = {
  entry_id: "6f1c2a34-0000-4000-8000-000000000001",
  entry_date: "2026-10-18",
  emotion: "lo",
  emotion_label: "Lo lắng",
  note: "lo vì bài kiểm tra",
  revision: 1,
  updated_at: "2026-10-18T03:20:00+00:00",
};
const ENTRY_V1 = ENTRY_TODAY;
const ENTRY_PAST = {
  ...ENTRY_TODAY,
  entry_id: "6f1c2a34-0000-4000-8000-000000000009",
  entry_date: "2026-10-10",
};
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

/** Adapter ghi lại lời gọi; response là shape backend thật. */
function makeAdapter(overrides = {}) {
  const calls = { share: [], revoke: [], create: [], edit: [] };
  const adapter = {
    moodSummary: async () => ({
      results: [{ emotion: "lo", label: "Lo lắng", count: 2 }],
      emotions: [
        { emotion: "vui", label: "Vui" }, { emotion: "binh_an", label: "Bình an" },
        { emotion: "met", label: "Mệt" }, { emotion: "buon", label: "Buồn" },
        { emotion: "lo", label: "Lo lắng" }, { emotion: "buc", label: "Bực bội" },
        { emotion: "kho_noi", label: "Khó nói thành lời" },
      ],
    }),
    listMoodEntries: async ({ cursor, limit } = {}) => ({
      results: cursor ? [] : [ENTRY_V1],
      next: cursor ? null : "cursor-1",
    }),
    createMoodEntry: async ({ emotion, note } = {}) => {
      calls.create.push({ emotion, note });
      return { ...ENTRY_V1, entry_id: "new", emotion };
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
        share_id: "9a1c2a34-0000-4000-8000-000000000002",
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

describe("F07 Mini App — trang Tâm trạng của mình (owner)", () => {
  it("chưa đăng nhập: empty state + dẫn đăng nhập, không gọi API", async () => {
    clearSession();
    const { adapter, calls } = makeAdapter();
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    assert.ok(textOf(host).includes("Cần đăng nhập"));
    assert.equal(calls.create.length, 0);
    unmount(host);
  });

  it("mặc định riêng tư: chip 'Chỉ mình bạn' hiển thị; lưu gọi createMoodEntry", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter({
      listMoodEntries: async () => ({ results: [ENTRY_PAST], next: null }),
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(20);
    assert.ok(textOf(host).includes("Chỉ mình bạn"));
    const chip = host.querySelector(".fb-mood[data-emotion='buon']");
    chip.click();
    const textarea = host.querySelector(".fb-textarea");
    textarea.value = "hôm nay hơi buồn";
    findButton(host, "Lưu tâm trạng hôm nay").click();
    await wait(20);
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].emotion, "buon");
    assert.equal(calls.create[0].note, "hôm nay hơi buồn");
    assert.ok(textOf(host).includes("chỉ mình bạn thấy"));
    unmount(host);
  });

  it("trùng ngày: hướng dẫn sửa mục có sẵn, không bịa thành công", async () => {
    clearSession();
    liveSession();
    const { adapter } = makeAdapter({
      listMoodEntries: async () => ({ results: [ENTRY_PAST], next: null }),
      createMoodEntry: async () => {
        const error = new Error("dup");
        error.status = 400;
        error.kind = "http";
        error.details = { reason: "entry_already_exists_use_edit" };
        throw error;
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(20);
    host.querySelector(".fb-mood[data-emotion='vui']").click();
    findButton(host, "Lưu tâm trạng hôm nay").click();
    await wait(20);
    assert.ok(textOf(host).includes("đã có mục rồi"));
    unmount(host);
  });

  it("share flow: preview đủ note + revision; xác nhận gửi expected_revision", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter();
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(20);
    findButton(host, "Chia sẻ mục này").click();
    await wait(20);
    const sheet = document.querySelector(".fb-sheet");
    assert.ok(sheet, "sheet chia sẻ mở");
    const sheetText = textOf(sheet);
    // Preview ĐẦY ĐỦ phần sẽ chia sẻ (cả note) — không nói "chỉ cảm xúc".
    assert.ok(sheetText.includes("lo vì bài kiểm tra"));
    assert.ok(sheetText.includes("Phiên bản: 1"));
    assert.ok(sheetText.includes("Mẹ (tự khai báo)"));
    const confirm = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Xác nhận chia sẻ"));
    await wait(20); // người nhận tải xong -> nút xác nhận bật
    assert.equal(confirm.disabled, false, "có người nhận -> bật xác nhận");
    confirm.click();
    await wait(20);
    assert.equal(calls.share.length, 1);
    assert.equal(calls.share[0].expectedRevision, 1); // đúng bản đã xem trước
    assert.ok(calls.share[0].recipientId);
    unmount(host);
  });

  it("stale preview (409): giữ sheet, yêu cầu xem lại bản mới", async () => {
    clearSession();
    liveSession();
    const { adapter } = makeAdapter({
      shareMoodEntry: async () => {
        const error = new Error("stale");
        error.status = 409;
        error.kind = "http";
        error.details = { reason: "stale_revision" };
        throw error;
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(20);
    findButton(host, "Chia sẻ mục này").click();
    await wait(20);
    const sheet = document.querySelector(".fb-sheet");
    const confirm = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Xác nhận chia sẻ"));
    confirm.disabled = false;
    confirm.click();
    await wait(20);
    assert.ok(document.querySelector(".fb-sheet"), "sheet vẫn mở để xem lại");
    assert.ok(textOf(host).includes("vừa đổi sau khi bạn xem trước")
      || textOf(sheet).includes("vừa đổi sau khi bạn xem trước"));
    unmount(host);
  });

  it("quản lý grant: badge trạng thái thật + thu hồi đúng share_id", async () => {
    clearSession();
    liveSession();
    const { adapter, calls } = makeAdapter();
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodPage, ctx);
    await wait(20);
    findButton(host, "Chia sẻ mục này").click();
    await wait(20);
    const sheet = document.querySelector(".fb-sheet");
    assert.ok(textOf(sheet).includes("Đang chia sẻ"));
    findButton(sheet, "Thu hồi quyền này").click();
    await wait(10);
    const dialog = document.querySelector(".fb-dialog");
    assert.ok(dialog, "xác nhận thu hồi");
    Array.from(dialog.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Thu hồi")).click();
    await wait(20);
    assert.deepEqual(calls.revoke, [GRANT_ACTIVE.share_id]);
    unmount(host);
  });
});

describe("F07 Mini App — trang Được chia sẻ với bạn (recipient)", () => {
  it("danh sách + chi tiết recheck: nội dung render textContent an toàn", async () => {
    clearSession();
    liveSession();
    const { adapter } = makeAdapter();
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodSharedPage, ctx);
    await wait(20);
    assert.ok(textOf(host).includes("Mục ngày 2026-10-18"));
    findButton(host, "Mở nội dung").click();
    await wait(20);
    assert.ok(textOf(host).includes("lo vì bài kiểm tra"));
    assert.ok(textOf(host).includes("máy chủ kiểm tra quyền mỗi lần đọc"));
    unmount(host);
  });

  it("404 sau thu hồi/sửa: thông điệp rõ, KHÔNG lộ nội dung cũ", async () => {
    clearSession();
    liveSession();
    const { adapter } = makeAdapter({
      getSharedMoodEntry: async () => {
        const error = new Error("gone");
        error.status = 404;
        error.kind = "http";
        error.details = { reason: "share_not_found" };
        throw error;
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodSharedPage, ctx);
    await wait(20);
    findButton(host, "Mở nội dung").click();
    await wait(20);
    const bodyText = textOf(host);
    assert.ok(bodyText.includes("Không còn xem được"));
    assert.ok(!bodyText.includes("lo vì bài kiểm tra"), "nội dung không được lộ");
    unmount(host);
  });

  it("mở lại sau thu hồi: nội dung lần đọc trước bị gỡ khỏi màn", async () => {
    clearSession();
    liveSession();
    let failNext = false;
    const { adapter } = makeAdapter({
      getSharedMoodEntry: async () => {
        if (failNext) {
          const error = new Error("gone");
          error.status = 404;
          error.kind = "http";
          error.details = { reason: "share_not_found" };
          throw error;
        }
        return {
          share_id: GRANT_ACTIVE.share_id,
          entry: ENTRY_V1,
          owner_id: ENTRY_V1.entry_id,
          shared_at: GRANT_ACTIVE.created_at,
        };
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodSharedPage, ctx);
    await wait(20);
    findButton(host, "M\u1edf n\u1ed9i dung").click(); // lần 1: đọc được
    await wait(20);
    assert.ok(textOf(host).includes("lo vì bài kiểm tra"));
    failNext = true;
    findButton(host, "M\u1edf n\u1ed9i dung").click(); // lần 2: 404 sau thu hồi
    await wait(20);
    const bodyText = textOf(host);
    assert.ok(bodyText.includes("Không còn xem được"));
    assert.ok(!bodyText.includes("lo vì bài kiểm tra"),
      "nội dung cũ phải bị gỡ khỏi màn sau khi lần đọc mới bị chặn");
    unmount(host);
  });

  it("lỗi tải danh sách: error state có Thử lại, không biến thành empty", async () => {
    clearSession();
    liveSession();
    const { adapter } = makeAdapter({
      listSharedMoodEntries: async () => {
        const error = new Error("net");
        error.status = 0;
        error.kind = "network";
        throw error;
      },
    });
    const { ctx } = makeCtx(adapter);
    const { host } = mount(moodSharedPage, ctx);
    await wait(20);
    assert.ok(textOf(host).includes("Không tải được danh sách"));
    assert.ok(findButton(host, "Thử lại"));
    unmount(host);
  });
});
