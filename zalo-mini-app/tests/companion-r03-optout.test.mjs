// tests/companion-r03-optout.test.mjs — bổ sung hồi quy UI Companion cho các
// luồng chưa được khóa bởi suite trước (QA 19/10 R03 phía mini + opt-out +
// decline + load-error):
//
// R03 (QA 19/10, phía mini) — unlink/reconnect phải lỗi TRUNG THỰC: lời mời
//   hoạt động chung sau khi hủy kết nối bị máy chủ từ chối với
//   details.reason = "no_active_connection" (unlink) hoặc "connection_changed"
//   (reconnect = generation mới). UI phải hiện đúng lý do từ
//   MUTATION_REASON_TEXT, KHÔNG tự retry, nút bật lại để thử lại CHỦ ĐỘNG.
//   (Backend guard: f09_activities/services/activities.py:160-174; UI map:
//   zalo-mini-app/src/pages/companion/index.js MUTATION_REASON_TEXT.)
// Decline — người được mời LUÔN được từ chối (không ai ép accept);
//   activitiesRespond(invite_id, "decline") phải được gọi đúng.
// Opt-out — nghỉ chương trình là thao tác tường minh CÓ dialog xác nhận
//   (destructive), gọi programOptOut(program_key) rồi tải lại trạng thái.
// Load-error — programMy lỗi mạng → "Không tải được chương trình" + "Thử lại"
//   tải lại thành công (không dựng trạng thái rỗng giả).
//
// Chạy: node --test tests/companion-r03-optout.test.mjs

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

const { ApiError } = await import(
  "../../packages/family_bridge_shared/src/api/client.mjs");
