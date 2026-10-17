# Acceptance, traceability và evidence

Các case dưới đây là **expected**, trạng thái runtime mặc định **NOT_RUN**. Không mark US Done hoặc SEC VERIFIED bằng docs checker. [FL/AF](user-flows.md), [states](workflow-state-machines.md), [WF](../engineering/workflow-rules.md), [capabilities](admin-capabilities.md), [ERD](../data/erd.md), [API](../contracts/api-foundation.md), [SEC verification](../security/verification-plan.md), [DSA](../engineering/dsa-rules.md) là hợp đồng cần cùng khớp. Danh mục configuration là nguồn input schema; không hardcode các giá trị đề xuất thành contract đã duyệt.

## Harness và điều kiện nghiệm thu

Dùng synthetic actors A học sinh, B người chăm sóc, C điểm tựa; hai trường/cohort S1/S2; R-SYS SYSTEM explicit, admin SCHOOL S1, các role nhỏ, staff nhận và staff chưa nhận; ít nhất hai editor/phiên để chạy race. Provider/clock/network fixture có fail trước và sau commit; không call người thật/provider thật trong tests tài liệu. Kiểm thử auth trực tiếp backend, không chỉ UI ẩn nút. Cases concurrency cần MySQL thực cho unique/locks/slot overlap, SQLite/browser không thay thế. Các trường private đi qua kiểm tra log/cache/audit/export không body. UI small screen/large text/keyboard/reduced motion và Zalo Android/iOS thực thuộc US-049, chưa được thực hiện trong đợt docs.

Mỗi case ghi build/main SHA, US/control, environment, setup, request(s), expected/actual, evidence đã khử dữ liệu, owner, ngày, cleanup. Khi có code, tách mỗi nhánh fail của case thành assertion có fixture độc lập; không một click happy-path đại diện mọi nhánh. Mutation unknown-result thử cả “commit đã có” và “chưa có”; race chạy lặp có barrier xác định, không flaky sleep. Quyền default-deny, bounds/query và cache phải kiểm tra negative. Có thể dùng các case này làm kịch bản bàn giao teacher; screenshot/video thật bổ sung sau UI, không fake evidence.

## Cases người dùng (60)

### FL-01 — Onboarding, Zalo, consent và phiên làm việc

Setup: Provider giả lập đúng/sai App ID; consent v1/v2, hai actor có cache khác nhau. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-01-01 | Login hợp lệ và từ chối nghiên cứu; chỉ consent đã chọn được ghi, help vẫn mở | WF-01, WF-17, WF-23 | NOT_RUN |
| WT-01-02 | Sai App ID/actor giả; không token hoặc private read | WF-01, WF-17, WF-23 | NOT_RUN |
| WT-01-03 | Policy đổi và logout/resume; không auto-accept, cache actor cũ không hiện | WF-01, WF-17, WF-23 | NOT_RUN |

### FL-02 — Mời và xác nhận kết nối chính

Setup: A/B không connection; invite còn hạn/hết hạn, hai phiên đồng thời. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-02-01 | Hai phía tự confirm; đúng một connection active, không grant tự sinh | WF-02, WF-08, WF-11 | NOT_RUN |
| WT-02-02 | Một phía/admin/self/expired code; không active, không dò danh tính | WF-02, WF-08, WF-11 | NOT_RUN |
| WT-02-03 | Double confirm + revoke cạnh tranh; trạng thái cuối nhất quán, không resurrect | WF-02, WF-08, WF-11 | NOT_RUN |

### FL-03 — Kết nối điểm tựa dự phòng

Setup: A đã nối B chính; C là điểm tựa tự chọn chưa nối, sau đó revoke C. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-03-01 | Backup bilateral active; vẫn không thấy nội dung nếu chưa chia sẻ | WF-04, WF-06, WF-08 | NOT_RUN |
| WT-03-02 | Không reply ở chính; không tự tạo backup hay forward | WF-04, WF-06, WF-08 | NOT_RUN |
| WT-03-03 | Backup bị revoke lúc chọn; send bị chặn và cho chọn người khác | WF-04, WF-06, WF-08 | NOT_RUN |

