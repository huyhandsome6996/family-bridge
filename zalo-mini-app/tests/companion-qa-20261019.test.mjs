// tests/companion-qa-20261019.test.mjs — regression UI Companion cho vòng QA
// độc lập 19/10/2026 (source c29469b): R01 revision cũ ghi đè bản mới,
// R05 thiếu đọc hướng dẫn trước khi tham gia, R06 thiếu chi tiết hoạt động
// + thời lượng có nguồn. Fail trên c29469b (đã xác minh bằng
// f07-docx/f02/tools/miniapp_repro.test.mjs), phải xanh sau khi sửa.
// Chạy: node --test tests/companion-qa-20261019.test.mjs

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

const STEP_TEXT = "BƯỚC ĐỘC LẬP: mỗi người chuẩn bị một điều chưa nói ra.";

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
      joint_activity_keys: ["qa-act"],
      activities: [{ activity_key: "qa-act", status: "none" }] },
    { week_no: 2, title: "Giảm so sánh", goals: [], student_guide: "s2",
      caregiver_guide: "c2", joint_activity_keys: [], activities: [] },
    { week_no: 3, title: "Ranh giới riêng tư", goals: [], student_guide: "s3",
      caregiver_guide: "c3", joint_activity_keys: [], activities: [] },
    { week_no: 4, title: "Thỏa ước gia đình mới", goals: [],
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

/** Adapter stub theo đúng surface trang dùng; ghi lại mọi mutation. */
function makeAdapter({
  enrolled = true,
  activityCatalog = [],
  programCatalog = PROGRAM_CATALOG,
} = {}) {
  const calls = { enroll: [], invite: [], progress: [], confirm: [] };
  return {
    calls,
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
    async programOptOut() {
      return { active: false };
    },
    async programProgress(payload) {
      calls.progress.push(payload);
      return { ...payload };
    },
    async programAgreementPropose() {
      return { agreement_id: "ag-1", status: "proposed" };
    },
    async programAgreementConfirm(id) {
      calls.confirm.push(id);
      return { agreement_id: id, status: "confirmed" };
    },
    async programAgreementWithdraw() {
      return { agreement_id: "ag-1", status: "withdrawn" };
    },
    async activitiesInvite(payload) {
      calls.invite.push(payload);
      return { invite_id: "inv-1", status: "pending", direction: "sent" };
    },
    async activitiesRespond(id, decision) {
      return { invite_id: id, status: decision };
    },
  };
}

function activityRow({ revision, title = "Hoạt động QA", minutes = 5,
  body = { steps: [STEP_TEXT], goal: "Mục tiêu QA", share: "Chỉ chia sẻ trạng thái done" },
  status = "published" }) {
  const row = { content_key: "qa-act", kind: "activity", revision, title,
    audience: "joint", status };
  if (minutes !== undefined) row.minutes = minutes;
  if (body !== undefined) row.body = body;
  return row;
}

describe("QA 19/10 R01 — revision mới nhất thắng, độc lập thứ tự catalog", () => {
  it("catalog [rev2, rev1] → chip tiêu đề bản MỚI + invite gửi rev 2", async () => {
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
      assert.ok(textOf(host).includes("Bản mới"), "chip phải hiện title rev2");
      assert.ok(!textOf(host).includes("Bản cũ"), "không dùng title rev1");
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      assert.ok(invite);
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite[0]?.contentRevision, 2,
        "phải mời đúng revision published MỚI NHẤT");
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("thứ tự đảo [rev1, rev2] → vẫn rev 2 (không phụ thuộc thứ tự rows)", async () => {
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

  it("draft/retired không bao giờ được chọn dù revision cao hơn", async () => {
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
      assert.ok(!textOf(host).includes("Bản nháp"));
      const invite = findButton(host, "Mời cùng làm hoạt động này");
      invite.click();
      await wait(30);
      assert.equal(adapter.calls.invite[0]?.contentRevision, 2);
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("QA 19/10 R05 — đọc hướng dẫn TRƯỚC khi tham gia, không POST enroll", () => {
  it("chưa tham gia: mở xem trước thấy đủ guide 4 tuần cả hai vai trò", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({ enrolled: false });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const previewBtn = findButton(host, "Xem trước hướng dẫn từng tuần");
      assert.ok(previewBtn, "phải có nút xem trước chỉ-đọc");
      previewBtn.click();
      await wait(20);
      const text = textOf(host);
      assert.ok(text.includes("hướng dẫn HS tuần 1"), "guide HS tuần 1 phải đọc được");
      assert.ok(text.includes("hướng dẫn PH tuần 1"), "guide PH tuần 1 phải đọc được");
      assert.ok(text.includes("s4") && text.includes("c4"),
        "mọi tuần (kể cả tuần 4) phải mở được");
      assert.equal(adapter.calls.enroll.length, 0,
        "chỉ ĐỌC — không được POST enroll");
      assert.ok(findButton(host, "Tham gia chương trình"),
        "tham gia vẫn là thao tác tường minh riêng");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});

describe("QA 19/10 R06 — chi tiết hoạt động + thời lượng có nguồn", () => {
  it("mở chi tiết: thấy mục tiêu, các bước, phạm vi chia sẻ, phút + nguồn rev", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [activityRow({ revision: 2, minutes: 5 })],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const chip = textOf(host);
      assert.ok(chip.includes("khoảng 5 phút"), "chip chỉ hiện phút có nguồn");
      const detailBtn = findButton(host, "Xem chi tiết hoạt động");
      assert.ok(detailBtn, "phải có CTA xem chi tiết hoạt động");
      detailBtn.click();
      await wait(20);
      const text = textOf(host);
      assert.ok(text.includes(STEP_TEXT), "các bước body.steps phải đọc được");
      assert.ok(text.includes("Mục tiêu: Mục tiêu QA"));
      assert.ok(text.includes("Được chia sẻ: Chỉ chia sẻ trạng thái done"));
      assert.ok(text.includes("Thời lượng: khoảng 5 phút"),
        "thời lượng phải kèm nguồn");
      assert.ok(text.includes("rev 2"), "nguồn là revision đã phát hành");
      assert.ok(text.includes("không ai tick hộ ai"));
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("minutes không có nguồn → nói 'chưa được cung cấp', KHÔNG bịa '1 phút'", async () => {
    clearSession();
    liveSession();
    const adapter = makeAdapter({
      activityCatalog: [activityRow({ revision: 2, minutes: null })],
    });
    const { ctx } = makeCtx({ role: "student", adapter });
    const { host } = mount(companionPage, ctx);
    try {
      await wait(60);
      const before = textOf(host);
      assert.ok(!before.includes("khoảng"), "không hiện 'khoảng N phút' bịa");
      findButton(host, "Xem chi tiết hoạt động").click();
      await wait(20);
      const text = textOf(host);
      assert.ok(text.includes("chưa được cung cấp"),
        "phải nói thẳng thời lượng chưa có nguồn");
      assert.ok(!text.includes("khoảng 1 phút"), "không tự bịa mặc định");
      assert.ok(!text.includes("khoảng null"));
    } finally {
      unmount(host);
      clearSession();
    }
  });

  it("body dạng chuỗi JSON (adapter cũ) và dạng dict đều render an toàn", async () => {
    clearSession();
    liveSession();
    const stringBodyAdapter = makeAdapter({
      activityCatalog: [activityRow({
        revision: 2, minutes: 3,
        body: JSON.stringify({ steps: [STEP_TEXT] }),
      })],
    });
    const { ctx } = makeCtx({ role: "student", adapter: stringBodyAdapter });
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
    clearSession();
    liveSession();
    const dictAdapter = makeAdapter({
      activityCatalog: [activityRow({ revision: 2, minutes: 3 })],
    });
    const dictCtx = makeCtx({ role: "student", adapter: dictAdapter });
    const dictHost = mount(companionPage, dictCtx.ctx);
    try {
      await wait(60);
      findButton(dictHost.host, "Xem chi tiết hoạt động").click();
      await wait(20);
      assert.ok(textOf(dictHost.host).includes(STEP_TEXT),
        "body dict (backend thật) render trực tiếp");
    } finally {
      unmount(dictHost.host);
      clearSession();
    }
  });

  it("body JSON hỏng/không đọc được → nói trung thực 'chưa có mô tả', không crash", async () => {
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
      assert.ok(!text.includes("không phải json"), "không render repr thô");
    } finally {
      unmount(host);
      clearSession();
    }
  });
});
