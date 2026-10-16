// tests/companion-program.test.mjs — F02 trang /companion bản thật (US-036/044).
// Yêu cầu nghiệp vụ: xem mọi tuần đã publish (không khóa, không "Sắp có" vì
// chưa làm), tham gia tự nguyện, tiến độ riêng, sổ giấy không ép, thỏa ước
// tuần 4 cần HAI người tự xác nhận cùng revision, lời mời F09 hai chiều.
// Chạy: node --test tests/companion-program.test.mjs

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
  document.querySelectorAll(".fb-sheet-root, .fb-dialog-root").forEach((el) => el.remove());
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

/** Danh mục hoạt động F09 published (revision >1 — lời mời dùng đúng
 * revision từ nguồn thật, không hardcode). */
const ACTIVITY_CATALOG = [
  { content_key: "f09-w1", kind: "activity", revision: 2,
    title: "Trò chuyện 5 phút", audience: "joint", minutes: 5,
    status: "published" },
];

const WEEKS_PAYLOAD = {
  program_key: "dong-hanh-bon-tuan",
  pinned_revision: 3,
  suggested_week: 1,
  agreement: { revision: 1, title: "Thỏa ước gia đình mới",
    commitments: ["cam kết A", "cam kết B"], accepted_by_me: false },
  note_paper_guide: "Bạn hoàn toàn có thể dùng sổ giấy.",
  weeks: [
    { week_no: 1, title: "Nhận diện cảm xúc", goals: ["g1", "g2"],
      student_guide: "hướng dẫn HS", caregiver_guide: "hướng dẫn PH",
      joint_activity_keys: ["f09-w1"],
      activities: [{ activity_key: "f09-w1", status: "none" }] },
    { week_no: 2, title: "Giảm so sánh", goals: [], student_guide: "s2",
      caregiver_guide: "c2", joint_activity_keys: [],
      activities: [] },
    { week_no: 3, title: "Ranh giới riêng tư", goals: [], student_guide: "s3",
      caregiver_guide: "c3", joint_activity_keys: [], activities: [] },
    { week_no: 4, title: "Thỏa ước gia đình mới", goals: [],
      student_guide: "s4", caregiver_guide: "c4",
      joint_activity_keys: [], activities: [] },
  ],
};

const ENROLLMENT = { program_key: "dong-hanh-bon-tuan", program_revision: 3,
  active: true };

/** Adapter stub theo đúng surface trang dùng. */
function makeAdapter({
  myEnrollment = null,
  catalogResults = [],
  weeksPayload = WEEKS_PAYLOAD,
  agreementPayload = { agreement: null, agreement_template: WEEKS_PAYLOAD.agreement,
    other_party_id: "user-peer", connection_generation: 1 },
  invites = [],
  activityCatalog = ACTIVITY_CATALOG,
  fail = {},
} = {}) {
  const calls = { enroll: [], progress: [], propose: 0, confirm: [], withdraw: 0,
    invite: [], respond: [], optOut: 0, myCount: 0 };
  return {
    calls,
    async programMy() {
      calls.myCount += 1;
      if (fail.my) throw fail.my;
      return { results: myEnrollment ? [myEnrollment] : [] };
    },
    async programCatalog() {
      if (fail.catalog) throw fail.catalog;
      return { results: catalogResults };
    },
    async programWeeks(key) {
      if (fail.weeks) throw fail.weeks;
      return weeksPayload;
    },
    async programAgreement(key) {
      if (fail.agreement) throw fail.agreement;
      return agreementPayload;
    },
    async activitiesInvites() {
      return { results: invites };
    },
    async activitiesCatalog() {
      if (fail.activityCatalog) throw fail.activityCatalog;
      return { results: activityCatalog };
    },
    async programEnroll(payload) {
      calls.enroll.push(payload);
      return { ...ENROLLMENT };
    },
    async programOptOut() {
      calls.optOut += 1;
      return { active: false };
    },
    async programProgress(payload) {
      calls.progress.push(payload);
      return { ...payload, status: payload.status };
    },
    async programAgreementPropose(key) {
      calls.propose += 1;
      return { agreement_id: "ag-1", status: "proposed", my_confirmed: false,
        counterpart_confirmed: false, commitments: ["cam kết A"],
        proposed_by_me: true };
    },
    async programAgreementConfirm(id) {
      calls.confirm.push(id);
      return { agreement_id: id, status: "confirmed", my_confirmed: true,
        counterpart_confirmed: true };
    },
    async programAgreementWithdraw(id) {
      calls.withdraw += 1;
      return { agreement_id: id, status: "withdrawn" };
    },
    async activitiesInvite(payload) {
      calls.invite.push(payload);
      return { invite_id: "inv-1", status: "pending", direction: "sent" };
    },
    async activitiesRespond(id, decision) {
      calls.respond.push([id, decision]);
      return { invite_id: id, status: decision };
    },
  };
}

