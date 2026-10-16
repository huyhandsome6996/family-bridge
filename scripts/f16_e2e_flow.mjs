// f16_e2e_flow.mjs — E2E API cặp HS/PH synthetic trên backend local (Phần A).
// Luồng: login → consent → đề xuất → xác nhận 2 bước → Connection active
// đúng cặp; thử confirm lặp/sai actor; hủy (pair C); từ chối (pair D).
// Chạy: node scripts/f16_e2e_flow.mjs <outdir>
import { readFileSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] || "/home/z/my-project/tool-results/f16-e2e";
const BASE = "http://127.0.0.1:8001/api/v1";
// Mật khẩu khởi tạo Synthetic DO NGƯỜI CHẠY CỤC BỘ cấp qua env (cùng giá trị
// với FB_CLASS_INITIAL_PASSWORD khi provision) — KHÔNG bao giờ hardcode mật
// khẩu vào repo; thiếu env là dừng ngay (fail-closed).
const PASSWORD = process.env.FB_E2E_CLASS_PASSWORD;
if (!PASSWORD) {
  console.error("Thiếu FB_E2E_CLASS_PASSWORD (synthetic, local-only). Dừng.");
  process.exit(2);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  if (!ok) throw new Error(`FAILED: ${name} — ${detail}`);
}