### FL-04 — Trang chủ, mood và lịch sử riêng

Setup: Mood A ngày D ở timezone đã chốt; B/R-SYS không grant; 51 mục history. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-04-01 | Lưu mood hôm nay; chỉ owner đọc, history phân trang | WF-03, WF-11, WF-12 | NOT_RUN |
| WT-04-02 | Family/admin đoán ID mood riêng; không body/metadata riêng | WF-03, WF-11, WF-12 | NOT_RUN |
| WT-04-03 | Hai thiết bị/stale/timezone; không lost update/duplicate, page có bounds | WF-03, WF-11, WF-12 | NOT_RUN |

### FL-05 — Chia sẻ từng mood

Setup: Mood A revision1, grant B/generation1; sửa revision2 hoặc unlink/reconnect. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-05-01 | Preview và confirm một mood; chỉ recipient chọn đọc đúng revision | WF-02, WF-03, WF-04 | NOT_RUN |
| WT-05-02 | Grant sai item/recipient/generation; API deny kể cả System Administrator | WF-02, WF-03, WF-04 | NOT_RUN |
| WT-05-03 | Sửa mood hoặc revoke sau share; read body cũ failclosed, reshare cần confirm mới | WF-02, WF-03, WF-04 | NOT_RUN |

### FL-06 — Nhật ký riêng

Setup: Page A riêng, prompt version1; phát hành prompt2; lưu với expected_revision cũ. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-06-01 | Viết theo mẫu rồi mẫu đổi; trang vẫn nguyên và owner-only | WF-03, WF-11, WF-12 | NOT_RUN |
| WT-06-02 | Family/teacher/SYS đoán page ID; deny, không log body | WF-03, WF-11, WF-12 | NOT_RUN |
| WT-06-03 | Save timeout/stale/offline logout; reconcile không mất dữ liệu hay lộ actor khác | WF-03, WF-11, WF-12 | NOT_RUN |

### FL-07 — Nhật ký song hành và chia sẻ từng trang

Setup: Page A/B cùng chủ đề; chỉ A share revision1 cho B; B đang reply lúc A revoke. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-07-01 | Hai trang cùng prompt; chỉ trang được share đọc, phản hồi có context | WF-03, WF-04, WF-05 | NOT_RUN |
| WT-07-02 | Không share trang mình mà nhận trang khác; trang mình vẫn private | WF-03, WF-04, WF-05 | NOT_RUN |
| WT-07-03 | Page revision/revoke khi reply; chặn send context cũ và invalidate cache | WF-03, WF-04, WF-05 | NOT_RUN |

### FL-08 — Soạn thẻ/tin, recipient, preview và gửi

Setup: Draft A revision1, recipients B/C; preview binding; mô phỏng timeout trước/sau commit. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-08-01 | Chọn recipient + preview + explicit send; đúng một approved_body Message | WF-05, WF-06, WF-11 | NOT_RUN |
| WT-08-02 | Body/recipient đổi sau preview hoặc chưa hết pause; không send | WF-05, WF-06, WF-11 | NOT_RUN |
| WT-08-03 | Double-submit/unknown timeout/key hash khác; một effect, 409/lookup đúng owner | WF-05, WF-06, WF-11 | NOT_RUN |

### FL-09 — AI gợi ý và revision

Setup: Provider giả lập bounded/no network thật; consent AI, output invalid, draft revision đổi. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-09-01 | Request tự chọn, apply revision hợp lệ rồi preview; message không original | WF-03, WF-06, WF-10 | NOT_RUN |
| WT-09-02 | Family/SYS/request không consent hoặc revoked; không AI data access/call | WF-03, WF-06, WF-10 | NOT_RUN |
| WT-09-03 | Timeout/stale/kill switch; nháp giữ, manual/help dùng, không overwrite/send | WF-03, WF-06, WF-10 | NOT_RUN |

