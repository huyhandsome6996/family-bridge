// f02_e2e_flow.mjs — E2E API chương trình "Đồng hành bốn tuần" (Phần B)
// trên backend local (sqlite, wiring production thật: apps.ready() đăng ký
// provider B16 + connection reader F01).
// Luồng: login HS/PH → consent → connect (F16 hai bước) → seed + publish nội
// dung (bài kiểm tra mô phỏng admin) → catalog/enroll cả hai → weeks (mọi
// tuần mở) → progress riêng → thỏa ước tuần 4 hai bên cùng revision →
// confirmed; withdraw pair C; F09 invite hai chiều.
// Chạy: node scripts/f02_e2e_flow.mjs <outdir>  (env FB_E2E_CLASS_PASSWORD)
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] || "/home/z/my-project/tool-results/f02-e2e";
const BASE = "http://127.0.0.1:8002/api/v1";
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
    `status=${r.status}`);
  return r.data.token;
}

async function consent(token, label) {
  const r = await api("/consents", { method: "POST", token,
    body: { purpose: "service", policy_version: "service-v1",
      decision: "accepted" } });
  check(`consent ${label}`, r.status === 201 || r.status === 200,
    `status=${r.status}`);
}

const hs = await login("HS901");
const ph = await login("PH901");
const hsC = await login("HS903");
const phC = await login("PH903");
await consent(hs, "HS901");
await consent(ph, "PH901");
await consent(hsC, "HS903");
await consent(phC, "PH903");

// ---- Kết nối hai cặp qua F16 (điều kiện của thỏa ước + F09) ----
for (const [tokA, tokB] of [[hs, ph], [hsC, phC]]) {
  let r = await api("/classroom/proposals", { token: tokA });
  const p = r.data.results[0];
  check("proposal tồn tại cho cặp", p && p.status === "proposed",
    JSON.stringify(r.data).slice(0, 120));
  r = await api(`/classroom/proposals/${p.proposal_id}/confirm`,
    { method: "POST", token: tokA, body: {} });
  check("HS xác nhận bước 1", r.status === 200
    && r.data.status === "awaiting_confirmation", JSON.stringify(r.data).slice(0, 120));
  r = await api(`/classroom/proposals/${p.proposal_id}/confirm`,
    { method: "POST", token: tokB, body: {} });
  check("PH xác nhận bước 2 → connected", r.status === 200
    && r.data.status === "connected", JSON.stringify(r.data).slice(0, 120));
}

// ---- Nội dung đã publish (seed chạy trước trong bash; publishing mô phỏng admin có caps) ----
let r = await api("/program/catalog", { token: hs });
check("catalog trả chương trình đã publish (wiring production)", r.status === 200
  && Array.isArray(r.data.results) && r.data.results.length === 1
  && r.data.results[0].program_key === "dong-hanh-bon-tuan"
  && r.data.results[0].weeks.length === 4,
  JSON.stringify(r.data).slice(0, 200));
const program = r.data.results[0];
check("agreement template trong catalog", program.agreement.revision === 1
  && program.agreement.commitments.length >= 1, JSON.stringify(program.agreement));

// ---- Enroll tự nguyện cả hai (pin revision) ----
r = await api("/program/enroll", { method: "POST", token: hs,
  body: { program_key: "dong-hanh-bon-tuan", program_revision: program.revision } });
check("HS enroll 201", r.status === 201, JSON.stringify(r.data).slice(0, 120));
r = await api("/program/enroll", { method: "POST", token: ph,
  body: { program_key: "dong-hanh-bon-tuan", program_revision: program.revision } });
check("PH enroll 201", r.status === 201, JSON.stringify(r.data).slice(0, 120));
r = await api("/program/my", { token: hs });
check("program/my có enrollment active", r.data.results.some(
  (row) => row.program_key === "dong-hanh-bon-tuan" && row.active),
  JSON.stringify(r.data).slice(0, 160));

// ---- Weeks: mọi tuần mở, guide theo vai, không khóa ----
r = await api("/program/weeks/dong-hanh-bon-tuan", { token: hs });
check("HS weeks 200 đủ 4 tuần + locked=false", r.status === 200
  && r.data.weeks.length === 4 && r.data.weeks.every((w) => w.locked === false),
  JSON.stringify(r.data).slice(0, 200));
check("HS guide tuần 1 là student_guide", r.data.weeks[0].student_guide
  && r.data.weeks[0].student_guide !== r.data.weeks[0].caregiver_guide, "guide khác nhau");
r = await api("/program/weeks/dong-hanh-bon-tuan", { token: ph });
check("PH guide tuần 1 là caregiver_guide", r.data.weeks[0].caregiver_guide.length > 0,
  "có guide PH");
check("paper note trả về", (r.data.note_paper_guide || "").includes("sổ giấy"),
  r.data.note_paper_guide);

// ---- Tiến độ riêng ----
r = await api("/program/progress", { method: "POST", token: hs,
  body: { program_key: "dong-hanh-bon-tuan", week_no: 1,
    activity_key: "f09-w1-tieng-long-chua-noi", status: "done" } });
check("HS mark done 201 + program_revision=1", r.status === 201
  && r.data.status === "done" && r.data.program_revision === 1,
  JSON.stringify(r.data).slice(0, 160));
r = await api("/program/progress", { method: "POST", token: ph,
  body: { program_key: "dong-hanh-bon-tuan", week_no: 1,
    activity_key: "f09-w1-tieng-long-chua-noi", status: "skipped" } });
check("PH mark skipped (tiến độ hai người độc lập)", r.status === 201
  && r.data.status === "skipped", JSON.stringify(r.data).slice(0, 160));