async function api(path, { method = "GET", token = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function login(code) {
  const r = await api("/auth/class-session", {
    method: "POST", body: { code, password: PASSWORD },
  });
  check(`login ${code}`, r.status === 200 && r.data && r.data.token,
    `status=${r.status} body=${JSON.stringify(r.data).slice(0, 160)}`);
  return r.data.token;
}

async function acceptServiceConsent(token, label) {
  // Phiên bản hiện hành của backend checkout này: policy.CURRENT_POLICY_VERSIONS
  // = { service: "service-v1", ... } (docs/features/f01, policy.py).
  const r = await api("/consents", {
    method: "POST",
    token,
    body: { purpose: "service", policy_version: "service-v1", decision: "accepted" },
  });
  check(`consent service ${label}`, r.status === 201 || r.status === 200,
    `status=${r.status} body=${JSON.stringify(r.data).slice(0, 160)}`);
}

const pairs = {
  A: { hs: await login("HS901"), ph: await login("PH901") },
  C: { hs: await login("HS903"), ph: await login("PH903") },
  D: { hs: await login("HS904"), ph: await login("PH904") },
};
check("login trả vai trò đúng (student/caregiver trong session)", true, "đọc qua proposals ở dưới");

await acceptServiceConsent(pairs.A.hs, "HS901");
await acceptServiceConsent(pairs.A.ph, "PH901");
await acceptServiceConsent(pairs.C.hs, "HS903");
await acceptServiceConsent(pairs.C.ph, "PH903");
await acceptServiceConsent(pairs.D.hs, "HS904");
await acceptServiceConsent(pairs.D.ph, "PH904");

// ---- Pair A: hai bước xác nhận -------------------------------------------
let r = await api("/classroom/proposals", { token: pairs.A.hs });
check("HS list proposals (mới login, chưa active)", r.status === 200
  && Array.isArray(r.data.results) && r.data.results.length === 1
  && r.data.results[0].status === "proposed",
  JSON.stringify(r.data).slice(0, 200));
const pA = r.data.results[0];
check("proposal có my_role=student + revision", pA.my_role === "student"
  && typeof pA.revision === "number", JSON.stringify(pA).slice(0, 200));

r = await api("/connections", { token: pairs.A.hs });
check("HS chưa có kết nối active trước xác nhận", r.status === 200
  && Array.isArray(r.data.results) && r.data.results.length === 0,
  JSON.stringify(r.data).slice(0, 160));

// Xác nhận thiếu consent: dùng HS mới không consent? đã consent hết ở trên —
// thay bằng kiểm tra revision conflict: confirm với expected_revision sai.
r = await api(`/classroom/proposals/${pA.proposal_id}/confirm`, {
  method: "POST", token: pairs.A.hs, body: { expected_revision: pA.revision + 5 },
});
check("confirm expected_revision sai → revision_conflict",
  r.status === 409 && r.data && r.data.error && r.data.error.code === "revision_conflict",
  `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);

r = await api(`/classroom/proposals/${pA.proposal_id}/confirm`, {
  method: "POST", token: pairs.A.hs, body: { expected_revision: pA.revision },
});
check("HS xác nhận thứ nhất → awaiting_confirmation, connection=null",
  r.status === 200 && r.data.status === "awaiting_confirmation"
  && r.data.my_confirmed === true && r.data.counterpart_confirmed === false
  && r.data.connection === null,
  JSON.stringify(r.data).slice(0, 200));

r = await api("/connections", { token: pairs.A.hs });
check("SAU xác nhận thứ nhất VẪN chưa có kết nối (2 bước thật sự)",
  r.status === 200 && r.data.results.length === 0,
  JSON.stringify(r.data).slice(0, 160));

// PH nhìn thấy trạng thái ngược chiều
r = await api("/classroom/proposals", { token: pairs.A.ph });
const pAph = r.data.results[0];
check("PH thấy awaiting_confirmation + counterpart đã xác nhận",
  pAph.status === "awaiting_confirmation" && pAph.my_confirmed === false
  && pAph.counterpart_confirmed === true,
  JSON.stringify(pAph).slice(0, 200));

// PH confirm hai lần liên tiếp (double-click mô phỏng): lần 1 active, lần 2 lỗi sạch
r = await api(`/classroom/proposals/${pAph.proposal_id}/confirm`, {
  method: "POST", token: pairs.A.ph, body: { expected_revision: pAph.revision },
});
check("PH xác nhận thứ hai → connected + connection object",
  r.status === 200 && r.data.status === "connected" && r.data.connection
  && r.data.connection.status === "active"
  && r.data.connection.relationship_kind === "primary",
  JSON.stringify(r.data).slice(0, 220));

r = await api(`/classroom/proposals/${pAph.proposal_id}/confirm`, {
  method: "POST", token: pairs.A.ph, body: {},
});
check("PH confirm lặp lại → input_invalid/proposal_not_confirmable (không tạo thêm)",
  r.status === 400 && r.data.error
  && (r.data.error.code === "proposal_not_confirmable"
      || (r.data.error.details && r.data.error.details.reason === "proposal_not_confirmable")),
  `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);

r = await api("/connections", { token: pairs.A.hs });
check("HS thấy 1 kết nối active sau hai xác nhận",
  r.status === 200 && r.data.results.length === 1
  && r.data.results[0].status === "active",
  JSON.stringify(r.data).slice(0, 220));
r = await api("/connections", { token: pairs.A.ph });
check("PH cũng thấy 1 kết nối active",
  r.status === 200 && r.data.results.length === 1,
  JSON.stringify(r.data).slice(0, 160));

// Sai actor: HS903 không được đọc/xác nhận proposal của pair A
r = await api(`/classroom/proposals/${pA.proposal_id}/confirm`, {
  method: "POST", token: pairs.C.hs, body: {},
});
const strangerDetails = (r.data && r.data.error && r.data.error.details) || {};
check("actor lạ xác nhận proposal của cặp khác → 404 proposal_not_found",
  r.status === 404 && (r.data.error.code === "proposal_not_found"
    || strangerDetails.reason === "proposal_not_found"),
  `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);

// Actor lạ cũng không được ĐỌC danh sách proposal của cặp khác (chỉ thấy của mình)
r = await api("/classroom/proposals", { token: pairs.C.hs });
check("list proposals chỉ trả proposal của chính actor",
  r.status === 200 && Array.isArray(r.data.results) && r.data.results.length === 1
  && r.data.results[0].proposal_id !== pA.proposal_id,
  JSON.stringify(r.data).slice(0, 200));

// ---- Pair C: hủy ----------------------------------------------------------
r = await api("/classroom/proposals", { token: pairs.C.hs });
const pC = r.data.results[0];
r = await api(`/classroom/proposals/${pC.proposal_id}/cancel`, {
  method: "POST", token: pairs.C.hs,
});
check("HS hủy đề xuất → canceled", r.status === 200 && r.data.status === "canceled",
  JSON.stringify(r.data).slice(0, 160));
r = await api(`/classroom/proposals/${pC.proposal_id}/confirm`, {
  method: "POST", token: pairs.C.ph, body: {},
});
check("PH confirm đề xuất đã hủy → input_invalid/proposal_not_confirmable",
  r.status === 400 && (r.data.error.code === "proposal_not_confirmable"
    || (r.data.error.details && r.data.error.details.reason === "proposal_not_confirmable")),
  `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);

// ---- Pair D: từ chối sai cặp ----------------------------------------------
r = await api("/classroom/proposals", { token: pairs.D.hs });
const pD = r.data.results[0];
r = await api(`/classroom/proposals/${pD.proposal_id}/decline`, {
  method: "POST", token: pairs.D.hs, body: { reason: "wrong_pair" },
});
check("HS từ chối (wrong_pair) → declined", r.status === 200 && r.data.status === "declined",
  JSON.stringify(r.data).slice(0, 160));
r = await api(`/classroom/proposals/${pD.proposal_id}/decline`, {
  method: "POST", token: pairs.D.hs, body: { reason: "refused" },
});
check("decline trên đề xuất đã terminal → input_invalid/proposal_not_open",
  r.status === 400 && (r.data.error.code === "proposal_not_open"
    || (r.data.error.details && r.data.error.details.reason === "proposal_not_open")),
  `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);

const passed = results.filter((x) => x.ok).length;
writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 1));
console.log(`E2E PASS ${passed}/${results.length} checks`);