### FL-10 — Lưu nháp và pause server 300 giây

Setup: Server time t, client clock lệch ±1 ngày; hai thiết bị pause; app đóng tại t+299. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-10-01 | Pause ở server t+300; hết giờ đúng vẫn draft, explicit send sau đó | WF-06, WF-07, WF-11 | NOT_RUN |
| WT-10-02 | Đổi clock/điều chỉnh config duration/auto-send; denied, help không chặn | WF-06, WF-07, WF-11 | NOT_RUN |
| WT-10-03 | Resume/double pause/offline; reconcile deadline không tự gửi hay shortening | WF-06, WF-07, WF-11 | NOT_RUN |

### FL-11 — Hộp thư, đã xem và phản hồi

Setup: Messages A/B/C, journal context grant; read event giả và pagination/poll fake clock. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-11-01 | Read đúng recipient; read receipt không acceptance, reply preview mới | WF-02, WF-04, WF-05, WF-12 | NOT_RUN |
| WT-11-02 | Guess inbox/context stale/teacher SYS; không body/read event trái phép | WF-02, WF-04, WF-05, WF-12 | NOT_RUN |
| WT-11-03 | Duplicate read/send + revoke/resume; một effect, cache và cursor đúng scope | WF-02, WF-04, WF-05, WF-12 | NOT_RUN |

### FL-12 — Tham gia chương trình bốn tuần

Setup: Program version1 có đúng 4 tuần; publish version2 khi A active v1, B bỏ qua. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-12-01 | Join version v1 rồi v2 publish; owner vẫn v1, tuần 4 vào ngay | WF-09, WF-15 | NOT_RUN |
| WT-12-02 | Bỏ qua/rút nghiên cứu hoặc chương trình; help không khóa | WF-09, WF-15 | NOT_RUN |
| WT-12-03 | Retire/join/withdraw concurrent; không silent migrate pin hoặc double enrollment | WF-09, WF-15 | NOT_RUN |

### FL-13 — Hoạt động riêng, bài học 60 giây và sổ giấy

Setup: Solo run audience student/caregiver; lesson/paper guide, note riêng; retire content. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-13-01 | Đọc lesson/guide, skip hoặc complete tùy ý; note riêng, không khóa tuần | WF-03, WF-09, WF-15 | NOT_RUN |
| WT-13-02 | Audience sai hoặc retire; không start, không leak private_note | WF-03, WF-09, WF-15 | NOT_RUN |
| WT-13-03 | Template publish/concurrent finish; run pin giữ, một completion và 409 đúng | WF-03, WF-09, WF-15 | NOT_RUN |

### FL-14 — Hoạt động chung và từng participant

Setup: Joint run A/B, B chưa accept; A/B đồng thời cancel/complete, connection revoke. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-14-01 | Mỗi participant tự accept/complete; private_note không sang partner | WF-03, WF-08, WF-09, WF-11 | NOT_RUN |
| WT-14-02 | Invite không accept/admin complete thay; forbidden, không shared note | WF-03, WF-08, WF-09, WF-11 | NOT_RUN |
| WT-14-03 | Revoke/decline/double complete đồng thời; state final không resurrect | WF-03, WF-08, WF-09, WF-11 | NOT_RUN |

### FL-15 — Thỏa ước và hai xác nhận cùng revision

Setup: Agreement v1/v2, A accept v1 và B accept v2; edit/accept đồng thời. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-15-01 | Hai signer accept cùng v1; confirmed v1, sửa sang v2 cần hai accept mới | WF-08, WF-11 | NOT_RUN |
| WT-15-02 | v1+v2/admin/partner impersonation; không confirmed | WF-08, WF-11 | NOT_RUN |
| WT-15-03 | Edit/accept/revoke cùng lúc; không lost revision/double sign/resurrection | WF-08, WF-11 | NOT_RUN |