r = await api("/program/weeks/dong-hanh-bon-tuan", { token: hs });
check("HS thấy tiến độ của HS (done), không thấy của PH",
  r.data.weeks[0].activities[0].status === "done",
  JSON.stringify(r.data.weeks[0].activities));
r = await api("/program/weeks/dong-hanh-bon-tuan", { token: ph });
check("PH thấy tiến độ của PH (skipped)", r.data.weeks[0].activities[0].status === "skipped",
  JSON.stringify(r.data.weeks[0].activities));

// ---- F09 lời mời hoạt động chung hai chiều ----
r = await api("/connections", { token: hs });
const peerId = r.data.results[0].other_party_id;
check("HS có kết nối active + other_party_id", Boolean(peerId),
  JSON.stringify(r.data).slice(0, 160));
r = await api("/activities/invites", { method: "POST", token: hs,
  body: { content_key: "f09-w1-tieng-long-chua-noi", content_revision: 1,
    invitee_id: peerId } });
check("HS mời PH cùng làm 201 pending", r.status === 201
  && r.data.status === "pending" && r.data.direction === "sent",
  JSON.stringify(r.data).slice(0, 160));
const inviteId = r.data.invite_id;
r = await api("/activities/invites", { token: ph });
check("PH thấy lời mời received", r.data.results.some(
  (row) => row.invite_id === inviteId && row.direction === "received"),
  JSON.stringify(r.data).slice(0, 200));
r = await api(`/activities/invites/${inviteId}/respond`, { method: "POST",
  token: ph, body: { decision: "accept" } });
check("PH accept lời mời", r.status === 200 && r.data.status === "accepted",
  JSON.stringify(r.data).slice(0, 160));

// ---- Thỏa ước tuần 4: hai bên cùng revision mới confirmed ----
r = await api("/program/agreement?program_key=dong-hanh-bon-tuan", { token: hs });
check("overview ban đầu agreement null + template", r.status === 200
  && r.data.agreement === null && r.data.agreement_template.revision === 1,
  JSON.stringify(r.data).slice(0, 200));
r = await api("/program/agreement/propose", { method: "POST", token: hs,
  body: { program_key: "dong-hanh-bon-tuan" } });
check("HS propose 201 proposed", r.status === 201
  && r.data.status === "proposed" && r.data.proposed_by_me,
  JSON.stringify(r.data).slice(0, 200));
const agreementId = r.data.agreement_id;
r = await api("/program/agreement?program_key=dong-hanh-bon-tuan", { token: ph });
check("PH overview thấy proposed, chưa confirm ai",
  r.data.agreement.status === "proposed"
  && !r.data.agreement.my_confirmed && !r.data.agreement.counterpart_confirmed,
  JSON.stringify(r.data.agreement));
// PH xác nhận trước (khác thứ tự vẫn được), HS xác nhận sau
r = await api(`/program/agreement/${agreementId}/confirm`, { method: "POST",
  token: ph, body: {} });
check("PH xác nhận (vẫn proposed)", r.status === 200
  && r.data.my_confirmed === true && r.data.status === "proposed",
  JSON.stringify(r.data).slice(0, 160));
r = await api(`/program/agreement/${agreementId}/confirm`, { method: "POST",
  token: hs, body: {} });
check("HS xác nhận → confirmed", r.status === 200
  && r.data.status === "confirmed" && r.data.my_confirmed
  && r.data.counterpart_confirmed, JSON.stringify(r.data).slice(0, 200));
r = await api(`/program/agreement/${agreementId}/confirm`, { method: "POST",
  token: hs, body: {} });
check("confirm lần 3 → agreement_not_confirmable", r.status === 400
  && r.data.error.details.reason === "agreement_not_confirmable",
  JSON.stringify(r.data).slice(0, 160));

// ---- Pair C: rút đề xuất (chỉ proposer), người kia không xác nhận hộ ----
r = await api("/program/enroll", { method: "POST", token: hsC,
  body: { program_key: "dong-hanh-bon-tuan", program_revision: program.revision } });
check("pair C HS enroll 201", r.status === 201, JSON.stringify(r.data).slice(0, 120));
r = await api("/program/enroll", { method: "POST", token: phC,
  body: { program_key: "dong-hanh-bon-tuan", program_revision: program.revision } });
check("pair C PH enroll 201", r.status === 201, JSON.stringify(r.data).slice(0, 120));
r = await api("/program/agreement/propose", { method: "POST", token: hsC,
  body: { program_key: "dong-hanh-bon-tuan" } });
check("pair C propose 201", r.status === 201, JSON.stringify(r.data).slice(0, 120));
const agC = r.data.agreement_id;
r = await api(`/program/agreement/${agC}/withdraw`, { method: "POST",
  token: phC, body: {} });
check("PH không rút được đề xuất của HS", r.status === 400
  && r.data.error.details.reason === "only_proposer_can_withdraw",
  JSON.stringify(r.data).slice(0, 160));
r = await api(`/program/agreement/${agC}/withdraw`, { method: "POST",
  token: hsC, body: {} });
check("HS rút được → withdrawn", r.status === 200
  && r.data.status === "withdrawn", JSON.stringify(r.data).slice(0, 160));

// ---- Opt-out tự nguyện (pair C HS) ----
r = await api("/program/opt-out", { method: "POST", token: hsC,
  body: { program_key: "dong-hanh-bon-tuan" } });
check("opt-out 200 active=false", r.status === 200 && r.data.active === false,
  JSON.stringify(r.data).slice(0, 120));
r = await api("/program/weeks/dong-hanh-bon-tuan", { token: hsC });
check("sau opt-out weeks 404 enrollment_not_found (trung thực)", r.status === 404,
  `status=${r.status}`);

const passed = results.filter((x) => x.ok).length;
writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 1));
console.log(`E2E PASS ${passed}/${results.length} checks`);
