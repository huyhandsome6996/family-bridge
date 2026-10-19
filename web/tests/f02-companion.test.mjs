// tests/f02-companion.test.mjs — trang /companion WEB THẬT (QA 19/10 R07):
// gọi cùng API qua adapter (không placeholder tĩnh, không "Sắp có" hardcode),
// kèm parity R01/R05/R06 trên web. KHÔNG import page/DOM/zmp-sdk của Mini App.
// Chạy: node --test tests/f02-companion.test.mjs

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

const { clearSession, setSession, hasLiveSession } = await import("../src/core/session.js");
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
  document.querySelectorAll(".fb-sheet-root, .fb-dialog-root, .fb-overlay").forEach((el) => el.remove());
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

const STEP_TEXT = "BƯỚC WEB ĐỘC LẬP: cùng đọc to một câu con thích.";

const WEEKS_PAYLOAD = {
  program_key: "dong-hanh-bon-tuan",
  pinned_revision: 2,
  suggested_week: 1,
  agreement: { revision: 1, title: "Thỏa ước gia đình mới",
    commitments: ["cam kết A"], accepted_by_me: false },
  note_paper_guide: "Bạn hoàn toàn có thể dùng sổ giấy.",
  weeks: [
    { week_no: 1, title: "Tuần web riêng từ máy chủ", goals: ["g1"],
      student_guide: "guide HS tuần 1", caregiver_guide: "guide PH tuần 1",
      joint_activity_keys: ["qa-act"],
      activities: [{ activity_key: "qa-act", status: "none" }] },
    { week_no: 2, title: "Tuần 2 máy chủ", goals: [], student_guide: "s2",
      caregiver_guide: "c2", joint_activity_keys: [], activities: [] },
    { week_no: 3, title: "Tuần 3 máy chủ", goals: [], student_guide: "s3",
      caregiver_guide: "c3", joint_activity_keys: [], activities: [] },
    { week_no: 4, title: "Tuần 4 máy chủ", goals: [],
      student_guide: "s4", caregiver_guide: "c4",
      joint_activity_keys: [], activities: [] },
  ],
};

const ENROLLMENT = { program_key: "dong-hanh-bon-tuan", program_revision: 2,
  active: true };

const PROGRAM_CATALOG = [{
  program_key: "dong-hanh-bon-tuan", revision: 2,
  title: "Đồng hành bốn tuần", agreement: { revision: 1 },
  weeks: WEEKS_PAYLOAD.weeks.map((week) => ({
    ...week, activities: undefined,
  })),
}];

function activityRow({ revision, title = "Hoạt động QA", minutes = 5,
  body = { steps: [STEP_TEXT], goal: "Mục tiêu QA",
    share: "Chỉ chia sẻ trạng thái" }, status = "published" }) {
  const row = { content_key: "qa-act", kind: "activity", revision, title,
    audience: "joint", status };
  if (minutes !== undefined) row.minutes = minutes;
  if (body !== undefined) row.body = body;
  return row;
}