### FL-16 — Con cần được lắng nghe và chọn điểm tựa khác

Setup: Draft đang pause; B không phản hồi, C backup active; send timeout và revoke. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-16-01 | Trong pause bấm help/signal; được chọn recipient/preview/send độc lập và mở calls | WF-05, WF-06, WF-07 | NOT_RUN |
| WT-16-02 | Không reply/5 phút; không tự forward/send/thông báo cho giáo viên | WF-05, WF-06, WF-07 | NOT_RUN |
| WT-16-03 | Connection mất/network outcome chưa rõ; giữ nháp, đối soát và help công khai ngay | WF-05, WF-06, WF-07 | NOT_RUN |

### FL-17 — Danh bạ, gọi và trợ giúp tức thì

Setup: Contact verified/current, expired và suspended; auth/AI/API lỗi; màn hình nhỏ/large text. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-17-01 | Contact đúng giờ verified; chữ dễ đọc/call user chọn và alternative | WF-07, WF-18, WF-24 | NOT_RUN |
| WT-17-02 | Auth/AI/pause lỗi và contact expired; help vẫn có fallback hợp lệ, không số đã retire | WF-07, WF-18, WF-24 | NOT_RUN |
| WT-17-03 | Admin sửa/tắt contact trong lúc mở; không booking/snapshot khẳng định dữ liệu stale | WF-07, WF-18, WF-24 | NOT_RUN |

### FL-18 — Lịch hẹn có người tiếp nhận

Setup: Staff S/T, dispatcher và SYS chưa assigned; hai request cùng slot, giờ UTC/timezone. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-18-01 | Được giao staff accept/revise và user confirm; note chỉ hai bên, giờ UTC đúng | WF-02, WF-11, WF-18 | NOT_RUN |
| WT-18-02 | SYS/dispatcher không assigned đọc note/không có operator; deny hoặc module off, help vẫn mở | WF-02, WF-11, WF-18 | NOT_RUN |
| WT-18-03 | Hai user trùng slot/double confirm/reassign; tối đa capacity, 409, current ACL | WF-02, WF-11, WF-18 | NOT_RUN |

### FL-19 — Khảo sát tự nguyện và nghiên cứu aggregate

Setup: Hai cohort/schools/audiences/versions, group dưới floor, withdraw; k unset và filters trùng. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-19-01 | Opt-in version form submit; skipped survey không ảnh hưởng program/help | WF-03, WF-09, WF-13, WF-17 | NOT_RUN |
| WT-19-02 | SYS/raw/mapping/cross-school/k-null report; deny, không export small groups | WF-03, WF-09, WF-13, WF-17 | NOT_RUN |
| WT-19-03 | Form responses+revision/double submit/withdraw/filter difference; freeze+exclude+suppression | WF-03, WF-09, WF-13, WF-17 | NOT_RUN |

### FL-20 — Revoke, unlink, reconnect, xóa và cache

Setup: Grant revocation, unlink rồi generation mới, deletion một bước thất bại, backup trước revoke. Common auth/current scope/typed bounds và offline/resume của flow vẫn bắt buộc.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| WT-20-01 | Revoke item và unlink; subsequent read denied, reconnect không hồi sinh grant | WF-02, WF-04, WF-11, WF-21 | NOT_RUN |
| WT-20-02 | Admin unlink/consent giả hay rollback/restore old ledger; denied/không hồi sinh quyền | WF-02, WF-04, WF-11, WF-21 | NOT_RUN |
| WT-20-03 | Send/read/deletion race, partial failure và resume; failclosed, receipt đúng sự thật, ledger đã áp lại | WF-02, WF-04, WF-11, WF-21 | NOT_RUN |

## Cases admin (18)

### AF-01 — Nội dung, nhận diện và policy