describe("Companion — chưa tham gia (F02 catalogue, tự nguyện)", () => {
  it("catalog rỗng (thầy chưa publish) → empty state trung thực, KHÔNG fake nội dung", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ catalogResults: [] });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const text = textOf(host);
      assert.ok(text.includes("Chưa có chương trình nào được phát hành"),
        `thực tế: ${text.slice(0, 160)}`);
      assert.ok(text.includes("sổ giấy"), "ghi chú sổ giấy vẫn hiện");
      assert.ok(!text.includes("Sắp có"), "không badge 'Sắp có' giả");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("catalog có chương trình → nút Tham gia gọi enroll đúng key+revision", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      catalogResults: [{ program_key: "dong-hanh-bon-tuan", revision: 3,
        title: "Đồng hành bốn tuần", weeks: [], agreement: {} }],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const join = findButton(host, "Tham gia chương trình");
      assert.ok(join, "phải có nút tham gia tường minh");
      join.click();
      await wait(20);
      // Tham gia phải qua dialog xác nhận (không tự enroll khi bấm sơ sơ)
      const dialogRoot = document.querySelector(".fb-dialog-root");
      assert.ok(dialogRoot, "tham gia qua dialog xác nhận");
      const dialogJoin = Array.from(dialogRoot.querySelectorAll("button"))
        .find((btn) => textOf(btn) === "Tham gia");
      assert.ok(dialogJoin);
      dialogJoin.click();
      await wait(30);
      assert.equal(adapter.calls.enroll.length, 1);
      assert.equal(adapter.calls.enroll[0].programKey, "dong-hanh-bon-tuan");
      assert.equal(adapter.calls.enroll[0].programRevision, 3);
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Companion — đã tham gia (4 tuần, tiến độ riêng, không khóa tuần)", () => {
  it("render đủ 4 tuần, tuần 4 xem được mà không cần tuần 1; đúng guide theo vai", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ myEnrollment: ENROLLMENT });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const text = textOf(host);
      for (const t of ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4"]) {
        assert.ok(text.includes(t), `thiếu ${t}`);
      }
      assert.ok(text.includes("hướng dẫn HS"), "student thấy guide HS");
      assert.ok(!text.includes("hướng dẫn PH"), "student không thấy guide PH");
      assert.ok(text.includes("rev 3"), "hiện pinned revision");
      assert.ok(!text.includes("Sắp có"), "không khóa tuần nào");
      assert.ok(text.includes("sổ giấy"));
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("đánh dấu tiến độ của MÌNH qua API rồi tải lại", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ myEnrollment: ENROLLMENT });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const done = findButton(host, "Tôi đã làm");
      assert.ok(done);
      done.click();
      await wait(30);
      assert.equal(adapter.calls.progress.length, 1);
      assert.equal(adapter.calls.progress[0].status, "done");
      assert.equal(adapter.calls.progress[0].weekNo, 1);
      assert.equal(adapter.calls.progress[0].activityKey, "f09-w1");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("401 → về login?reason=expired, không dựng trạng thái giả", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      myEnrollment: ENROLLMENT,
      fail: { my: Object.assign(new Error("401"), { status: 401 }) },
    });
    const { ctx, navigateCalls } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(navigateCalls.includes("/login?reason=expired"));
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Companion — thỏa ước tuần 4 (hai người cùng xác nhận)", () => {
  it("chưa có instance → nút Đề xuất; proposed → xác nhận qua dialog; confirmed → đúng chữ", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      myEnrollment: ENROLLMENT,
      agreementPayload: { agreement: null,
        agreement_template: WEEKS_PAYLOAD.agreement,
        other_party_id: "user-peer", connection_generation: 1 },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const propose = findButton(host, "Đề xuất thỏa ước");
      assert.ok(propose, "chưa có đề xuất thì hiện nút đề xuất");
      propose.click();
      await wait(30);
      assert.equal(adapter.calls.propose, 1);
      unmount(host);

      // proposed, tôi chưa xác nhận
      liveSession();
      const adapter2 = makeAdapter({
        myEnrollment: ENROLLMENT,
        agreementPayload: { agreement: { agreement_id: "ag-1",
          status: "proposed", my_confirmed: false, counterpart_confirmed: false,
          proposed_by_me: true, commitments: ["cam kết A"] },
          agreement_template: WEEKS_PAYLOAD.agreement,
          other_party_id: "user-peer", connection_generation: 1 },
      });
      const { ctx: ctx2 } = makeCtx({ role: "student", adapter: adapter2 });
      const { host: host2 } = mount(companionPage, ctx2);
      await wait(60);
      const confirmBtn = findButton(host2, "Tôi xác nhận thỏa ước");
      assert.ok(confirmBtn);
      confirmBtn.click();
      await wait(20);
      const dialogRoot = document.querySelector(".fb-dialog-root");
      assert.ok(dialogRoot, "xác nhận thỏa ước phải qua dialog");
      const dialogConfirm = Array.from(dialogRoot.querySelectorAll("button"))
        .find((btn) => textOf(btn) === "Tôi xác nhận");
      assert.ok(dialogConfirm);
      dialogConfirm.click();
      await wait(30);
      assert.deepEqual(adapter2.calls.confirm, ["ag-1"]);
      unmount(host2);

      // confirmed
      liveSession();
      const adapter3 = makeAdapter({
        myEnrollment: ENROLLMENT,
        agreementPayload: { agreement: { agreement_id: "ag-1",
          status: "confirmed", my_confirmed: true, counterpart_confirmed: true,
          proposed_by_me: true, commitments: ["cam kết A"] },
          agreement_template: WEEKS_PAYLOAD.agreement,
          other_party_id: "user-peer", connection_generation: 1 },
      });
      const { ctx: ctx3 } = makeCtx({ role: "student", adapter: adapter3 });
      const { host: host3 } = mount(companionPage, ctx3);
      await wait(60);
      assert.ok(textOf(host3).includes("Cả hai đã cùng xác nhận"));
      assert.equal(findButton(host3, "Tôi xác nhận thỏa ước"), undefined);
      unmount(host3);
    } finally {
      clearSession();
    }
  });
});

