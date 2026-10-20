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

/** Adapter stub web theo đúng surface trang dùng; ghi lại mọi mutation.
 * Tùy chọn lỗi/delay dùng cho test R04 (mutation trung thực) — null = thành công. */
function makeAdapter({
  enrolled = true,
  activityCatalog = [],
  programCatalog = PROGRAM_CATALOG,
  invites = [],
  otherPartyId = "user-peer",
  agreementPayload = null,
  programMyError = null,
  progressError = null,
  progressDelayMs = 0,
  proposeError = null,
} = {}) {
  const calls = { enroll: [], invite: [], progress: [], confirm: [],
    propose: 0, optOut: [], respond: [], withdraw: [] };
  const wait = (ms) => new Promise(
    (resolve) => setTimeout(resolve, Math.max(0, ms)));
  let progressErrorOnce = progressError;
  return {
    calls,
    mode: "web",
    async programMy() {
      if (programMyError) throw programMyError;
      return { results: enrolled ? [{ ...ENROLLMENT }] : [] };
    },
    async programCatalog() {
      return { results: programCatalog };
    },
    async programWeeks() {
      return WEEKS_PAYLOAD;
    },
    async programAgreement() {
      if (agreementPayload) return agreementPayload;
      return { agreement: null, agreement_template: WEEKS_PAYLOAD.agreement,
        other_party_id: otherPartyId, connection_generation: 1 };
    },
    async activitiesInvites() {
      return { results: invites };
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
      // Ghi call NGAY khi được gọi (đếm bấm lặp chuẩn xác), lỗi chỉ 1 lần
      // để test "thử lại chủ động" thấy call thứ hai thành công.
      calls.progress.push(payload);
      if (progressDelayMs) await wait(progressDelayMs);
      if (progressErrorOnce) {
        const err = progressErrorOnce;
        progressErrorOnce = null;
        throw err;
      }
      return { ...payload };
    },
    async programAgreementPropose(key) {
      calls.propose += 1;
      if (proposeError) throw proposeError;
      return { agreement_id: "ag-1", status: "proposed", my_confirmed: false,
        proposed_by_me: true, commitments: ["cam kết A"] };
    },
    async programAgreementConfirm(id) {
      calls.confirm.push(id);
      return { agreement_id: id, status: "confirmed", my_confirmed: true };
    },
    async programAgreementWithdraw(id) {
      calls.withdraw.push(id);
      return { agreement_id: id || "ag-1", status: "withdrawn" };
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

  it("R06 web: chi tiết hoạt động có bước + phút có nguồn; thiếu nguồn nói thẳng", async () => {
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

/* ---------- Parity bổ sung với zalo-mini-app/tests/companion-qa-20261019 ---------- */

describe("Parity R01 web — thứ tự catalog + chặn draft/retired", () => {
  it("thứ tự đảo [rev1, rev2] → vẫn mời rev 2 (độc lập thứ tự rows)", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [
        activityRow({ revision: 1, title: "Bản cũ" }),
        activityRow({ revision: 2, title: "Bản mới" }),
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

  it("draft/retired revision cao hơn không bao giờ được mời", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [
        activityRow({ revision: 2, title: "Bản publish" }),
        activityRow({ revision: 5, title: "Bản nháp", status: "draft" }),
        activityRow({ revision: 4, title: "Bản retired", status: "retired" }),
      ],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(textOf(host).includes("Bản publish"));
      assert.ok(!textOf(host).includes("Bản nháp"),
        "draft không được dùng làm nội dung mời");
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite[0]?.contentRevision, 2,
        "chỉ revision published mới nhất được mời");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("chưa kết nối (other_party_id null) → nút mời KHÓA kèm lý do trung thực", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ otherPartyId: null });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      assert.ok(invite, "nút mời vẫn render");
      assert.equal(invite.disabled, true, "phải khóa khi chưa có người đồng hành");
      assert.ok(String(invite.title).includes("Cần kết nối"),
        "lý do khóa phải trung thực");
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite.length, 0,
        "không gọi mời khi chưa kết nối");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Parity R06 web — body chuỗi JSON và body hỏng render an toàn", () => {
  it("body dạng chuỗi JSON (adapter cũ) được parse, không render chuỗi thô", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [activityRow({
        revision: 2, minutes: 3,
        body: JSON.stringify({ steps: [STEP_TEXT] }),
      })],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      findButton(host, "Xem chi tiết hoạt động").click();
      await wait(20);
      assert.ok(textOf(host).includes(STEP_TEXT),
        "body chuỗi JSON phải được parse và render");
      assert.ok(!textOf(host).includes('{"steps"'),
        "không render chuỗi JSON thô");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("body JSON hỏng → thông điệp trung thực 'chưa có mô tả từng bước', không crash", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [activityRow({
        revision: 2, minutes: 3, body: "không phải json {",
      })],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      findButton(host, "Xem chi tiết hoạt động").click();
      await wait(20);
      const text = textOf(host);
      assert.ok(text.includes("chưa có mô tả từng bước"),
        "lỗi parse phải thành thông điệp trung thực");
      assert.ok(!text.includes("không phải json"),
        "không render repr thô của body lỗi");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("Luồng US-036/US-044 web — enroll/respond/withdraw/confirm qua dialog", () => {
  it("tham gia: nút chỉ mở dialog — POST enroll CHỈ khi xác nhận, đúng key/revision", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ enrolled: false });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const join = findButton(host, "Tham gia chương trình");
      assert.ok(join);
      join.click();
      await wait(20);
      assert.equal(adapter.calls.enroll.length, 0,
        "chưa xác nhận → chưa POST enroll");
      const dialogJoin = Array.from(document.querySelectorAll(".fb-dialog button"))
        .find((b) => textOf(b) === "Tham gia");
      assert.ok(dialogJoin, "dialog xác nhận phải hiện nút Tham gia");
      dialogJoin.click();
      await wait(30);
      assert.equal(adapter.calls.enroll.length, 1);
      assert.equal(adapter.calls.enroll[0].programKey, "dong-hanh-bon-tuan");
      assert.equal(adapter.calls.enroll[0].programRevision, 2,
        "enroll pin đúng revision đã xem trước");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("lời mời nhận: Chấp nhận/Từ chối gọi activitiesRespond đúng invite_id/decision", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [activityRow({ revision: 2 })],
      invites: [{
        invite_id: "inv-recv-9", content_key: "qa-act", direction: "received",
        status: "pending",
      }],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const accept = findButton(host, "Chấp nhận cùng làm");
      const decline = findButton(host, "Từ chối");
      assert.ok(accept && decline, "lời mời nhận phải có hai nút phản hồi");
      assert.ok(!findButton(host, "Mời cùng làm hoạt động này"),
        "có lời mời nhận thì không hiện nút mời trùng");
      decline.click();
      await wait(30);
      assert.deepEqual(adapter.calls.respond, [["inv-recv-9", "decline"]]);
      accept.click();
      await wait(30);
      assert.deepEqual(adapter.calls.respond,
        [["inv-recv-9", "decline"], ["inv-recv-9", "accept"]]);
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("thỏa ước pending do mình đề xuất: rút được đề xuất qua withdraw", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      agreementPayload: {
        agreement: null,
        agreement_template: WEEKS_PAYLOAD.agreement,
        effective_agreement: null,
        pending_proposal: {
          agreement_id: "ag-pend-1", status: "proposed",
          agreement_revision: 1, my_confirmed: false, proposed_by_me: true,
          commitments: ["cam kết A"],
        },
        other_party_id: "user-peer",
      },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const withdraw = findButton(host, "Rút đề xuất");
      assert.ok(withdraw, "proposer phải có lối rút đề xuất");
      const confirmBtn = findButton(host, "Tôi xác nhận thỏa ước này");
      assert.ok(confirmBtn, "người đề xuất cũng tự xác nhận được bản của mình");
      withdraw.click();
      await wait(30);
      assert.deepEqual(adapter.calls.withdraw, ["ag-pend-1"]);
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("xác nhận thỏa ước qua dialog → programAgreementConfirm đúng agreement_id", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      agreementPayload: {
        agreement: null,
        agreement_template: WEEKS_PAYLOAD.agreement,
        effective_agreement: null,
        pending_proposal: {
          agreement_id: "ag-pend-2", status: "proposed",
          agreement_revision: 1, my_confirmed: false, proposed_by_me: false,
          commitments: ["cam kết A"],
        },
        other_party_id: "user-peer",
      },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      assert.ok(!findButton(host, "Rút đề xuất"),
        "không phải proposer không có nút rút đề xuất");
      findButton(host, "Tôi xác nhận thỏa ước này").click();
      await wait(20);
      const dialogConfirm = Array.from(document.querySelectorAll(".fb-dialog button"))
        .find((b) => textOf(b) === "Tôi xác nhận");
      assert.ok(dialogConfirm, "dialog xác nhận thỏa ước phải hiện");
      assert.equal(adapter.calls.confirm.length, 0,
        "chưa bấm trong dialog → chưa POST confirm");
      dialogConfirm.click();
      await wait(30);
      assert.deepEqual(adapter.calls.confirm, ["ag-pend-2"]);
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("QA 19/10 R04 web — mutation trung thực (lỗi thật, không tự retry)", () => {
  it("lỗi mạng khi ghi tiến độ → note lỗi thật, nút bật lại để THỬ LẠI CHỦ ĐỘNG", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      progressError: { status: 0, kind: "network" },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const done = findButton(host, "Tôi đã làm");
      done.click();
      await wait(30);
      const note = host.querySelector("[data-companion-note]");
      assert.ok(note, "phải có vùng trạng thái chung cho mutation");
      assert.ok(note.textContent.includes("mất kết nối mạng"),
        `note phải nói lỗi mạng thật, nhưng là: ${note.textContent}`);
      assert.equal(done.disabled, false, "nút bật lại cho thử lại chủ động");
      done.click();
      await wait(30);
      assert.equal(adapter.calls.progress.length, 2,
        "thử lại do NGƯỜI DÙNG chủ động bấm — không tự retry");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("đang gửi: nút khóa, bấm lặp chỉ tạo 1 call", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ progressDelayMs: 60 });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const done = findButton(host, "Tôi đã làm");
      done.click();
      await wait(10);
      assert.equal(done.disabled, true, "đang gửi phải khóa nút");
      const note = host.querySelector("[data-companion-note]");
      assert.ok(note && note.textContent.includes("Đang ghi tiến độ của bạn…"),
        "note thể hiện đang gửi");
      done.click();
      done.click();
      await wait(120);
      assert.equal(adapter.calls.progress.length, 1,
        "bấm lặp khi đang gửi chỉ được 1 call");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("propose bị chặn agreement_revision_outdated → note đúng lý do, không fake thành công", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      proposeError: {
        status: 400, details: { reason: "agreement_revision_outdated" },
      },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      findButton(host, "Đề xuất thỏa ước cho hai bên").click();
      await wait(30);
      const note = host.querySelector("[data-companion-note]");
      assert.ok(note);
      assert.ok(note.textContent.includes("đã có bản hiệu lực mới hơn"),
        `lý do phải từ máy chủ, nhưng là: ${note.textContent}`);
      assert.ok(note.textContent.includes("Bạn chủ động thử lại"),
        "không tự retry — người dùng chủ động");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("programMy lỗi mạng → ErrorState 'Không tải được chương trình' + Thử lại, không mock fallback", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      programMyError: { status: 0, kind: "network" },
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const text = textOf(host);
      assert.ok(text.includes("Không tải được chương trình"),
        `phải là error state trung thực, nhưng thấy: ${text}`);
      assert.ok(findButton(host, "Thử lại"));
      assert.ok(!text.includes("Tuần web riêng từ máy chủ"),
        "không được render dữ liệu giả khi API lỗi");
      assert.ok(!text.includes("Dữ liệu minh họa"),
        "không tự chuyển sang dữ liệu minh họa");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

/* ---------------- Bài đọc 1 phút (micro_lesson — chỉ ĐỌC) ----------------
 * stitch-ui-3: mục đọc nhanh trên /companion, tải qua activitiesCatalog
 * ({kind:"micro_lesson"}) của adapter CÓ SẴN, lọc client theo {role, neutral},
 * KHÔNG đụng lời mời/tiến độ/joint_activity_keys, KHÔNG ghi gì lên máy chủ. */

const LESSON_STUDENT = {
  content_key: "doc-student-1", kind: "micro_lesson", revision: 1,
  title: "Một phút gọi tên cảm xúc", audience: "student",
  status: "published", minutes: 1,
  body: {
    goal: "Gọi tên cảm xúc hiện tại của bạn",
    steps: ["Dừng lại một nhịp thở", "Gọi tên cảm giác bạn đang có"],
    share: "Chỉ bạn thấy — không tự gửi cho ai",
  },
};

const LESSON_NEUTRAL = {
  content_key: "doc-neutral-1", kind: "micro_lesson", revision: 1,
  title: "Một phút thở chậm cho cả nhà", audience: "neutral",
  status: "published", minutes: 1,
  body: { goal: "Thở chậm cùng nhau", steps: ["Hít 4 nhịp", "Thở ra 6 nhịp"] },
};

const LESSON_CAREGIVER = {
  content_key: "doc-caregiver-1", kind: "micro_lesson", revision: 1,
  title: "Một phút lắng nghe không phán xét", audience: "caregiver",
  status: "published", minutes: 1,
  body: { goal: "Nghe trước khi góp ý", steps: ["Im lặng 60 giây"] },
};

const LESSON_JOINT = {
  content_key: "doc-joint-1", kind: "micro_lesson", revision: 1,
  title: "Bài đọc chung hai người (không được hiện)", audience: "joint",
  status: "published", minutes: 1,
  body: { goal: "G", steps: ["S"] },
};

/** Adapter cho mục bài đọc: ghi lại MỌI call catalog kind=micro_lesson để
 * kiểm tra trang KHÔNG truyền audience và KHÔNG kèm mutation nào. */
function makeLessonsAdapter({ lessons = [], activityRows = [], failFirst = false } = {}) {
  const adapter = makeAdapter({ enrolled: true, activityCatalog: activityRows });
  const lessonsCalls = [];
  let failed = false;
  adapter.activitiesCatalog = async (params = {}) => {
    if (params && params.kind === "micro_lesson") {
      lessonsCalls.push({ ...params });
      if (failFirst && !failed) {
        failed = true;
        throw { status: 0, kind: "network" };
      }
      return { results: lessons };
    }
    return { results: activityRows };
  };
  adapter.lessonsCalls = lessonsCalls;
  return adapter;
}

describe("Bài đọc 1 phút (stitch-ui-3) — chỉ ĐỌC qua activitiesCatalog", () => {
  it("render từ máy chủ + lọc {role, neutral}; KHÔNG truyền audience; không mutation", async () => {
    clearSession();
    liveSession();
    const adapter = makeLessonsAdapter({
      lessons: [LESSON_STUDENT, LESSON_NEUTRAL, LESSON_CAREGIVER, LESSON_JOINT],
      activityRows: [activityRow({ revision: 2 })],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(80);
      const text = textOf(host);
      assert.ok(text.includes("Bài đọc 1 phút"), "thiếu section Bài đọc 1 phút");
      assert.ok(text.includes("Một phút gọi tên cảm xúc"),
        "bài đọc audience=student phải hiện với role student");
      assert.ok(text.includes("Một phút thở chậm cho cả nhà"),
        "bài đọc audience=neutral phải hiện với mọi vai trò");
      assert.ok(text.includes("khoảng 1 phút"),
        "minutes=1 phải hiển thị 'khoảng 1 phút' (có nguồn)");
      assert.ok(!text.includes("Một phút lắng nghe không phán xét"),
        "bài đọc caregiver KHÔNG hiện cho student");
      assert.ok(!text.includes("Bài đọc chung hai người (không được hiện)"),
        "bài đọc audience=joint KHÔNG hiện (không phải hoạt động chung)");
      assert.deepEqual(adapter.lessonsCalls, [{ kind: "micro_lesson" }],
        "chỉ được gọi catalog kind=micro_lesson, KHÔNG truyền audience");
      assert.equal(adapter.calls.invite.length, 0, "đọc bài KHÔNG mời ai");
      assert.equal(adapter.calls.progress.length, 0, "đọc bài KHÔNG ghi tiến độ");
      assert.equal(adapter.calls.enroll.length, 0, "đọc bài KHÔNG ghi danh");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("sheet đọc bài: mục tiêu + các bước đánh số + phạm vi chia sẻ, không ghi gì", async () => {
    clearSession();
    liveSession();
    const adapter = makeLessonsAdapter({ lessons: [LESSON_STUDENT] });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(80);
      const readBtn = findButton(host, "Đọc bài ngắn");
      assert.ok(readBtn, "mỗi bài đọc phải có nút mở bài");
      readBtn.click();
      await wait(20);
      const sheet = document.querySelector(".fb-sheet-root .fb-sheet");
      assert.ok(sheet, "đọc bài phải mở sheet role=dialog");
      assert.equal(sheet.getAttribute("role"), "dialog");
      const sheetText = textOf(sheet);
      assert.ok(sheetText.includes("Một phút gọi tên cảm xúc"),
        "sheet phải có tiêu đề bài đọc");
      assert.ok(sheetText.includes("Mục tiêu: Gọi tên cảm xúc hiện tại của bạn"));
      assert.ok(sheetText.includes("Dừng lại một nhịp thở"),
        "các bước phải render từng dòng");
      assert.ok(sheetText.includes("Phạm vi chia sẻ: Chỉ bạn thấy — không tự gửi cho ai"));
      assert.ok(sheetText.includes("Thời lượng: khoảng 1 phút"),
        "thời lượng phải có nguồn (nội dung đã phát hành)");
      assert.ok(sheetText.includes("không gửi gì lên máy chủ"),
        "phải nói rõ hành động chỉ đọc");
      assert.equal(adapter.calls.invite.length, 0);
      assert.equal(adapter.calls.progress.length, 0);
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("catalog rỗng → empty trung thực; lỗi → thông điệp + Thử lại gọi lại catalog", async () => {
    clearSession();
    liveSession();
    const emptyAdapter = makeLessonsAdapter({ lessons: [] });
    const { ctx } = makeCtx({ role: "student", adapter: emptyAdapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(80);
      assert.ok(textOf(host).includes("Chưa có bài đọc nào được phát hành"),
        "catalog rỗng phải là empty state trung thực");
    } finally {
      unmount(host);
      clearSession();
    }

    clearSession();
    liveSession();
    const errorAdapter = makeLessonsAdapter({
      lessons: [LESSON_STUDENT], failFirst: true,
    });
    const { ctx: ctx2 } = makeCtx({ role: "student", adapter: errorAdapter });
    const { host: host2 } = mount(companionPage, ctx2);
    try {
      await wait(80);
      const section = host2.querySelector("[data-micro-lessons]");
      assert.ok(section, "phải có section bài đọc");
      assert.ok(textOf(section).includes("Chưa tải được danh sách bài đọc"),
        "lỗi phải nói thẳng, không fallback dữ liệu giả");
      assert.ok(!textOf(section).includes("Một phút gọi tên cảm xúc"),
        "lỗi thì không được render bài đọc");
      const retry = findButton(section, "Thử lại");
      assert.ok(retry, "phải có nút Thử lại (chủ động)");
      retry.click();
      await wait(40);
      assert.equal(errorAdapter.lessonsCalls.length, 2,
        "Thử lại phải gọi lại catalog đúng 1 lần nữa");
      assert.ok(textOf(section).includes("Một phút gọi tên cảm xúc"),
        "sau khi thử lại thành công, bài đọc phải hiện");
    } finally {
      unmount(host2);
      clearSession();
    }
  });
});