Setup: Một editor có publish caps, editor thiếu caps, two editors; pinned enrollment v1, contact stale, brand contrast fail. Kiểm tra role/cap/scope trực tiếp API và audit không private body; same actor review/publish phải receipt hai bước khác nhau.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| AT-01-01 | Đổi chủ đề tuần 2, thêm thẻ, ẩn bài học và publish bằng cùng một người có đủ caps; release mới và enrollment cũ giữ pin | WF-15, WF-17, WF-21, WF-24 | NOT_RUN |
| AT-01-02 | Rollback policy/contact/brand lỗi hoặc thay consent; block refs stale/contrast thấp, không tự consent/hồi sinh grant | WF-15, WF-17, WF-21, WF-24 | NOT_RUN |
| AT-01-03 | Hai editor và double publish/bulk;409 đúng snapshot, một release, audit actor/reason không body riêng | WF-15, WF-17, WF-21, WF-24 | NOT_RUN |

### AF-02 — Danh bạ, phân công tiếp nhận và lịch hẹn

Setup: Contact verified/unverified, S/T staff và SYS chưa assigned; appointment confirmed khi giờ đổi. Kiểm tra role/cap/scope trực tiếp API và audit không private body; same actor review/publish phải receipt hai bước khác nhau.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| AT-02-01 | Sửa số đã xác minh/giờ và assign staff; public cập nhật, note chỉ staff được giao | WF-02, WF-11, WF-18 | NOT_RUN |
| AT-02-02 | Unverified/retired/không staff hoặc SYS không assigned; không promise booking/read note | WF-02, WF-11, WF-18 | NOT_RUN |
| AT-02-03 | Reassign/overlap/rollback đồng thời; quyền cũ mất, slot không trùng, không revive contact stale | WF-02, WF-11, WF-18 | NOT_RUN |

### AF-03 — Form/cohort và báo cáo tổng hợp

Setup: Form có response; hai cohort, k floor locked/unset, filters overlapping, withdrawn participation. Kiểm tra role/cap/scope trực tiếp API và audit không private body; same actor review/publish phải receipt hai bước khác nhau.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| AT-03-01 | Clone form, publish audience/phase đúng; có response không sửa âm thầm, report theo version | WF-03, WF-13, WF-17 | NOT_RUN |
| AT-03-02 | SYS/cross-scope/raw/mapping/k chưa chốt hoặc hạ floor; denied/suppressed | WF-03, WF-13, WF-17 | NOT_RUN |
| AT-03-03 | Repeated filters/withdrawal/versionmix; không suy cá nhân, exclude current consent và audit export | WF-03, WF-13, WF-17 | NOT_RUN |

### AF-04 — Tài khoản, role/capability/scope/TTL và khôi phục

Setup: Admin SYSTEM explicit, admin SCHOOL, invite TTL; hai last SYSTEM owners và grant không delegable. Kiểm tra role/cap/scope trực tiếp API và audit không private body; same actor review/publish phải receipt hai bước khác nhau.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| AT-04-01 | Mời role nhỏ TTL đúng scope, một người nhiều role; thu hồi mất capability ngay, private ACL giữ | WF-02, WF-14, WF-20 | NOT_RUN |
| AT-04-02 | Self-elevation/cross-school/is_staff/superuser; denied, không mở private/raw data | WF-02, WF-14, WF-20 | NOT_RUN |
| AT-04-03 | Hai last-admin revoke/khóa + lost account; không lockout trái phép, recovery audit và step-up | WF-02, WF-14, WF-20 | NOT_RUN |

### AF-05 — Cấu hình sản phẩm, feature flags và AI