const { clearSession, setSession } = await import("../src/core/session.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const companionPage = (await import("../src/pages/companion/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function unmount(host) {
  host.remove();
  document.querySelectorAll(".fb-dialog-root, .fb-overlay")
    .forEach((el) => el.remove());
}

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function liveSession() {
  setSession({
    token: `tok-${Math.random().toString(36).slice(2)}`,
    userId: "user-self",
    expiresAt: Date.now() + 120_000,
  });
}

function makeCtx({ role = "student", adapter } = {}) {
  initStore({ demoMode: false });
  resetState();
  if (role) setRole(role);
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

const WEEKS_PAYLOAD = {
  program_key: "dong-hanh-bon-tuan",
  pinned_revision: 2,
  suggested_week: 1,
  agreement: { revision: 1, title: "Thỏa ước gia đình mới",
    commitments: ["cam kết A"], accepted_by_me: false },
  note_paper_guide: "Bạn hoàn toàn có thể dùng sổ giấy.",
  weeks: [
    { week_no: 1, title: "Nhận diện cảm xúc", goals: ["g1"],
      student_guide: "hướng dẫn HS tuần 1", caregiver_guide: "hướng dẫn PH tuần 1",
      activities: [{ activity_key: "r03-act", status: "none" }] },
    { week_no: 2, title: "Giảm so sánh", goals: [], student_guide: "s2",
      caregiver_guide: "c2", activities: [] },
    { week_no: 3, title: "Ranh giới riêng tư", goals: [], student_guide: "s3",
      caregiver_guide: "c3", activities: [] },
    { week_no: 4, title: "Thỏa ước gia đình mới", goals: [],
      student_guide: "s4", caregiver_guide: "c4", activities: [] },
  ],
};

const ENROLLMENT = { program_key: "dong-hanh-bon-tuan", program_revision: 2,
  active: true };

/** Adapter stub theo đúng surface trang dùng; ghi lại mọi mutation. */
function makeAdapter({
  myEnrollment = ENROLLMENT,
  invites = [],
  inviteError = null,
  optOutError = null,
} = {}) {
  const calls = { invite: [], respond: [], optOut: [], myCount: 0 };
  return {
    calls,
    async programMy() {
      calls.myCount += 1;
      return { results: myEnrollment ? [{ ...myEnrollment }] : [] };
    },
    async programCatalog() {
      return { results: [] };
    },
    async programWeeks() {
      return WEEKS_PAYLOAD;
    },
    async programAgreement() {
      return { agreement: null, agreement_template: WEEKS_PAYLOAD.agreement,
        other_party_id: "user-peer", connection_generation: 1 };
    },
    async activitiesInvites() {
      return { results: invites };
    },
    async activitiesCatalog() {
      return { results: [{
        content_key: "r03-act", kind: "activity", revision: 2,
        title: "Hoạt động R03", audience: "joint", minutes: 5,
        status: "published",
        body: { goal: "Mục tiêu R03", steps: ["Bước 1"], share: "Chỉ trạng thái" },
      }] };
    },
    async programEnroll(payload) {
      return { ...ENROLLMENT };
    },
    async programOptOut(programKey) {
      calls.optOut.push(programKey);
      if (optOutError) throw optOutError;
      return { program_key: programKey, active: false };
    },
    async programProgress(payload) {
      return { ...payload };
    },
    async programAgreementPropose() {
      return { agreement_id: "ag-1", status: "proposed" };
    },
    async programAgreementConfirm(id) {
      return { agreement_id: id, status: "confirmed" };
    },
    async programAgreementWithdraw() {
      return { agreement_id: "ag-1", status: "withdrawn" };
    },
    async activitiesInvite(payload) {
      calls.invite.push(payload);
      if (inviteError) throw inviteError;
      return { invite_id: "inv-1", status: "pending", direction: "sent" };
    },
    async activitiesRespond(id, decision) {
      calls.respond.push([id, decision]);
      return { invite_id: id, status: decision };
    },
  };
}

function companionNote(host) {
  const note = host.querySelector('[data-companion-note="1"]');
  return note ? textOf(note) : "";
}

describe("QA 19/10 R03 (mini) — mời sau unlink/reconnect phải lỗi trung thực", () => {
  it("mời bị chặn no_active_connection → đúng lý do, KHÔNG tự retry, nút bật lại", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      inviteError: new ApiError("Không thể hoàn tất yêu cầu.", 409, "http",
        { code: "input_invalid",
          details: { reason: "no_active_connection" } }),
    });
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      assert.ok(invite, "phải có nút mời khi đã kết nối + có revision");
      invite.click();
      await wait(30);
      assert.match(companionNote(host),
        /cần hai bên đã kết nối trước khi mời hoạt động chung/,
        "lý do unlink phải hiển thị nguyên văn cho người dùng");
      assert.equal(adapter.calls.invite.length, 1,
        "KHÔNG được tự retry mutation — người dùng chủ động thử lại");
      assert.equal(invite.disabled, false,
        "nút phải bật lại để thử lại CHỦ ĐỘNG");
      assert.ok(!navigateCalls.includes("/login?reason=expired"),
        "409 không phải hết phiên — không được đá ra login");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("mời bị chặn connection_changed (reconnect generation mới) → đúng lý do", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      inviteError: new ApiError("Không thể hoàn tất yêu cầu.", 409, "http",
        { code: "input_invalid", details: { reason: "connection_changed" } }),
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      invite.click();
      await wait(30);
      assert.match(companionNote(host), /kết nối đã thay đổi/,
        "reconnect (generation mới) phải báo kết nối đã thay đổi");
      assert.equal(adapter.calls.invite.length, 1, "không tự retry");
      assert.equal(invite.disabled, false, "cho thử lại chủ động");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Lời mời hai chiều — decline LUÔN cho phép, không ai ép accept", () => {
  it("người được mời bấm 'Từ chối' → activitiesRespond(invite_id, 'decline')", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      invites: [
        { invite_id: "inv-recv", content_key: "r03-act", direction: "received",
          status: "pending" },
      ],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const decline = findButton(host, "Từ chối");
      assert.ok(decline, "phải có nút từ chối lời mời nhận được");
      assert.equal(decline.disabled, false, "từ chối LUÔN được phép");
      decline.click();
      await wait(30);
      assert.deepEqual(adapter.calls.respond, [["inv-recv", "decline"]],
        "decline phải gọi respond đúng invite_id + quyết định");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Opt-out — nghỉ chương trình tường minh qua dialog xác nhận", () => {
  it("Nghỉ chương trình (opt-out) → dialog destructive → xác nhận → programOptOut(program_key) + tải lại", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.equal(adapter.calls.myCount, 1, "nạp lần đầu đúng 1 lần");
      const trigger = findButton(host, "Nghỉ chương trình (opt-out)");
      assert.ok(trigger, "phải có nút opt-out tường minh");
      trigger.click();
      await wait(20);
      const dialogRoot = document.querySelector(".fb-dialog-root");
      assert.ok(dialogRoot, "phải có dialog xác nhận trước khi nghỉ");
      assert.match(textOf(dialogRoot), /Nghỉ chương trình bốn tuần\?/,
        "dialog hỏi tường minh, không opt-out âm thầm");
      const confirmBtn = Array.from(
        dialogRoot.querySelectorAll(".fb-dialog__actions button"),
      ).find((btn) => textOf(btn) === "Nghỉ chương trình");
      assert.ok(confirmBtn, "dialog phải có action 'Nghỉ chương trình'");
      confirmBtn.click();
      await wait(40);
      assert.deepEqual(adapter.calls.optOut, ["dong-hanh-bon-tuan"],
        "opt-out phải gọi đúng program_key của enrollment đang theo");
      assert.equal(adapter.calls.myCount, 2,
        "sau opt-out phải tải lại trạng thái từ máy chủ");
      assert.ok(!document.querySelector(".fb-dialog-root"),
        "dialog tự đóng sau xác nhận");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("hủy trong dialog (Ở lại) → KHÔNG gọi programOptOut", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      findButton(host, "Nghỉ chương trình (opt-out)").click();
      await wait(20);
      const dialogRoot = document.querySelector(".fb-dialog-root");
      const stayBtn = Array.from(
        dialogRoot.querySelectorAll(".fb-dialog__actions button"),
      ).find((btn) => textOf(btn) === "Ở lại");
      stayBtn.click();
      await wait(30);
      assert.equal(adapter.calls.optOut.length, 0,
        "chọn ở lại không được ghi opt-out");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Load-error — lỗi mạng khi nạp chương trình phải là lỗi thật + thử lại được", () => {
  it("programMy lỗi mạng → 'Không tải được chương trình' + 'Thử lại' nạp lại thành công", async () => {
    clearSession();
    liveSession();
    let failFirst = true;
    const adapter = makeAdapter();
    adapter.programMy = async () => {
      adapter.calls.myCount += 1;
      if (failFirst) {
        failFirst = false;
        throw new ApiError("Chưa kết nối được backend.", 0, "network");
      }
      return { results: [{ ...ENROLLMENT }] };
    };
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.match(textOf(host), /Không tải được chương trình/,
        "lỗi nạp phải hiện error state trung thực");
      assert.ok(host.querySelector('[role="alert"]'), "error state role=alert");
      assert.ok(!textOf(host).includes("Tuần 1"),
        "không được dựng trang tuần giả khi chưa có dữ liệu");
      const retry = findButton(host, "Thử lại");
      assert.ok(retry, "phải có nút thử lại chủ động");
      retry.click();
      await wait(60);
      assert.ok(textOf(host).includes("Tuần 1 — Nhận diện cảm xúc"),
        "thử lại phải nạp được chương trình thật");
      assert.ok(textOf(host).includes("rev 2"), "đúng pinned revision");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});