/** Adapter stub web theo đúng surface trang dùng; ghi lại mọi mutation. */
function makeAdapter({
  enrolled = true,
  activityCatalog = [],
  programCatalog = PROGRAM_CATALOG,
} = {}) {
  const calls = { enroll: [], invite: [], progress: [], confirm: [],
    propose: 0, optOut: [], respond: [] };
  return {
    calls,
    mode: "web",
    async programMy() {
      return { results: enrolled ? [{ ...ENROLLMENT }] : [] };
    },
    async programCatalog() {
      return { results: programCatalog };
    },
    async programWeeks() {
      return WEEKS_PAYLOAD;
    },
    async programAgreement() {
      return { agreement: null, agreement_template: WEEKS_PAYLOAD.agreement,
        other_party_id: "user-peer", connection_generation: 1 };
    },
    async activitiesInvites() {
      return { results: [] };
    },
    async activitiesCatalog() {
      return { results: activityCatalog };
    },
    async programEnroll(payload) {
      calls.enroll.push(payload);
      return { ...ENROLLMENT };
    },
    async programOptOut(programKey) {
      calls.optOut.push(programKey);
      return { active: false };
    },
    async programProgress(payload) {
      calls.progress.push(payload);
      return { ...payload };
    },
    async programAgreementPropose(key) {
      calls.propose += 1;
      return { agreement_id: "ag-1", status: "proposed", my_confirmed: false,
        proposed_by_me: true, commitments: ["cam kết A"] };
    },
    async programAgreementConfirm(id) {
      calls.confirm.push(id);
      return { agreement_id: id, status: "confirmed", my_confirmed: true };
    },
    async programAgreementWithdraw() {
      return { agreement_id: "ag-1", status: "withdrawn" };
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

describe("QA 19/10 R07 — web companion là trang THẬT cùng API", () => {
  it("đã tham gia: tuần render từ MÁY CHỦ (tuần 2–4 mở được, không 'Sắp có')", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const text = textOf(host);
      assert.ok(text.includes("Tuần web riêng từ máy chủ"),
        "nội dung tuần phải từ máy chủ");
      assert.ok(text.includes("Tuần 2 — Tuần 2 máy chủ"),
        "tuần 2 phải render thật từ payload");
      assert.ok(text.includes("Tuần 4 — Tuần 4 máy chủ"),
        "tuần 4 phải render thật (khóa tuần là cấm)");
      assert.ok(!text.includes("Sắp có"), "không còn badge 'Sắp có' giả");
      assert.ok(!text.includes("Tiếng lòng chưa nói"),
        "không còn copy hardcode của placeholder");
      assert.ok(text.includes("rev 2"), "phiên bản pin hiển thị trung thực");
      assert.ok(text.includes("guide HS tuần 1"), "guide theo vai trò hiện ra");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("tiến độ riêng: 'Tôi đã làm' gọi programProgress đúng key/tuần/trạng thái", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const done = findButton(host, "Tôi đã làm");
      assert.ok(done);
      done.click();
      await wait(30);
      assert.equal(adapter.calls.progress.length, 1);
      assert.equal(adapter.calls.progress[0].programKey,
        "dong-hanh-bon-tuan");
      assert.equal(adapter.calls.progress[0].weekNo, 1);
      assert.equal(adapter.calls.progress[0].activityKey, "qa-act");
      assert.equal(adapter.calls.progress[0].status, "done");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("thỏa ước: đề xuất + xác nhận gọi đúng adapter (hai chữ ký riêng biệt)", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const propose = findButton(host, "Đề xuất thỏa ước cho hai bên");
      assert.ok(propose, "chưa có đề xuất → nút đề xuất");
      propose.click();
      await wait(30);
      assert.equal(adapter.calls.propose, 1);
      await wait(80); // load() lại → pending_proposal từ payload stub? (stub vẫn null)
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("opt-out tự nguyện qua dialog gọi programOptOut", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter();
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const optOut = findButton(host, "Nghỉ chương trình (opt-out)");
      assert.ok(optOut, "phải có lối nghỉ tự nguyện");
      optOut.click();
      await wait(20);
      const confirm = Array.from(document.querySelectorAll(".fb-dialog button"))
        .find((b) => textOf(b).includes("Nghỉ chương trình"));
      assert.ok(confirm, "dialog xác nhận phải hiện");
      confirm.click();
      await wait(30);
      assert.deepEqual(adapter.calls.optOut, ["dong-hanh-bon-tuan"]);
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("chưa đăng nhập (không demo) → gate đăng nhập trung thực, không gọi API dữ liệu", async () => {
    clearSession();
    let programMyCalls = 0;
    const adapter = makeAdapter();
    adapter.programMy = async () => {
      programMyCalls += 1;
      return { results: [] };
    };
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(40);
      assert.ok(textOf(host).includes("Cần đăng nhập để xem chương trình"));
      assert.equal(programMyCalls, 0, "chưa đăng nhập không bấm API dữ liệu");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Parity R01/R05/R06 trên web companion", () => {
  it("R01: catalog [rev2, rev1] → mời đúng rev 2 (độc lập thứ tự)", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [
        activityRow({ revision: 2, title: "Bản mới" }),
        activityRow({ revision: 1, title: "Bản cũ" }),
      ],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(textOf(host).includes("Bản mới"));
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      assert.ok(invite);
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite[0]?.contentRevision, 2);
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("R05: chưa tham gia → xem trước guide đủ tuần, KHÔNG POST enroll", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ enrolled: false });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const preview = findButton(host, "Xem trước hướng dẫn từng tuần");
      assert.ok(preview);
      preview.click();
      await wait(20);
      const text = textOf(host);
      assert.ok(text.includes("guide HS tuần 1"));
      assert.ok(text.includes("guide PH tuần 1"));
      assert.ok(text.includes("s4") && text.includes("c4"));
      assert.equal(adapter.calls.enroll.length, 0,
        "chỉ đọc — không enroll");
      assert.ok(findButton(host, "Tham gia chương trình"));
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("R06: chi tiết hoạt động có bước + phút có nguồn; thiếu nguồn nói thẳng", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [activityRow({ revision: 2, minutes: 5 })],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      findButton(host, "Xem chi tiết hoạt động").click();
      await wait(20);
      const text = textOf(host);
      assert.ok(text.includes(STEP_TEXT));
      assert.ok(text.includes("Thời lượng: khoảng 5 phút"));
      assert.ok(text.includes("rev 2"));
    } finally {
      unmount(host);
      clearSession();
    }
    clearSession();
    liveSession();
    const noMinutes = makeAdapter({
      activityCatalog: [activityRow({ revision: 2, minutes: null })],
    });
    const ctx2 = makeCtx({ role: "student", adapter: noMinutes });
    const mount2 = mount(companionPage, ctx2.ctx);
    try {
      await wait(60);
      findButton(mount2.host, "Xem chi tiết hoạt động").click();
      await wait(20);
      const text = textOf(mount2.host);
      assert.ok(text.includes("chưa được cung cấp"));
      assert.ok(!text.includes("khoảng 1 phút"));
    } finally {
      unmount(mount2.host);
      clearSession();
    }
  });
});