Setup: Registry module implemented/absent, safe ranges unset; AI inflight, private drafts, malicious typed settings. Kiểm tra role/cap/scope trực tiếp API và audit không private body; same actor review/publish phải receipt hai bước khác nhau.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| AT-05-01 | AI off và module đã triển khai toggle; giữ draft/manual/help, effective config/audit đúng | WF-06, WF-07, WF-16, WF-19, WF-22 | NOT_RUN |
| AT-05-02 | Tắt help/đổi pause300/auto-send hoặc bật module chưa code; rejected | WF-06, WF-07, WF-16, WF-19, WF-22 | NOT_RUN |
| AT-05-03 | Nhập key/URL/Python/SQL/JS, sai type/stale/ngoài bounds; rejected, không network/eval | WF-06, WF-07, WF-16, WF-19, WF-22 | NOT_RUN |

### AF-06 — Vận hành, quyền riêng tư, audit và backup/restore

Setup: Sanitized errors, case partial fail; backup trước delete, latest ledger và concurrent revoke ở cutover. Kiểm tra role/cap/scope trực tiếp API và audit không private body; same actor review/publish phải receipt hai bước khác nhau.

| ID | Action/expected result | Rules | Evidence |
| --- | --- | --- | --- |
| AT-06-01 | View sanitized health/audit, privacycase truthful; không tải toàn DB/body logs | WF-12, WF-20, WF-21, WF-23 | NOT_RUN |
| AT-06-02 | Restore backup trước delete/revoke; reapply ledger trước serve, không resurrect account/grant/consent | WF-12, WF-20, WF-21, WF-23 | NOT_RUN |
| AT-06-03 | Bulk/page/retry bounds và audit failure/partial deletion; không fake completed,help vẫn mở | WF-12, WF-20, WF-21, WF-23 | NOT_RUN |

## F01..F15 → flow → entity → rule → test → US

Tất cả entity mới ghi “proposed” ở ERD; relation không chứng minh schema đã có. US-034 giới hạn pause cũ đã supersede bởi DEC-03 (300 cố định). US-046 appointments conditional, không tự bật trong MVP/pilot.

| Feature | Flow | Entity | Rule | Test | US |
| --- | --- | --- | --- | --- | --- |
| F01 | FL-01, FL-02, FL-03, FL-20 | User, ProviderIdentity, ConnectionInvite, Connection | WF-01, WF-02, WF-08 | WT-01-01, WT-02-02, WT-03-03, WT-20-01 | US-011, US-012, US-013, US-022, US-023 |
| F02 | FL-12, FL-13, FL-14, FL-15, AF-01 | ProgramVersion, WeekTopic, ContentRevision, Enrollment, ActivityRun, RunParticipant, AgreementRevision/Acceptance | WF-08, WF-09, WF-15 | WT-12-01, WT-13-01, WT-14-02, WT-15-02, AT-01-01 | US-009, US-020, US-036, US-037, US-044 |
| F03 | FL-08, AF-01 | ContentRevision emotion_card, Message | WF-05, WF-11, WF-15 | WT-08-01, WT-08-03, AT-01-01 | US-007, US-021, US-027, US-042 |
| F04 | FL-08, FL-09, FL-10, AF-05 | PrivateDraft, AIReframe, Message approved_body | WF-03, WF-06, WF-10, WF-19 | WT-09-02, WT-09-03, AT-05-01 | US-008, US-025, US-029, US-030, US-033, US-043 |
| F05 | FL-07, FL-11, AF-01 | Message reply_to, ContentRevision quick_reply | WF-04, WF-05, WF-11 | WT-11-01, WT-11-02, WT-07-03 | US-021, US-028, US-031 |
| F06 | FL-10, AF-05 | PrivateDraft.cooldown_until/revision | WF-06, WF-07 | WT-10-01, WT-10-02, WT-10-03, AT-05-02 | US-030, US-034, US-039 |
| F07 | FL-04, FL-05, FL-20 | MoodEntry, MoodShare | WF-03, WF-04, WF-12 | WT-04-02, WT-04-03, WT-05-03 | US-015, US-026, US-048 |
| F08 | FL-06, FL-07, FL-13, AF-01 | JournalPage, JournalShare, Message context, ContentRevision paper_guide | WF-03, WF-04, WF-15 | WT-06-01, WT-06-02, WT-07-03 | US-009, US-016, US-031, US-048 |
| F09 | FL-12, FL-13, FL-14, FL-15, AF-01 | ContentRevision activity/lesson, ActivityRun, AgreementRevision/Acceptance | WF-08, WF-09, WF-15 | WT-13-02, WT-14-03, WT-15-03, AT-01-01 | US-024, US-036, US-037, US-044 |
| F10 | FL-16 | Message listening_signal | WF-05, WF-06, WF-07 | WT-16-01, WT-16-02, WT-16-03 | US-032, US-035, US-039 |
| F11 | FL-03, FL-16 | Connection kind backup | WF-04, WF-06, WF-08 | WT-03-01, WT-03-02, WT-16-02 | US-022, US-035 |
| F12 | FL-18, AF-02, AF-04, AF-06 | School, RoleAssignment, SupportContact, AppointmentRequest; proposed admin records | WF-02, WF-14, WF-18, WF-20 | WT-18-02, WT-18-03, AT-04-02, AT-06-02 | US-014, US-024, US-041, US-046 |
| F13 | FL-16, FL-17, AF-02, AF-05 | SupportContact contact_type help | WF-07, WF-18, WF-19 | WT-17-01, WT-17-02, AT-02-02, AT-05-02 | US-006, US-038, US-039 |
| F14 | FL-19, AF-03 | ResearchCohort, Participation, CohortSurvey, SurveyVersion/Question/Response/Answer | WF-09, WF-13, WF-17 | WT-19-02, WT-19-03, AT-03-02, AT-03-03 | US-010, US-025, US-040, US-045, US-052 |
| F15 | FL-01, FL-05, FL-07, FL-20, AF-04, AF-06 | ConsentRecord, typed grants, Connection revoked_at, DeletionRequest, proposed PrivacyLedger | WF-02, WF-03, WF-04, WF-17, WF-21 | WT-01-03, WT-20-01, WT-20-03, AT-06-02 | US-005, US-012, US-017, US-018, US-023, US-048 |

