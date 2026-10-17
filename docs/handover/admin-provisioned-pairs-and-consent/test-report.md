# Báo cáo kiểm thử (trung thực — cập nhật khi có thêm bằng chứng)

## Môi trường đã chạy thật

- Repo: `huyhandsome6996/family-bridge`, nhánh làm việc từ main `4e65b00eb2e40f6075922e5a8914007ac56a550d`.
- Python 3.12 + Django 5.2.18, harness sqlite (`DJANGO_SETTINGS_MODULE=harness.settings`).
- Node 22, `node --test` cho web/zalo/shared.

## A — Admin cấp phát cặp (KẾT QUẢ ĐÃ CHẠY)

| Bộ kiểm | Lệnh | Kết quả |
| --- | --- | --- |
| Suite mới A01–A12 | `python manage.py test family_bridge_features.f16_classroom.tests.test_admin_provision -v 1` (feature-lab) | **19/19 OK** |
| Toàn bộ f16 + admin_core + f01 | `python manage.py test family_bridge_features.f16_classroom family_bridge_features.admin_core family_bridge_features.f01_identity` | **222 OK** (9 skip MySQL-gated) |
| Harness đầy đủ (17 feature + harness + labgrants) | như CI `tests.yml` backend job | **500 OK** (9 skip) |
| Backend wiring | `manage.py makemigrations --check --dry-run` + `manage.py test` (backend/) | sạch + **50 OK** |
| Web | `npm test` (web/) | **220/220 OK** (route 22) |
| Shared | `node --test packages/family_bridge_shared/tests/*.test.mjs` | **34/34 OK** (ADAPTER_METHODS 74) |
| Boundary | `node scripts/check_import_boundaries.mjs` | **SẠCH exit 0** |
| Web build | `npm run build` (web/) | OK, có chunk `admin-provision` |
| Mini app | `npm test` (zalo-mini-app/) | **297/297 OK** |
| Docs | `python scripts/check_agent_docs.py` | **OK** (23 CAP, 25 WF, 24 DEC) |

Case map (chi tiết ở `docs/features/f16/test.md` mục suite
`test_admin_provision`): A01 tạo connection trước login; A02/A12 round-trip
API + hai phía thấy nhau; A03 idempotent; A04 end-user 404; A05 scope thật
(403 out-of-scope, chỉ thấy lớp trong scope); A06 lỗi hàng không ghi gì;
A08 giữ nguyên mật khẩu đã đổi; A09 revoked không hồi sinh + reconnect chủ
ý → generation 2; A10 không tạo consent/share; A11 backfill
inventory/apply/idempotent/blocked; scope school chỉ khớp đúng class_ref.

## B — Consent theo Stitch (nhánh `codex/consent-stitch-responsive`)

Đã làm + ĐÃ KIỂM (nhánh `codex/consent-stitch-responsive`, PR riêng vì web
có người khác đang làm): màn consent mới cho web + mini (1 bản port
byte-identical, responsive 5/7 ↔ 1 cột), giữ contract `f01-consent` +
`#fb-consent-<purpose>` + không-precheck + snapshot/stale-guard; bỏ QA
panel, alert/setTimeout, Tailwind CDN, "Mã hóa bảo vệ gia đình", breadcrumb
giả; thêm dialog chi tiết thật; copy trung thực.

| Bộ kiểm | Lệnh | Kết quả |
| --- | --- | --- |
| Consent Stitch bất biến (mới) | `node --test tests/consent-stitch.test.mjs` (web + mini) | **6/6 OK cả hai** |
| Web đầy đủ + build | `npm test` + `npm run build` (web/) | **226/226 OK** + build xanh |
| Mini đầy đủ + build + manifest | `npm test` + `npm run build` (zalo-mini-app/) | **303/303 OK** + verify manifest (1 sync + 36 async chunk + 1 css) |
| Suite consent cũ (không precheck/restore/submit/lỗi) | trong `zalo-mini-app/tests/f01-flows.test.mjs` | PASS (thuộc 303) |

Chi tiết chỉnh sửa từng mục: `stitch-deviations.md`.

## NOT_RUN / BLOCKED (trung thực)

- **MySQL/TiDB thật**: race + migrate trên TiDB production chưa chạy
  (không có DB credentials trong môi trường agent). Suite MySQL-gated bị
  skip đúng cơ chế (9 skip). Cần owner chạy migrate + backfill theo runbook.
- **Chuyển đổi 50 cặp trên DB production**: CHƯA thực hiện được vì agent
  không truy cập được TiDB/Render DB (đã xác nhận không có DATABASE_URL
  production trong môi trường; DATABASE_URL cục bộ chỉ là sqlite file cũ).
  Toàn bộ công cụ đã sẵn sàng: lệnh `backfill_class_pairs` (dry-run/apply,
  idempotent) + web `#/admin-provision` thẻ chuyển đổi. Bằng chứng end-to-end
  đã chạy trên dữ liệu cục bộ: 50 cặp synthetic → 50 active, rerun không
  nhân đôi (test A11 + fixtures). Chờ owner chạy lệnh hoặc cấp quyền DB.
- **Thiết bị Zalo thật** (Mini App release Testing): NOT_RUN — cần owner
  release; bundle mini đã build + verify manifest thành công cục bộ.
- **Ảnh chụp màn hình thật trên máy chủ preview**: xem `huy-test.md` —
  preview cục bộ cần owner mở (agent headless không chụp được bản có API
  thật nếu không chạy backend cùng lúc; hướng dẫn kèm).

## Ngân sách/hạn chế đã ghi trong commit (DSA)

- rows ≤ 50/đợt; body ≤ 64 KiB; tên ≤ 80; external_ref ≤ 128; trang classes
  query gộp (không N+1); danh sách eligible_pairs không giới hạn tổng nhưng
  trả kèm số đếm và web chỉ render 10 dòng đầu; audit 1 event/đợt.