describe("Companion — lời mời hoạt động chung (F09 hai chiều)", () => {
  it("có lời mời nhận được → Chấp nhận/Từ chối; lời mời đã gửi → chip chờ", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      myEnrollment: ENROLLMENT,
      invites: [
        { invite_id: "inv-recv", content_key: "f09-w1", direction: "received",
          status: "pending" },
      ],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const accept = findButton(host, "Chấp nhận cùng làm");
      assert.ok(accept, "người được mời phải thấy nút chấp nhận");
      accept.click();
      await wait(30);
      assert.deepEqual(adapter.calls.respond, [["inv-recv", "accept"]]);
      unmount(host);

      clearSession();
      liveSession();
      const adapter2 = makeAdapter({
        myEnrollment: ENROLLMENT,
        invites: [
          { invite_id: "inv-sent", content_key: "f09-w1", direction: "sent",
            status: "pending" },
        ],
      });
      const { ctx: ctx2 } = makeCtx({ role: "student", adapter: adapter2 });
      const { host: host2 } = mount(companionPage, ctx2);
      await wait(60);
      assert.ok(textOf(host2).includes("Đã mời — đang chờ phía kia phản hồi"));
      assert.equal(findButton(host2, "Chấp nhận cùng làm"), undefined);
      unmount(host2);
    } finally {
      clearSession();
    }
  });

  it("chưa có lời mời → nút Mời; mời gọi activitiesInvite với đúng nội dung + revision từ catalog F09", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ myEnrollment: ENROLLMENT });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const invite = findButton(host, "Mời cùng làm");
      assert.ok(invite, "phải có nút mời hoạt động chung");
      assert.equal(invite.disabled, false, "có other_party_id nên nút bật");
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite.length, 1);
      assert.equal(adapter.calls.invite[0].contentKey, "f09-w1");
      assert.equal(adapter.calls.invite[0].inviteeId, "user-peer");
      assert.equal(adapter.calls.invite[0].contentRevision, 2,
        "revision phải từ catalog F09 thật (2), không hardcode 1");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});