## Capability → test guard

Mỗi CAP chạy với có quyền, thiếu quyền, hết TTL và sai scope; System Administrator vẫn không đọc private/raw data. Các case list/query phải filter trước pagination.

| Capability | Case | Expected bổ sung |
| --- | --- | --- |
| CAP-01 | AT-01-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-02 | AT-01-03 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-03 | AT-01-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-04 | AT-01-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-05 | AT-01-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-06 | AT-01-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-07 | AT-02-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-08 | AT-02-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-09 | AT-02-03 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-10 | WT-18-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-11 | AT-03-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-12 | AT-03-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-13 | AT-03-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-14 | AT-04-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-15 | AT-04-03 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-16 | AT-04-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-17 | AT-05-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-18 | AT-05-03 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-19 | AT-06-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-20 | AT-06-03 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-21 | AT-06-01 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-22 | AT-06-02 | Không client flag/role cũ mở quyền; backend current cap+scope+TTL, audit action không body |
| CAP-23 | AT-04-02 | classroom.provision: scope lọc thật (school chỉ khớp class_ref), thiếu grant 404, audit batch refs, idempotency batch_ref; không tự sinh grant/consent (f16 test_admin_provision A01–A12) |

## Checklist đủ luồng, chưa đủ implementation

- Onboarding/logout/change actor → FL-01; cả hai loại connection → FL-02/03; home/mood/history/share → FL-04/05; private/song hành/page sharing → FL-06/07.
- Card/recipient/preview/explicit send → FL-08; AI revision/private original → FL-09; fixed server300 → FL-10; inbox/read/reply/unknown-result → FL-11.
- Voluntary baseline 4/pinned program → FL-12; solo/joint participant → FL-13/14; two-signers same revision → FL-15; listening/choose another → FL-16; immediate real help → FL-17; actual staff bookings → FL-18.
- Voluntary pre/post safe aggregate → FL-19; revoke/unlink/reconnect/delete/cache/restore → FL-20. Admin A..J → AF-01..06 +120 fields catalog +22 caps.
- Thử null/unknown/malformed settings, stale references, role self-elevation, last-admin race, audit outage, partial deletion, restore old ledger và small-group differencing trước pilot. Không coi ma trận có dòng là test backend đã pass.

US-001/002/003/004 quản lý board/plan/foundation/contracts; US-019 notifications chỉ nghiên cứu riêng; US-041 bàn giao dựa trên các AF và handover; US-047 loại dữ liệu mẫu/policy trước pilot; US-049 devices, US-050 acceptance, US-051 distribution/review, US-052 nghiên cứu thật là gate ngoài docs-only. Các US demo US-042/043 phải mô tả template/synthetic, không thành bằng chứng người dùng thật. Snapshot 52 US giữ nguyên; chỉ đề xuất Tasks mới cho deep admin trong DEC-22, không giả cập nhật Trello live.

## Definition of evidence

Docs checks chỉ chứng minh file/path/link/metadata/ID/wiring/checksum. Skill forward-test chỉ chứng minh tình huống mẫu được agent đọc và trả lời, không bảo đảm mọi agent tuân thủ. Mermaid parse chỉ syntax; render riêng; accessibility/MySQL/Zalo/provider/billing/restore/pilot chưa nghiệm thu. Khi code có, đọc scope hợp đồng mới nhất và gắn từng evidence SEC/US đúng phạm vi, không nâng hàng loạt status.

## Catalog A..J → validation và tác động

Các case nhóm phải parameterize theo **từng CFG field** có write/read contract: đúng type/default/boundary, thiếu required, unknown key, sai scope, stale revision, referenced mutation và effective policy. Với numeric proposal DEC-17, chỉ chạy actual khi schema được duyệt, không tự biến số trong docs thành runtime contract. Fields read-only/infrastructure thử denied mutation và đúng console boundary, không test success write giả.

| Nhóm catalog / AF | Tests | Impacts user flows phải đối chiếu |
| --- | --- | --- |
| A Giáo trình / AF-01 | AT-01-01/02/03, WT-12-01/03, WT-13-03 | FL-12/13/14/15 pin, baseline4, không private rewrite |
| B Thẻ/phản hồi/xưng hô / AF-01 | AT-01-01/03, WT-08-01/02, WT-11-01 | FL-08/11/16 recipient/preview/message snapshot |
| C Nhật ký/thỏa ước / AF-01 | AT-01-01/02, WT-06-01, WT-07-03, WT-15-03 | FL-06/07/15 template không page/signed revision |
| D Giới thiệu/consent / AF-01 | AT-01-02, WT-01-03, WT-19-02 | FL-01/17/19 expert approval, không auto-accept/help gate |
| E Brand / AF-01 | AT-01-02, WT-17-01 | Mọi FL/AF mobile contrast/states, asset registry, help đọc được |
| F Danh bạ/hẹn / AF-02 | AT-02-01/02/03, WT-18-02/03 | FL-16/17/18 live verification, current assignment/slot và alternatives |
| G Nghiên cứu / AF-03 | AT-03-01/02/03, WT-19-02/03 | FL-19 freeze/version/current consent/no raw/suppression |
| H Tài khoản/quyền / AF-04 | AT-04-01/02/03, WT-01-03, WT-20-01 | Tất cả FL current principal/scope/TTL; final-admin/recovery không bypass |
| I Modules/AI / AF-05 | AT-05-01/02/03, WT-09-03, WT-10-02 | FL-04/08..14/16..19 data retained/manual/help, fixed300/no auto-send |
| J Ops/privacy / AF-06 | AT-06-01/02/03, WT-20-03 | FL-01/05/07/11/19/20 cache/ledger/current access, console boundary |
