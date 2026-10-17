# Luồng người dùng và quản trị Family Bridge

Đây là **hợp đồng thiết kế**, chưa là bằng chứng chức năng hoạt động. Baseline main cbc40a402d2fcdaeb8be7f0eed3910299148dce8 chỉ có template Mini App/backend placeholder và tài liệu. Các màn hình dưới đây là vị trí dự kiến; triển khai phải bám US, scope và quyết định đã chốt, không tự thêm endpoint/migration.

Đọc [scope](../project-scope.md), [4 tuần](four-week-flow.md), [ERD](../data/erd.md), [API](../contracts/api-foundation.md), [quyền](access-sharing-matrix.md), [admin](admin-capabilities.md), [catalog](admin-configuration-catalog.md), [lifecycle](content-lifecycle.md), [states](workflow-state-machines.md), [tests/mapping](workflow-acceptance.md), [WF rules](../engineering/workflow-rules.md), [decisions](decision-register.md). F là tính năng scope; US là ID trong [snapshot](../project/backlog-snapshot.json), không claim trạng thái live/Done. FL/AF/CFG/CAP/WF/WT/AT giữ ID khi sửa; không tái sử dụng ID đã bỏ.

## Quy ước áp dụng từng luồng

- Mỗi request backend xác thực principal, capability nếu admin, scope, object và **state/revision hiện tại**; UI disabled chỉ hướng dẫn. Không tin actor, `is_staff`, role client hay Django superuser để bypass dữ liệu. Account restriction không được làm mất help công khai.
- Mutation gửi expected_revision + idempotency_key khi phù hợp; check payload_hash, transaction/unique/lock nhất quán. Network call nằm ngoài transaction. Timeout không đồng nghĩa thất bại: UI hiển thị chưa rõ kết quả, lookup operation theo owner/key; không retry bằng key mới để nhân side effect.
- Offline: không tự gửi/confirm/share/consent/publish sau resume. Đọc công khai đã duyệt; nháp riêng chỉ lưu local khi policy storage/cache được duyệt và cô lập actor. Resume refresh quyền/version/state trước action; input cũ giữ để owner tự xử lý 409. Không claim Zalo SDK đảm bảo private-cache purge trên thiết bị mất mạng.
- Side effects chỉ trong scope: persisted business transition, invalidate scoped caches, minimal redacted AuditEvent cho admin/quyền/sensitive action. Analytics/log/audit không body journal/AI/message/note/raw survey. Không external notification Zalo/email/SMS khi US-019 chưa được chốt; in-app state không hứa người thật đã nhận. Event worker phải recheck current scope và key, bounded retries, không gửi tin gia đình.
- Với mọi FL, success có receipt/revision thật; validation400, unauthorized401, denied403 hoặc 404 theo chống enumerate, conflict409, expired410 nếu không leak, rate429, temporary503 được map rõ tiếng Việt. Từ chối/hủy không phạt; expiry không chuyển thành accept/send. Logout/revoke xóa cache scope đang xem; permission kiểm tra trước pagination/aggregation. Help có đường thay thế ngay.
- Những giới hạn catalog/TTL/local drafts chưa chốt là gate DEC-17, không tự chọn vô hạn. Workflow acceptance là **expected result**, cột evidence còn NOT_RUN cho runtime. Kịch bản code phải bổ sung fixture/harness thật theo DSA/SEC/UI.

## FL-01 — Onboarding, Zalo, consent và phiên làm việc

**Actor/mục đích:** Học sinh/người chăm sóc xác định đúng actor, hiểu quyền riêng tư trước sử dụng. **Feature/US:** F01/F15; US-005/011/012/048.

**Điểm vào, preconditions và permission:** Lần mở app, Đăng nhập hoặc đổi tài khoản; backend xác minh provider theo App ID, không tin role/subject client. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI giới thiệu ngắn và đường trợ giúp công khai → Zalo login → backend resolve principal → chọn actor hợp lệ → đọc policy version đang phát hành → tự chọn đồng ý từng mục được yêu cầu/tùy chọn. Backend lưu quyết định/version/time/purpose; UI hiển thị actor và mục đã đồng ý. Logout thu hồi phiên ứng dụng theo hợp đồng; đổi actor dọn cache trước load dữ liệu mới. Từ chối nghiên cứu/AI không mất đường help; mục bắt buộc cần lý do và hành vi thay thế đã được chốt.

**Data, người nhận, states/guards và forbidden transitions:** User/ProviderIdentity/ConsentRecord; dữ liệu định danh tối thiểu, consent owner và vận hành case theo quyền; không share family. Anonymous → authenticated → consent_recorded; consent có accepted/declined/withdrawn theo mục. Login không suy ra consent; policy mới không sửa accepted_version cũ. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Provider lỗi/sai App ID: không tạo token; hủy onboarding quay về help. Offline chỉ xem nội dung công khai đã duyệt, không giả login/accept. Đổi policy khi đang mở phải trả version mới để xem lại; submit lặp cùng decision/revision không nhân bản. Revoke phiên loại bỏ cached private content ở thiết bị đang dùng; thiết bị offline purge ở lần resume và không cấp đọc mới.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-D01..D12 qua AF-01; role/account CFG-H qua AF-04. Sửa consent chỉ phát hành policy mới; backend gate reconsent chỉ đúng purpose, không block help.

**Cần coder/hạ tầng/quyết định:** DEC-14/23: session/step-up, consent trẻ vị thành niên; US-011/012/005 cần code và Zalo device evidence.

**Acceptance/expected:** WT-01-01 — Login hợp lệ và từ chối nghiên cứu; chỉ consent đã chọn được ghi, help vẫn mở; WT-01-02 — Sai App ID/actor giả; không token hoặc private read; WT-01-03 — Policy đổi và logout/resume; không auto-accept, cache actor cũ không hiện. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-02 — Mời và xác nhận kết nối chính

**Actor/mục đích:** Hai thành viên gia đình tự kết nối, không admin thay mặt. **Feature/US:** F01/F15; US-013/023/048.

**Điểm vào, preconditions và permission:** Trang Kết nối → tạo mã; cả hai có phiên hợp lệ, đúng policy, không tự kết nối với mình; không đòi đã đăng ký chương trình. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Actor A tạo invite scope quan hệ chính; backend sinh mã khó đoán, lưu hash/TTL/bounds. B nhập mã; UI cả hai xem danh tính tối thiểu và quan hệ đề nghị. B chấp nhận và A tự xác nhận; backend canonical pair + transaction kiểm tra hai quyết định, expires, account, generation rồi activate. Từ chối/hủy được phép trước active. Chỉ khi active mới có lựa chọn recipient; không share dữ liệu cũ.

**Data, người nhận, states/guards và forbidden transitions:** ConnectionInvite/Connection, tối thiểu display label quan hệ; mỗi actor chỉ thấy lời mời mình tham gia. Created → candidate → awaiting_confirmation → active, hoặc declined/cancelled/expired. Không active từ một phía, không admin accept, không private history đi kèm. **Cập nhật 18/10/2026 (DEC-24):** chế độ ghép cặp do quản trị cấp (CAP-23 `classroom.provision`) tạo Connection ACTIVE ngay khi admin lưu — đây không phải admin xác nhận thay người dùng cho luồng tự nguyện; không đồng ý hộ, không mở nội dung riêng, unlink/revoke vẫn theo FL-20 và không tự hồi sinh khi nạp lại danh sách. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Mã sai/hết hạn trả lỗi không tiết lộ tài khoản, rate-limit chống dò. Offline giữ input tối thiểu, không active cục bộ. Hai thiết bị confirm cùng lúc: unique canonical pair, một activation/generation; status reconcile. Revoke giữa confirm → không active stale. Mời trùng không tạo hai connection sống cùng pair; reconnect là FL-20.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-D onboarding cách giải thích; validation TTL/rate DEC-17 cần typed contract. Admin CFG-H chỉ khóa/quyền, không tạo consent/connection.

**Cần coder/hạ tầng/quyết định:** US-004/013/012: schema indexes/transaction/rate; thời hạn mã phải chốt DEC-17.

**Acceptance/expected:** WT-02-01 — Hai phía tự confirm; đúng một connection active, không grant tự sinh; WT-02-02 — Một phía/admin/self/expired code; không active, không dò danh tính; WT-02-03 — Double confirm + revoke cạnh tranh; trạng thái cuối nhất quán, không resurrect. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-03 — Kết nối điểm tựa dự phòng

**Actor/mục đích:** Người dùng chủ động chọn người khác để được lắng nghe. **Feature/US:** F11/F01/F15; US-022/035/048.

**Điểm vào, preconditions và permission:** Kết nối dự phòng từ trang Kết nối hoặc lựa chọn điểm tựa; không dựa vào timeout/no reply. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI giải thích vai trò điểm tựa và những nội dung họ sẽ thấy nếu người dùng gửi. Tạo/nhập mã và hai bên tự confirm như FL-02, relationship_kind=backup. UI liệt kê kết nối active để người dùng chọn lại recipient riêng ở FL-08/16. Không chuyển thẻ/tâm sự đã gửi cho người chính sang người dự phòng.

**Data, người nhận, states/guards và forbidden transitions:** ConnectionInvite/Connection; label tối thiểu. Pending → active/declined/expired/revoked; backup không quyền đọc journal/mood/AI. Một pair không bị tạo bản quyền rộng hơn do đổi kind; quy tắc chuyển kind phải chốt trong US-004. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Từ chối/hủy giữ các kết nối khác. Mã hết hạn tạo mã mới không hồi sinh mã cũ. Offline không coi lời mời đã gửi; resume fetch status. Concurrent add/revoke/limit kiểm tra server; recipient stale bị loại trước preview/send.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-D hướng dẫn và CFG-B cách xưng hô; không config tự gán điểm tựa hay auto-forward. Giới hạn connection DEC-17, không bỏ bounds.

**Cần coder/hạ tầng/quyết định:** US-022/004; danh tính/khả năng tiếp nhận và giới hạn quan hệ cần quyết định trước pilot.

**Acceptance/expected:** WT-03-01 — Backup bilateral active; vẫn không thấy nội dung nếu chưa chia sẻ; WT-03-02 — Không reply ở chính; không tự tạo backup hay forward; WT-03-03 — Backup bị revoke lúc chọn; send bị chặn và cho chọn người khác. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-04 — Trang chủ, mood và lịch sử riêng

**Actor/mục đích:** Owner ghi trạng thái của mình, xem tiến trình nhẹ nhàng. **Feature/US:** F07/F02/F09; US-015/026/044.

**Điểm vào, preconditions và permission:** Trang chủ sau FL-01; owner-only mood, active enrollment chỉ dùng để lấy chương trình pin, không bắt buộc. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI hiển thị help cố định, tuần tự chọn không khóa, mood hôm nay nếu có. Owner chọn mood và tùy chọn ghi chú → backend upsert theo ngày/timezone hợp đồng, expected_revision. Xem history bằng cursor/date window có bounds, không tải toàn bộ. UI nêu mood riêng; chia sẻ là FL-05 riêng. Ngày không ghi không mất streak hay bị chẩn đoán.

**Data, người nhận, states/guards và forbidden transitions:** MoodEntry/Enrollment/ActivityRun của owner; một entry/ngày theo timezone đã chốt. Absent → saved(revision) → updated hoặc deleted. Không biến saved thành shared; backend không suy trạng thái bệnh từ mood. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Offline có thể giữ nháp riêng theo policy thiết bị chưa chốt, không hiển thị đã đồng bộ. Resume hỏi trước overwrite; stale revision409 giữ input để chọn lại. Timezone thay đổi không đổi ngày lịch sử; double-submit một row. Revoke consent/restriction fetch failclosed; history không cache chéo actor.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-I timezone và flags, CFG-A/C nội dung home/prompt; publish tuần mới không đổi Enrollment pin. Brand/UI CFG-E không được che help.

**Cần coder/hạ tầng/quyết định:** US-015/004/044 cần bounds/timezone/local draft security; DSA page20/max 50 là proposal cần đo.

**Acceptance/expected:** WT-04-01 — Lưu mood hôm nay; chỉ owner đọc, history phân trang; WT-04-02 — Family/admin đoán ID mood riêng; không body/metadata riêng; WT-04-03 — Hai thiết bị/stale/timezone; không lost update/duplicate, page có bounds. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-05 — Chia sẻ từng mood

**Actor/mục đích:** Owner tự chọn mục, revision và người nhận. **Feature/US:** F07/F15; US-026/023/048.

**Điểm vào, preconditions và permission:** Từ mood đã lưu; owner và recipient có Connection active/current generation; recipient không từ client tùy ý. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Chọn một mood và một recipient → preview đúng note/mood/revision, giải thích quyền đọc → xác nhận grant. Backend recheck ownership/revision/connection/consent trong transaction; người nhận đọc qua current grant. Owner có thao tác thu hồi rõ ràng. Sửa mood làm grant revision cũ không còn quyền; muốn chia sẻ bản mới phải preview/confirm lại.

**Data, người nhận, states/guards và forbidden transitions:** MoodEntry/MoodShare; private → shared_for_revision → revoked/stale. Không grant cả lịch sử, không grant cho cả trường. Không AI/admin tự share. Recipient biết đúng mục được cấp, không note khác. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Stale preview/revoke/unlink trước save: từ chối, không tạo grant. Không retry share khi offline bằng job tự động; resume hỏi xác nhận lại nếu dữ liệu đổi. Double share idempotent theo UNIQUE(item, recipient), tạo grant revision mới với approved_revision/current generation trong transaction; metadata audit không cho đọc body cũ. Cache invalidate grant ở client/server, online reads recheck; không hứa xóa ảnh chụp ngoài app.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-D wording quyền riêng tư/CFG-B xưng hô; không admin config mở mood mặc định. AF-04 không tăng data access.

**Cần coder/hạ tầng/quyết định:** US-026/012/023 cần scoped endpoints/cache invalidation; retention DEC-12.

**Acceptance/expected:** WT-05-01 — Preview và confirm một mood; chỉ recipient chọn đọc đúng revision; WT-05-02 — Grant sai item/recipient/generation; API deny kể cả System Administrator; WT-05-03 — Sửa mood hoặc revoke sau share; read body cũ failclosed, reshare cần confirm mới. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-06 — Nhật ký riêng

**Actor/mục đích:** Owner viết tự do từ prompt hoặc giấy, không bị ép chia sẻ. **Feature/US:** F08/F15; US-016/017/048.

**Điểm vào, preconditions và permission:** Tab Nhật ký hoặc hoạt động viết riêng; không cần connection/chương trình. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Chọn prompt/version tùy chọn → nhập trang riêng → lưu backend với revision → mở/sửa trang của mình. Prompt là gợi ý không auto-copy ngoài dự kiến. UI giải thích trang chưa ai khác xem; sổ giấy chỉ hướng dẫn, không upload/scan mặc định. Nút share mở FL-07 tách biệt; xóa/revoke theo FL-20.

**Data, người nhận, states/guards và forbidden transitions:** JournalPage owner, prompt ref nếu được chốt; private body không audit/log/analytics/AI mặc định. New → draft → saved revision → updated/deletion_pending. Không admin edit/user impersonation. Mẫu thay đổi không sửa trang đã viết. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Offline nháp chỉ khi cơ chế private storage được duyệt; không plaintext cross-account cache. Timeout lưu status_unknown: fetch theo operation ID trước retry cùng key; không mất draft.409 giữ cả input owner để chọn, không merge share âm thầm. Consent revoke không làm body xuất hiện admin; deletion chặn đọc đúng policy.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-C01..C03 prompt/mode và CFG-A paper guide qua AF-01; nội dung publish mới cho lần viết mới, trang cũ giữ body/ref.

**Cần coder/hạ tầng/quyết định:** US-016/004/012, local storage/recovery policy DEC-12/17 cần code riêng.

**Acceptance/expected:** WT-06-01 — Viết theo mẫu rồi mẫu đổi; trang vẫn nguyên và owner-only; WT-06-02 — Family/teacher/SYS đoán page ID; deny, không log body; WT-06-03 — Save timeout/stale/offline logout; reconcile không mất dữ liệu hay lộ actor khác. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-07 — Nhật ký song hành và chia sẻ từng trang

**Actor/mục đích:** Hai người cùng chủ đề nhưng giữ quyền quyết định từng trang. **Feature/US:** F08/F05/F15; US-009/031/028/048.

**Điểm vào, preconditions và permission:** Chọn chủ đề song hành; relationship active để mời/đọc share; trang của mỗi người độc lập. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI giới thiệu cùng prompt không đồng nghĩa cùng quyền đọc. Mỗi actor viết FL-06 riêng. Owner chọn page+recipient → preview revision → confirm JournalShare. Recipient mở bản được phép và chọn quick reply/viết phản hồi; backend kiểm tra grant/context và send FL-11. Không tự share trang đối ứng khi nhận được trang bên kia.

**Data, người nhận, states/guards và forbidden transitions:** JournalPage/JournalShare/Message reply context. Private → grant_active → revoked/stale; phản hồi là message đã preview cho sender đúng context. Một chủ đề không cấp quyền tất cả trang; recipient không edit body. Không lưu historical page bodies có thể đọc bằng grant cũ trong MVP. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Owner sửa page làm grant cũ stale; đang đọc/resume fetch lại. Revoke/connection change giữa reply preview và send → deny, giữ draft riêng. Double grant/reply cùng key một effect. Offline không đánh dấu nhận/read hay resend job. Từ chối mời/song hành không làm mất nhật ký riêng.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-C topics/questions/mode, CFG-B reply/pronouns; publish không rewrite pages/replies. Admin chỉ mẫu không tâm sự.

**Cần coder/hạ tầng/quyết định:** US-031/028/004/023 cần context ACL và cache revoke; lịch sử nhận sau unlink DEC-13.

**Acceptance/expected:** WT-07-01 — Hai trang cùng prompt; chỉ trang được share đọc, phản hồi có context; WT-07-02 — Không share trang mình mà nhận trang khác; trang mình vẫn private; WT-07-03 — Page revision/revoke khi reply; chặn send context cũ và invalidate cache. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-08 — Soạn thẻ/tin, recipient, preview và gửi

**Actor/mục đích:** Sender tự diễn đạt và quyết định nội dung cuối tới đúng người. **Feature/US:** F03/F04/F05/F10/F15; US-007/021/027/030/042.

**Điểm vào, preconditions và permission:** Thẻ hoặc Soạn tin; session+consent hợp lệ, recipient connection active; gửi chưa có recipient là forbidden. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Chọn thẻ/version hoặc nhập tin → chọn recipient active → xem hướng dẫn → chỉnh body cuối → preview hiển thị recipient + approved body + revision → nhấn Gửi. Backend check current draft/revision/preview binding/connection/cooldown, idempotency key+payload_hash rồi tạo Message approved_body snapshot. Transaction không gọi AI/Zalo network trong lock. UI chỉ thông báo gửi thành công khi có message_id; không đánh dấu delivered/read từ send response.

**Data, người nhận, states/guards và forbidden transitions:** PrivateDraft owner và ContentRevision thẻ; Message chứa bản duyệt, sender/recipient/generation/kind/context. Draft → previewed → sending → sent hoặc outcome_unknown. Thay body/recipient mất preview; không lưu original/AI inputs trong received message, không cho admin send thay. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Validation lỗi giữ draft và highlight. Timeout outcome_unknown: truy vấn status operation có auth, retry cùng key+hash khi đã xác nhận chưa tạo; đổi payload cần key mới và preview mới. Đồng thời click/draft edit chỉ một message hoặc 409; key reused khác payload409. Revoke/cooldown/change preview trước commit chặn. Offline không queue auto-send; resume luôn kiểm tra status.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-B card/groups/guidance/reply/pronouns, CFG-I limits/AI flags; card retire không được rollback để phát thẻ unsafe, draft giữ chữ owner nhưng revalidate content refs trước send.

**Cần coder/hạ tầng/quyết định:** US-021/027/030/004 cần outbox/status/idempotency contract; external notification US-019 không suy từ send.

**Acceptance/expected:** WT-08-01 — Chọn recipient + preview + explicit send; đúng một approved_body Message; WT-08-02 — Body/recipient đổi sau preview hoặc chưa hết pause; không send; WT-08-03 — Double-submit/unknown timeout/key hash khác; một effect, 409/lookup đúng owner. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-09 — AI gợi ý và revision

**Actor/mục đích:** Owner chủ động nhận gợi ý diễn đạt, có thể bỏ qua và viết tay. **Feature/US:** F04/F15; US-008/029/033/043.

**Điểm vào, preconditions và permission:** Trong nháp riêng; consent AI purpose cụ thể, safe provider/limits được duyệt, AI enabled; không bắt buộc cho send/help. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI cho xem đoạn gửi provider và thông báo xử lý tối thiểu; owner bấm Gợi ý. Backend kiểm tra policy/quota và lấy text revision, gọi provider ngoài transaction, timeout/bounded output. Lưu AIReframe input_revision riêng, schema/output treated untrusted. UI so sánh gợi ý, owner chọn dùng/sửa/bỏ. Apply chỉ khi draft input_revision còn đúng; tạo draft revision mới và mất preview. Gửi luôn qua FL-08, không gửi original hoặc AI output tự động.

**Data, người nhận, states/guards và forbidden transitions:** PrivateDraft/AIReframe owner-only; selected minimal text tới provider allowlist theo consent; không gửi identity/graph/history. idle → generating → suggested/error/cancelled; apply hoặc discard; stale output không overwrite nháp mới. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Provider timeout/quota/unsafe/output invalid trả lỗi thân thiện, giữ original riêng và nút viết tay/help. Một inflight/actor proposal; duplicate request key không nhân phí. Draft thay/consent revoke/AI kill switch khi inflight: không apply stale, không gửi; xử lý xóa provider theo policy chưa chốt. Offline/resume không tự request AI; logging redacted không input/output.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-I11..I17 quota/provider/limits/off, AF-05; CFG-D AI consent qua AF-01 không auto-accept; không admin input text hoặc đọc output.

**Cần coder/hạ tầng/quyết định:** DEC-12/16, US-004/025/029: provider processing/retention/budget/circuit break, MySQL and service tests.

**Acceptance/expected:** WT-09-01 — Request tự chọn, apply revision hợp lệ rồi preview; message không original; WT-09-02 — Family/SYS/request không consent hoặc revoked; không AI data access/call; WT-09-03 — Timeout/stale/kill switch; nháp giữ, manual/help dùng, không overwrite/send. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-10 — Lưu nháp và pause server 300 giây

**Actor/mục đích:** Owner chọn tạm dừng để bình tĩnh, vẫn có thể tìm giúp ngay. **Feature/US:** F06/F04/F13; US-030/034/039.

**Điểm vào, preconditions và permission:** Nút Lưu nháp/Tạm dừng trong composer; pause tùy chọn và cố định 300, không áp cho help. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Bấm tạm dừng → backend ghi cooldown_until=server_now+300 theo draft/revision và trả server_time. UI đếm tương đối từ server không tin đồng hồ thiết bị; owner vẫn sửa/lưu/thoát, tìm help. Khi đủ giờ chỉ chuyển eligible draft, chưa có recipient/preview mới vẫn chưa gửi. Resume lấy cooldown thực tế; Gửi phải FL-08 với guards server.

**Data, người nhận, states/guards và forbidden transitions:** PrivateDraft cooldown/revision owner-only; editable → paused → eligible; sent chỉ qua explicit send. Không scheduler send, không callback timer gửi, không coi hết giờ là consent. Sửa body không bỏ cooldown còn hiệu lực; quy tắc pause lại phải explicit, không tự reset vô hạn. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Đổi clock client không rút ngắn pause; offline countdown chỉ tham khảo, send cần server. Hai thiết bị start pause có expected_revision/defined idempotency, không lost update. Hết giờ app đóng vẫn draft. Hủy soạn không hủy help; draft deletion phải đúng owner. Timeout start pause reconcile status trước gửi.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-I03=300 readonly, I04=false readonly, help I02=true; US-034 cũ không còn quyền đổi duration. Text giải thích CFG-D có thể đổi nhưng không nói “tự gửi”.

**Cần coder/hạ tầng/quyết định:** US-030/004 backend time/tests/DSA; hard invariant đã chốt DEC-03, không waiting gate để tự đổi.

**Acceptance/expected:** WT-10-01 — Pause ở server t+300; hết giờ đúng vẫn draft, explicit send sau đó; WT-10-02 — Đổi clock/điều chỉnh config duration/auto-send; denied, help không chặn; WT-10-03 — Resume/double pause/offline; reconcile deadline không tự gửi hay shortening. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-11 — Hộp thư, đã xem và phản hồi

**Actor/mục đích:** Sender/recipient giao tiếp có ngữ cảnh và phân biệt gửi/đã xem. **Feature/US:** F05/F03/F08/F15; US-021/028/031/048.

**Điểm vào, preconditions và permission:** Inbox của principal; list lọc quyền trước cursor page, message current relationship/grant context nếu có. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI fetch page giới hạn, mở thread/message và backend recheck trước body. Khi thực sự hiển thị message, actor recipient gửi read event idempotent; sender thấy “đã xem”, không suy được hiểu/đồng ý/khỏi khó khăn. Chọn mẫu quick reply published hoặc tự viết → recipient/preview FL-08. Context journal/mood cần grant còn đúng tại send. UI giải thích gửi không rõ kết quả theo operation status, không ép phản hồi.

**Data, người nhận, states/guards và forbidden transitions:** Message approved snapshot + reply_to/current grant context, read_at do recipient. sent → read (không state resolved). Reply tạo message mới; không edit tin của người khác, không admin inbox universal. Proposed policy sau unlink DEC-13 failclosed recipient body. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** List không leak tổng thread/private count. Revoke trong khi open/cached: fetch bị từ chối, UI purge; reconnect không hiện generation cũ. Offline không mark read server/auto reply. Double read giữ earliest valid time; duplicate send cùng key một message. Pagination stable cursor, poll khi màn hình hiện, 30 giây/backoff tối đa 120 giây proposal; bounded window tối đa 200 metadata, không endless append.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-B quickreply/pronouns, CFG-I paging/flags; mẫu mới không rewrite sent messages. Admin tắt messaging cho create mới cần thông báo rõ và vẫn đường help/privacy.

**Cần coder/hạ tầng/quyết định:** DEC-13; US-021/028/023 MySQL ACL indexes/thread pagination, unknown send contract.

**Acceptance/expected:** WT-11-01 — Read đúng recipient; read receipt không acceptance, reply preview mới; WT-11-02 — Guess inbox/context stale/teacher SYS; không body/read event trái phép; WT-11-03 — Duplicate read/send + revoke/resume; một effect, cache và cursor đúng scope. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-12 — Tham gia chương trình bốn tuần

**Actor/mục đích:** Mỗi actor tự nguyện chọn nội dung theo nhu cầu. **Feature/US:** F02/F09/F14; US-009/036/044.

**Điểm vào, preconditions và permission:** Trang Chương trình hoặc home; phiên+consent, không cần connection để học riêng, research separate opt-in. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI giới thiệu baseline 4 chủ đề, mục tiêu/thời lượng và lựa chọn tham gia/bỏ qua. Backend tạo Enrollment owner pin ProgramVersion published. User vào bất kỳ tuần, không unlock theo điểm/ngày; pause/resume/withdraw mỗi actor. Tiến trình riêng hiển thị nhẹ không leaderboard/coercion. Admin phát hành version mới chỉ dùng enrollment mới; chuyển pin cần policy minh bạch DEC-20, không tự chuyển.

**Data, người nhận, states/guards và forbidden transitions:** ProgramVersion/WeekTopic/ContentRevision/Enrollment; offered → active → paused/resumed hoặc completed khi owner tự kết thúc, hoặc withdrawn; completion không unlock/consent nghiên cứu và không tự kết thúc sau ngày 28. Enrollment hai người độc lập, một rút không rút người kia hay xóa joint accepts. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Program retire giữa join:409 chọn current available; enrollment pin đọc content an toàn theo safety gate. Offline chỉ snapshot permitted không fake enrollment. Double join unique owner+version/policy đã chốt, không hai progress fork; concurrent withdraw/join cần state/revision. Không đăng ký cũng help/manual.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-A01..A15 via AF-01; baseline week_count=4 readonly; content new release không replace pin, hoạt động hazardous retired cần alternative/gate DEC-20.

**Cần coder/hạ tầng/quyết định:** US-036/004/044 pin/read policy and limits; DEC-20 khi safety content cũ ảnh hưởng người đang tham gia.

**Acceptance/expected:** WT-12-01 — Join version v1 rồi v2 publish; owner vẫn v1, tuần 4 vào ngay; WT-12-02 — Bỏ qua/rút nghiên cứu hoặc chương trình; help không khóa; WT-12-03 — Retire/join/withdraw concurrent; không silent migrate pin hoặc double enrollment. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-13 — Hoạt động riêng, bài học 60 giây và sổ giấy

**Actor/mục đích:** Actor tự chọn cách học và ghi chép. **Feature/US:** F02/F09/F08; US-009/024/037/044.

**Điểm vào, preconditions và permission:** Từ bất kỳ tuần enrollment hoặc nội dung public được phép; activity published và audience phù hợp. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI nêu hướng dẫn, duration ước lượng, mục tiêu và mode riêng/chung. Với riêng: start ActivityRun solo owner, đọc bài học 60 giây/paper guide, ghi private_note tùy chọn; finish/skip/cancel explicit, không đoán hoàn thành từ thời gian mở. Viết journal riêng FL-06 không upload sổ giấy. Nội dung mẫu có disclaimer, không chẩn đoán.

**Data, người nhận, states/guards và forbidden transitions:** ContentRevision pin, ActivityRun/RunParticipant owner, private_note owner-only. not_started → in_progress → completed/skipped/cancelled. “60 giây” là dạng bài ngắn không timed lock. Run không tự shared khi completed. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Offline/resume chỉ sync với key/revision nếu authorized và còn đúng content; đổi template không rewrite note. Đã retire unsafe chặn start mới và hiện alternative; existing run effect DEC-20. Double complete một event; stale update409. Từ chối prompt không required-answer hay punishment.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-A audience/duration/instructions/questions/kind/visibility, CFG-C prompts; AF-01 preview đúng student/caregiver. Hide activity ở release mới không hard-delete runs.

**Cần coder/hạ tầng/quyết định:** US-037/004, offline note protection/quota DEC-17; no runtime implemented yet.

**Acceptance/expected:** WT-13-01 — Đọc lesson/guide, skip hoặc complete tùy ý; note riêng, không khóa tuần; WT-13-02 — Audience sai hoặc retire; không start, không leak private_note; WT-13-03 — Template publish/concurrent finish; run pin giữ, một completion và 409 đúng. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-14 — Hoạt động chung và từng participant

**Actor/mục đích:** Hai actor quyết định có tham gia và xác nhận riêng. **Feature/US:** F02/F09/F01; US-009/036/037/048.

**Điểm vào, preconditions và permission:** Chọn activity chung, connection active và published audience phù hợp; không biến join của một người thành đồng ý người khác. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Actor A chọn partner → preview invite nội dung/time nếu có → explicit invite. B xem và accept/decline; backend mỗi participant tự ghi trạng thái. Start theo guards đã định; mỗi người lưu note riêng và tự complete/cancel. UI chỉ trạng thái tham gia/hoàn thành chung được phép, không private_note. Sự đồng thuận cho activity không thay connection/agreement.

**Data, người nhận, states/guards và forbidden transitions:** ActivityRun joint/RunParticipant, pin content/connection generation. invited → accepted/declined/expired → in_progress → completed/cancelled; complete chung chỉ khi đủ confirmations theo activity contract, không timer/admin auto-complete. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** B decline hoặc một người withdrawal kết thúc/partial theo rõ UX, không blame. Revoke connection chặn action chung còn lại nhưng owner private note giữ theo policy. Expiry invite chưa chốt TTL DEC-17; offline không accept cục bộ. Concurrent accept/cancel/complete transaction expected_revision, một participant record/actor.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-A instructions/audience/mode refs, CFG-C prompts; admin chỉ templates; TTL validation US-004 chưa auto config field không định nghĩa.

**Cần coder/hạ tầng/quyết định:** US-004/037/023 current participant state guards+index; proposed completion joint meaning phải chốt activity template.

**Acceptance/expected:** WT-14-01 — Mỗi participant tự accept/complete; private_note không sang partner; WT-14-02 — Invite không accept/admin complete thay; forbidden, không shared note; WT-14-03 — Revoke/decline/double complete đồng thời; state final không resurrect. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-15 — Thỏa ước và hai xác nhận cùng revision

**Actor/mục đích:** Hai actor tự duyệt cam kết chung, sửa phải xem lại. **Feature/US:** F02/F09/F15; US-009/036/037/048.

**Điểm vào, preconditions và permission:** Từ hoạt động chung có connection active; mẫu published chỉ gợi ý, không ký trước. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** Actor soạn từ mẫu hoặc chỉnh nội dung chung theo quyền → lưu AgreementRevision mới → cả hai xem toàn văn/revision → mỗi người bấm xác nhận riêng. Backend ghi Acceptance signer+revision unique và current generation. Chỉ cùng revision đủ hai accept mới confirmed. Bất kỳ sửa nội dung tạo proposal revision mới, phải hai bên xem/xác nhận lại; confirmed revision cũ vẫn áp dụng đến revision mới confirmed hoặc chủ động end/unlink. Withdraw/revoke rõ trạng thái không xóa lịch sử.

**Data, người nhận, states/guards và forbidden transitions:** AgreementRevision/AgreementAcceptance joint body được hai bên xem khi authorized; private notes không ghép vào. draft → awaiting_acceptance → confirmed hoặc superseded/withdrawn; không confirmed với accept v1+accept v2, không admin sign. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Stale revision409 giữ việc đã nhập không áp accept nhầm; edit+accept concurrency lock current revision. Double accept một record. Offline chỉ đọc snapshot allowed, không giả confirmed; resume fetch current. Unlink mất quyền chung failclosed theo generation, reconnect không hồi sinh confirmation. Consent/deletion xử lý FL-20.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-C04..C06 templates/title/prompts/terms; AF-01 không sửa body hay chữ ký xác nhận gia đình. Changed template chỉ lần soạn mới.

**Cần coder/hạ tầng/quyết định:** US-004/037/023 semantic withdrawal/retention DEC-12; required unique/transaction evidence.

**Acceptance/expected:** WT-15-01 — Hai signer accept cùng v1; confirmed v1, sửa sang v2 cần hai accept mới; WT-15-02 — v1+v2/admin/partner impersonation; không confirmed; WT-15-03 — Edit/accept/revoke cùng lúc; không lost revision/double sign/resurrection. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-16 — Con cần được lắng nghe và chọn điểm tựa khác

**Actor/mục đích:** Người dùng tự gửi tín hiệu hoặc tiếp cận hỗ trợ ngay. **Feature/US:** F10/F11/F13; US-032/035/039.

**Điểm vào, preconditions và permission:** CTA dễ thấy trên home/composer/help; không bị pause/AI/quota khóa; recipient phải do user chọn active. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI hỏi gửi lời “Con cần được lắng nghe” tới ai, hiển thị wording theo actor. Chọn/preview/explicit send như FL-08 nhưng help signal không qua pause. Không cần giải trình/AI. Nếu chưa có connection hoặc người kia chưa trả lời, UI cho tự chọn điểm tựa khác FL-03/17; mỗi message mới có preview và confirm mới. Gọi trợ giúp không chờ gửi signal hay trả lời. User chọn nhu cầu trò chuyện/ở bên/hẹn trao đổi trong preview; đây không tự đặt lịch hoặc auto-forward.

**Data, người nhận, states/guards và forbidden transitions:** Message kind listening_signal approved_body; recipient selected. composing → previewed → sent/read; no_reply không auto-forward hoặc escalation job. Admin không thấy tâm sự hoặc chẩn đoán từ signal. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Không recipient/connection revoked: giữ draft và mở help; timeout send outcome_unknown reconcile key. Offline gợi ý số public đã verified/fallback, không hứa signal đã chuyển. Double submit đúng một message; đổi recipient mất preview. Từ chối nhận/không reply không tạo bad score hoặc báo cáo cho giáo viên.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-B wording/pronouns/help guidance + CFG-F contacts; CFG-I02 help=true read-only. Không cấu hình delay/auto-forward.

**Cần coder/hạ tầng/quyết định:** US-032/035/039 cần handle actual availability; labels không bảo đảm staff 24/7 DEC-18.

**Acceptance/expected:** WT-16-01 — Trong pause bấm help/signal; được chọn recipient/preview/send độc lập và mở calls; WT-16-02 — Không reply/5 phút; không tự forward/send/thông báo cho giáo viên; WT-16-03 — Connection mất/network outcome chưa rõ; giữ nháp, đối soát và help công khai ngay. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-17 — Danh bạ, gọi và trợ giúp tức thì

**Actor/mục đích:** Người dùng tìm đầu mối có thật mà không bị cản trở. **Feature/US:** F13/F12; US-006/038/039.

**Điểm vào, preconditions và permission:** Help CTA/public fallback mọi trạng thái; không yêu cầu connection/enrollment/AI/consent nghiên cứu. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI list active consented verified contact theo scope và giờ/timezone, review_due current. Hiện giờ mở, loại giúp, giới hạn tiếp nhận và alternative; tap phone mở hệ điều hành để user tự gọi. Không app/admin gọi hoặc gửi tâm sự thay. Backend public snapshot không private danh tính riêng của staff; fallback đã duyệt offline/errors. Contact stale/inactive không hiện như đang nhận, có đường thay thế rõ.

**Data, người nhận, states/guards và forbidden transitions:** SupportContact public fields approved; không journal/AI attached. available → outside_hours/unavailable/retired theo lịch/live status, không message-delivery state. Nhấn call không biết kết quả tư vấn, không đánh dấu đã hỗ trợ. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Auth/AI/cooldown error không block directory. Offline snapshot có ngày kiểm tra và cảnh báo stale; chỉ dùng approved fallback còn hiệu lực, không số giả. Contact retired khi màn hình mở phải refresh trước hứa tiếp nhận lịch; số đã copy đã biết không thể recall. Pagination bounds; duplicate tap không auto multiple call job.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-F01..F14 via AF-02: phone đã xác minh/consent/hours/tz/status/accepting; live disable ảnh hưởng ngay mọi pinned content thông qua contact ref; rollback không hồi sinh số không còn nhận.

**Cần coder/hạ tầng/quyết định:** DEC-18 owner actual helper/reverify cadence/emergency content professional approval; call test trên Zalo Android/iOS US-049.

**Acceptance/expected:** WT-17-01 — Contact đúng giờ verified; chữ dễ đọc/call user chọn và alternative; WT-17-02 — Auth/AI/pause lỗi và contact expired; help vẫn có fallback hợp lệ, không số đã retire; WT-17-03 — Admin sửa/tắt contact trong lúc mở; không booking/snapshot khẳng định dữ liệu stale. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-18 — Lịch hẹn có người tiếp nhận

**Actor/mục đích:** Requester tự hẹn; chỉ staff được giao xử lý note riêng. **Feature/US:** F12/F13; US-046/006/014.

**Điểm vào, preconditions và permission:** Từ contact accepting_appointments=true với actual assigned staff+availability; conditional feature, chưa bật chỉ từ docs. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** User chọn slot/tz và nhập note tối thiểu tùy chọn, xem ai nhận → explicit request. Backend guard contact đã xác minh/capacity, lưu proposed UTC start/end + display timezone; note chỉ requester và assigned staff. Staff được giao accept/decline/propose giờ mới; user tự accept giờ đã đề xuất lại trước confirmed. Cả hai được cancel theo policy. Admin dispatcher chỉ metadata vận hành, assign staff đủ điều kiện rõ ràng, không tự đọc note vì SYS.

**Data, người nhận, states/guards và forbidden transitions:** AppointmentRequest requester/assigned staff/revision/time/status + proposed AppointmentSlotReservation. requested → accepted/declined/reschedule_proposed → confirmed/cancelled/expired/completed; hoàn thành không diagnosis. Locks slot theo staff/time và states blocking được chốt; không chỉ check trước insert. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Không có người tiếp nhận/overlap/giờ quá khứ/contact retired: từ chối với đường help thay thế, không tạo promise. DST/timezone ambiguous cần user chọn explicit UTC/display; DEC-17. Thay đổi stale trả 409 phải review time mới; hai yêu cầu trùng lịch transaction uniqueness/range strategy trên MySQL cần proof. Offline không request/schedule tự động; resume đối soát operation key. Revoke/reassignment invalidates staff cũ note access, audit không note.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-F accepting/staff/hours/slot/assignment, AF-02; changes không tự cancel confirmed hẹn: tạo conflict task/thông báo consented kênh đã approved, staff phối hợp. Không Zalo push ngoài US-019.

**Cần coder/hạ tầng/quyết định:** US-046 optional beyond first commitment, DEC-18 operator thực tế+rules/notifications/slot schema trước bật module.

**Acceptance/expected:** WT-18-01 — Được giao staff accept/revise và user confirm; note chỉ hai bên, giờ UTC đúng; WT-18-02 — SYS/dispatcher không assigned đọc note/không có operator; deny hoặc module off, help vẫn mở; WT-18-03 — Hai user trùng slot/double confirm/reassign; tối đa capacity, 409, current ACL. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-19 — Khảo sát tự nguyện và nghiên cứu aggregate

**Actor/mục đích:** Participant tự đồng ý theo phase; researcher chỉ report an toàn. **Feature/US:** F14/F15; US-010/040/045/025/052.

**Điểm vào, preconditions và permission:** Survey slot cohort/phase/audience phù hợp, consent research riêng; bỏ qua không mất sản phẩm/help. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI đọc version form+purpose/withdrawal → opt-in → answer schema/required đúng loại → preview submit → backend recheck participation/cohort/current version & validation rồi freeze submitted response. Trước/sau là slot riêng không tự mở rộng nghiên cứu. Research admin design/publish AF-03; chỉ aggregate khi policy k/suppression/differencing được chốt; export bounded đúng scope/current consent. Không admin xem raw hay mapping nhận diện.

**Data, người nhận, states/guards và forbidden transitions:** ResearchCohort/Participation(pseudonym protected)/CohortSurvey/SurveyVersion/Question/Response/Answer. not_participating → consented → response draft → submitted; withdrawn loại response khỏi aggregates theo ledger. Response submitted immutable; form revision mới không gộp âm thầm kết quả khác question/version/audience. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Form đổi khi trả lời: giữ version pin hoặc báo closed rõ không chuyển input sang version mới; validation stale trả 409. Double submit unique participation+slot, key hash idempotent. Offline/resume verify consent/slot; không auto-submit. Withdrawal/filter nhỏ/changing filters và overlapping reports phải suppression including complementary cells; report stale bị vô hiệu hóa. k=null failclosed, admin không tự hạ floor.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-G01..G17 AF-03 cohort/form/question/options/validation/audience/phase; report policy floor read-only theo approved research/privacy; CFG-I survey off giữ draft/withdrawal.

**Cần coder/hạ tầng/quyết định:** DEC-15/23/12: k/differencing/paired reports/consent học sinh chưa thành niên/retention trước data/export, MySQL counts/ACL evidence.

**Acceptance/expected:** WT-19-01 — Opt-in version form submit; skipped survey không ảnh hưởng program/help; WT-19-02 — SYS/raw/mapping/cross-school/k-null report; deny, không export small groups; WT-19-03 — Form responses+revision/double submit/withdraw/filter difference; freeze+exclude+suppression. Chi tiết đầu vào/evidence ở workflow-acceptance.

## FL-20 — Revoke, unlink, reconnect, xóa và cache

**Actor/mục đích:** Owner thu hồi quyền cụ thể, không bị admin giả consent. **Feature/US:** F15/F01/F07/F08/F14; US-017/023/018/012/048.

**Điểm vào, preconditions và permission:** Settings quyền riêng tư hoặc từng grant; owner phiên hợp lệ, action nhạy cảm step-up đã chốt; request xóa có receipt không khẳng định xóa ngay. Quyền chi tiết theo access matrix; không admin override.

**Bước user/UI/backend:** UI phân biệt revoke item, rút consent, unlink connection và deletion. Owner chọn scope/xem impacts → explicit confirm → backend transaction revoke grants/generation/consent hoặc tạo DeletionRequest và durable ledger; invalidate cache/sessions có scope. Reconnect cần lời mời hai phía generation mới, không hồi sinh grants/messages/agreement acceptance cũ. Deletion worker có authorized ops theo AF-06, outcome notice không body; restore phải áp lại ledger trước serve.

**Data, người nhận, states/guards và forbidden transitions:** Grants/Connection/ConsentRecord/ResearchParticipation/DeletionRequest/AuditEvent+proposed DeletionRevocationLedger. active → revoked; deletion requested → verified → processing → completed/failed_needs_action, hoặc rejected nếu không xác minh/scope không hợp lệ theo policy. Revoked không active lại bằng rollback; deletion không tự completed từ UI. Recipient sent history policy DEC-13 chưa chốt, failclosed người khác body. State machine chuẩn ở workflow-state-machines; common guards ở quy ước trên cũng bắt buộc.

**Lỗi, từ chối/hủy/hết hạn, offline/resume, stale/revoke/concurrency:** Send/read/share đang race phải current generation/transaction lock guards: sau revocation commit không new read/send. Offline cache purge upon resume và không cấp offline private grant mới; không recall screenshot. Hủy yêu cầu trước processing chỉ theo policy được chốt DEC-12; đã processing không hứa undo, revoke/consent withdrawal terminal cho revision đó. Double request idempotent giữ receipt; unknown fetch status owner only. Deletion partial failure report pending/retry bounded, không fake completed; backup deletion retention DEC-12.

**Side effects/cache/audit:** Thực hiện đúng phần quy ước, chỉ event của transition nêu trên; không push ngoài scope, không log body. Các grants/private data dùng cache owner/recipient+revision+generation, invalidate khi thay quyền; public content theo effective revision.

**Admin content/config và ảnh hưởng:** CFG-J privacy assigned scope/status/notice/ledger/backup, AF-06; Catalog H lock/revoke không admin unlink/consent thay. Config rollback không undo revocation/deletion.

**Cần coder/hạ tầng/quyết định:** DEC-12/13/14/18, US-017/023/018 MySQLrace/recovery ledger/provider deletion/live scopes.

**Acceptance/expected:** WT-20-01 — Revoke item và unlink; subsequent read denied, reconnect không hồi sinh grant; WT-20-02 — Admin unlink/consent giả hay rollback/restore old ledger; denied/không hồi sinh quyền; WT-20-03 — Send/read/deletion race, partial failure và resume; failclosed, receipt đúng sự thật, ledger đã áp lại. Chi tiết đầu vào/evidence ở workflow-acceptance.

## Luồng quản trị nối với luồng người dùng

Không hệ thống tách rời: mỗi AF dùng CFG sources và áp dụng quyền/state cùng backend. Các vị trí là màn hình thiết kế, chưa triển khai. Xem [bàn giao](../operations/admin-handover.md) cho thao tác không viết code.

## AF-01 — Nội dung, nhận diện và policy

**Actor/mục đích, US:** R-CONTENT/R-SYS được cấp CAP-01..06 trong scope; chuyên môn/pháp lý cần người phụ trách thực sự duyệt; US-014/020/024/005/007/009/041/047. **Feature:** F12/F15 và các F bị tác động trong config phía dưới.

**Điểm vào/preconditions/permission:** Admin → Nội dung / Nhận diện / Đồng ý. Xem catalog A..E, version current và các enrollment/runs đang tham chiếu; chỉ role phù hợp mới thấy action. Published không editable.

**Bước user/UI/backend:** Tạo hoặc nhân bản draft từ bản đã phát hành; chỉnh từng field typed, lý do thay đổi; preview theo audience và small screen gần UI thật. Bấm Lưu xem lại để khóa snapshot revision + hash validation; nếu sửa tiếp phải review lại. Có CAP publish thì người vừa edit được tự xem lại/xác nhận riêng, audit ghi cùng actor đúng sự thật. Policy chuyên môn/legal cần approval_ref hợp lệ của người phụ trách; quyền publish không thay thẩm định. Publish transaction tạo release immutable, current pointer chỉ cho người dùng mới; retire/archive tham chiếu thay hard delete. Rollback clone bản cũ thành draft, validate refs an toàn hiện tại và publish bản mới.

**Data/state/guards/forbidden:** ProgramVersion/WeekTopic/ContentRevision + PolicyVersion/BrandRelease/ContentReview/ReleaseRecord đề xuất. Draft → Review → Published → Retired → Archived. Không direct Draft→Published không preview/review; không week_count khác 4; không đụng journal/agreement/consent người dùng. Số hỗ trợ dùng current contact ref không chép stale phone vào nội dung pin.

**Lỗi/từ chối/hủy/expiry/offline/stale/revoke/concurrency:** Preview/stale 409 giữ draft, hai admin phải reload/compare; publish lặp cùng key chỉ một release, key khác vẫn unique effective release theo expected pointer. Validation thiếu refs/audience/contrast/approval thì block. Cancel review về Draft không release; draft không referenced được xóa theo quyền và audit, published không hard delete. Offline không auto publish. Tắt/retire nội dung unsafe phải alternative và policy DEC-20 cho pin cũ. Bulk preview ID/scope/count ≤50 đề xuất, confirm rõ từng outcome, không bulk publish bypass.

**Side effects/cache/audit:** Mutation ghi actor, cap, scope, target/revision, reason, server time, outcome/request ID; không nhạy cảm trong before/after. Invalidate effective content/config hoặc permission cache theo scope, không cross-tenant broadcast nội dung riêng. Không auto-notify Zalo, không external provider call trong transaction.

**Config và tác động từng user flow:** Catalog các nhóm A/B/C/D/E; tất cả FL-01/04/06..17/19 theo source/ref riêng, không đổi body riêng hoặc enrollment pin. Consent mới chỉ ảnh hưởng lời mời đồng ý/version mới; font/lib không tự thêm.

**Cần coder/hạ tầng/quyết định:** DEC-17/20/21/22/23; coder làm schema/preview/lifecycle/contracts, unit cung cấp logo 03 hợp lệ chưa có asset; upload chưa MVP.

**Acceptance:** AT-01-01 — Đổi chủ đề tuần 2, thêm thẻ, ẩn bài học và publish bằng cùng một người có đủ caps; release mới và enrollment cũ giữ pin; AT-01-02 — Rollback policy/contact/brand lỗi hoặc thay consent; block refs stale/contrast thấp, không tự consent/hồi sinh grant; AT-01-03 — Hai editor và double publish/bulk;409 đúng snapshot, một release, audit actor/reason không body riêng. Expected; runtime NOT_RUN, chỉ chuyển PASS khi có bằng chứng thực.

## AF-02 — Danh bạ, phân công tiếp nhận và lịch hẹn

**Actor/mục đích, US:** R-DIRECTORY/R-SYS CAP-07/08/09; R-STAFF CAP-10 chỉ request được giao; US-006/014/024/038/039/046/041. **Feature:** F12/F15 và các F bị tác động trong config phía dưới.

**Điểm vào/preconditions/permission:** Admin → Hỗ trợ → Danh bạ / Lịch tiếp nhận / Phân công. Cần scope SYSTEM hoặc SCHOOL rõ; request note không hiện trên bảng điều phối.

**Bước user/UI/backend:** Tạo/sửa đầu mối draft: phone/hours/timezone/type, bằng chứng đồng ý/verify/review_due; preview public rồi publish. Đổi phone/identity/hours/timezone invalidate verification receipt cũ, yêu cầu xác minh và consent phạm vi mới trước publish. Người phụ trách cập nhật availability/accepting; không có staff và slot thì booking off. Dispatcher chọn staff qualified trong scope bằng explicit assignment; UI xem metadata tối thiểu, lý do; backend revoke người cũ ngay khi reassignment. Staff vào request được giao để đọc note/accept/decline/propose time theo FL-18. Tạm ngừng contact mất tiếp nhận có hiệu lực safety ngay, hướng alternative và xử lý các hẹn còn mở bằng người thật.

**Data/state/guards/forbidden:** SupportContact/RoleAssignment/AppointmentRequest + availability/slot proposed; contact draft/verified_active/suspended/retired. Assignment metadata không cấp toàn trường đọc notes. System Administrator chỉ đọc note khi được phân công thật với CAP-10, không auto-assign toàn bộ để đọc hàng loạt. Không contact publish từ consent=false/unverified/expired.

**Lỗi/từ chối/hủy/expiry/offline/stale/revoke/concurrency:** Phone invalid/hours không có timezone/review_due qua hạn: reject hoặc suspend public và fallback. Chồng lịch/kết thúc trước bắt đầu:409/validation. Hai dispatcher expected_revision tránh lost assignment; staff cũ thao tác sau revoke 403. Offline không save verify/publish giả; timeout query key. Rollback số cũ phải verify hiện tại, không undo retirement mù. Cancel booking theo workflow chứ không delete rows.

**Side effects/cache/audit:** Mutation ghi actor, cap, scope, target/revision, reason, server time, outcome/request ID; không nhạy cảm trong before/after. Invalidate effective content/config hoặc permission cache theo scope, không cross-tenant broadcast nội dung riêng. Không auto-notify Zalo, không external provider call trong transaction.

**Config và tác động từng user flow:** CFG-F01..F14 tác động FL-16..18 ngay qua current safety status dù content pin; giờ thay không âm thầm đổi confirmed appointment. In-app notice đúng scope; external push vẫn gate US-019.

**Cần coder/hạ tầng/quyết định:** DEC-18/17/22, người tiếp nhận thật trước module; console phone/call và SDK tests cần thực hiện riêng.

**Acceptance:** AT-02-01 — Sửa số đã xác minh/giờ và assign staff; public cập nhật, note chỉ staff được giao; AT-02-02 — Unverified/retired/không staff hoặc SYS không assigned; không promise booking/read note; AT-02-03 — Reassign/overlap/rollback đồng thời; quyền cũ mất, slot không trùng, không revive contact stale. Expected; runtime NOT_RUN, chỉ chuyển PASS khi có bằng chứng thực.

## AF-03 — Form/cohort và báo cáo tổng hợp

**Actor/mục đích, US:** R-RESEARCH/R-SYS CAP-11/12/13 scope cohort/school/system không raw data; US-010/014/025/040/045/041/052. **Feature:** F12/F15 và các F bị tác động trong config phía dưới.

**Điểm vào/preconditions/permission:** Admin → Nghiên cứu → Forms / Cohorts / Báo cáo. Research purpose/consent, approval policy k và scope được cấp; chưa chốt suppression không export.

**Bước user/UI/backend:** Clone/tạo draft form → câu hỏi stable code/type/options/validation → chọn audience/phase và cohort pin program → preview như participant → review/publish frozen version. Có response thì tạo version mới, không edit existing response schema; quyết định cohort slot migration/version reporting phải rõ và không sửa response. Reports chỉ allowlisted dimensions, current consent, suppression + complementary/differencing policy, output bounded và export receipt/audit khử định danh.

**Data/state/guards/forbidden:** SurveyVersion/Question/CohortSurvey/ResearchCohort/Participation/Response/Answer + ResearchReportPolicy đề xuất; draft → reviewed → published/frozen → retired; submitted immutable. Aggregate only kể cả SYS; không participant identity mapping/download raw/free query, không mã SQL scoring.

**Lỗi/từ chối/hủy/expiry/offline/stale/revoke/concurrency:** Unknown option/type/phase/audience reject. Hai editor409; publish duplicate một release. Nhóm nhỏ hoặc policy unset: trả suppression/no report, không empty response giúp suy cá nhân. Withdraw invalidate cached reports/exports; lịch sử export cần policy hạn/không thể thu hồi file ngoài app. Offline không export/publish tự động; cancel không xóa submitted dữ liệu tùy tiện; privacy request AF-06.

**Side effects/cache/audit:** Mutation ghi actor, cap, scope, target/revision, reason, server time, outcome/request ID; không nhạy cảm trong before/after. Invalidate effective content/config hoặc permission cache theo scope, không cross-tenant broadcast nội dung riêng. Không auto-notify Zalo, không external provider call trong transaction.

**Config và tác động từng user flow:** CFG-G01..G17 và I flags; tác động FL-19, enrollment research độc lập FL-12. k floor/dimensions chỉ policy đã duyệt, không trường số tự do để admin hạ.

**Cần coder/hạ tầng/quyết định:** DEC-12/15/23/22; research reviewer chốt k/complementary/filter budget/paired version, coder test differencing trước report.

**Acceptance:** AT-03-01 — Clone form, publish audience/phase đúng; có response không sửa âm thầm, report theo version; AT-03-02 — SYS/cross-scope/raw/mapping/k chưa chốt hoặc hạ floor; denied/suppressed; AT-03-03 — Repeated filters/withdrawal/trộn version; không suy cá nhân, exclude current consent và audit export. Expected; runtime NOT_RUN, chỉ chuyển PASS khi có bằng chứng thực.

## AF-04 — Tài khoản, role/capability/scope/TTL và khôi phục

**Actor/mục đích, US:** R-SYS CAP-14/15/16/22 và grant delegable được cấp rõ; không tự nâng quyền; US-011/012/014/041/048. **Feature:** F12/F15 và các F bị tác động trong config phía dưới.

**Điểm vào/preconditions/permission:** Admin → Tài khoản & quyền. Principal current role scope/TTL và step-up đã được chốt DEC-14. Bootstrap SYSTEM lần đầu do owner unit quy trình riêng, không tất cả admin cũ được nâng.

**Bước user/UI/backend:** Mời account qua định danh an toàn; invite TTL, người nhận tự login/accept, không gửi secrets. Chọn role/caps allowlist + SYSTEM/SCHOOL/ASSIGNED_RESOURCE + scope ID + TTL + lý do. Backend check grantor delegable authority, không tự tăng own scope/caps; confirm diff và audit grant/revoke. Tạm khóa có căn cứ, mục đích/expiry và appeal; không xác nhận consent/connection/login thay. Revoke hiện tại invalidates sessions/cache quyền. Chuyển chủ quản tạo owner mới rõ, tự login/kiểm tra trước thu hồi cũ; lost account qua verified owner/runbook, không email tùy ý trở thành admin.

**Data/state/guards/forbidden:** User limited metadata/RoleAssignment/AdminInvite/AccountRecovery case đề xuất. invited→accepted/expired/cancelled; grant active→expired/revoked; account active→restricted→restored by authorized case. Role combination hợp lệ, SCHOOL khác SYSTEM. Last viable SYSTEM admin owner giữ guard trong transaction; không revive expired grant tự động.

**Lỗi/từ chối/hủy/expiry/offline/stale/revoke/concurrency:** Grant ngoài authority/scope/tự nâng quyền/client is_staff/superuser:403. Concurrent revoke hai last admins: tối thiểu một viable owner hoặc recovery được phê duyệt, không lockout. Missing step-up/audit: failclosed mutation; help public không mất. Offline/retry không double invite/grant. Recovery không bypass family private ACL và không gửi credential trong logs/docs.

**Side effects/cache/audit:** Mutation ghi actor, cap, scope, target/revision, reason, server time, outcome/request ID; không nhạy cảm trong before/after. Invalidate effective content/config hoặc permission cache theo scope, không cross-tenant broadcast nội dung riêng. Không auto-notify Zalo, không external provider call trong transaction.

**Config và tác động từng user flow:** CFG-H01..H10, affects every FL current backend ACL; role quản trị không mở private/AI/raw survey. Không edit provider_subject/consent/connection trong admin.

**Cần coder/hạ tầng/quyết định:** DEC-14/18/22: ownership, step-up supported by provider/session, independent recovery owner và final-admin definition trước cấp thật.

**Acceptance:** AT-04-01 — Mời role nhỏ TTL đúng scope, một người nhiều role; thu hồi mất capability ngay, private ACL giữ; AT-04-02 — Self-elevation/cross-school/is_staff/superuser; denied, không mở private/raw data; AT-04-03 — Hai last-admin revoke/khóa + lost account; không lockout trái phép, recovery audit và step-up. Expected; runtime NOT_RUN, chỉ chuyển PASS khi có bằng chứng thực.

## AF-05 — Cấu hình sản phẩm, feature flags và AI

**Actor/mục đích, US:** R-SYS/R-OPS được cấp CAP-17/18 theo safe ranges đã duyệt; US-014/025/033/034/039/041. **Feature:** F12/F15 và các F bị tác động trong config phía dưới.

**Điểm vào/preconditions/permission:** Admin → Cấu hình → Modules / AI / Nhắc lịch. Module chỉ xuất hiện khi implementation có flag contract và fallback; module chưa code không thể bật bằng JSON.

**Bước user/UI/backend:** Xem effective revision/defaults và impact preview cho current users/drafts → edit typed allowed fields trong bounds → review/confirm → publish hoặc immediate kill switch theo policy. AI off nhanh khi sự cố, manual/help còn hoạt động; inflight recheck không apply stale. Reminders opt-in/timezone/quiet hours chỉ nếu scheduler đã được duyệt, không bulk Zalo notifications. Provider/model chọn registry đã kiểm tra; secret/key/endpoint storage do console server, không admin free URL/code.

**Data/state/guards/forbidden:** ProductConfig typed theo catalog I, ProviderRegistry server đề xuất, effective snapshots và change audit. draft→review→published; safety kill switch active→off audit current pointer. pause_seconds=300, auto_send=false, help_enabled=true immutable; không Python/SQL/JS eval hoặc unrestricted generic settings.

**Lỗi/từ chối/hủy/expiry/offline/stale/revoke/concurrency:** Unknown key/type/ngoài bounds/provider invalid:reject, không silently clamp. Stale config409, double publish một revision. Feature off chỉ stop new actions quy định, không xóa data/draft, privacy controls vẫn dùng; manual alternative rõ. Offline không config publish giả; old public snapshot không cấp authorization. Quota cảnh báo redacted, không private logs.

**Side effects/cache/audit:** Mutation ghi actor, cap, scope, target/revision, reason, server time, outcome/request ID; không nhạy cảm trong before/after. Invalidate effective content/config hoặc permission cache theo scope, không cross-tenant broadcast nội dung riêng. Không auto-notify Zalo, không external provider call trong transaction.

**Config và tác động từng user flow:** CFG-I01..I17 affects FL-04/08..14/16..19 theo catalog “module off”; safe min/max/quota tiền DEC-16 chưa chốt không UI tự đặt. Help/phút pause không editable.

**Cần coder/hạ tầng/quyết định:** DEC-16/17/19/22; coder feature flag/default schema/fallback tests, operator secret/billing/provider console.

**Acceptance:** AT-05-01 — AI off và module đã triển khai toggle; giữ draft/manual/help, effective config/audit đúng; AT-05-02 — Tắt help/đổi pause300/auto-send hoặc bật module chưa code; rejected; AT-05-03 — Nhập key/URL/Python/SQL/JS, sai type/stale/ngoài bounds; rejected, không network/eval. Expected; runtime NOT_RUN, chỉ chuyển PASS khi có bằng chứng thực.

## AF-06 — Vận hành, quyền riêng tư, audit và backup/restore

**Actor/mục đích, US:** R-OPS/R-SYS CAP-19/20/21/22 scope rõ; console operator quyền riêng; US-017/018/014/041/048. **Feature:** F12/F15 và các F bị tác động trong config phía dưới.

**Điểm vào/preconditions/permission:** Admin → Vận hành / Yêu cầu quyền riêng tư / Audit. Chỉ sanitized health/quotas/task metadata; không DB download hoặc truy cập journal vì vận hành.

**Bước user/UI/backend:** Triage service errors khử dữ liệu, assign privacy case đúng staff, xem request owner/scope/receipt tối thiểu; thực hiện worker được thiết kế, cập nhật outcome truthful và in-app result. Audit filter actor/action/outcome/time/reference không body. Với backup/restore: owner authorize step-up và change ticket; operator dùng console/runbook, backup encrypted restricted, restore staging cách ly → reconcile latest deletion/revocation ledger + grants/consent + migration compatibility → kiểm tra → mới serve. Không nút tải toàn DB từ Mini App.

**Data/state/guards/forbidden:** DeletionRequest/AuditEvent/DeletionRevocationLedger/PrivacyCase/BackupManifest/RestoreJob/checkpoint proposed; case requested→processing→completed/failed_needs_action. Restore requested→isolated→ledger_applied→validated→serving; không serving từ isolated hoặc ledger_stale. Expired roles/deleted users/revoked consent không sống lại.

**Lỗi/từ chối/hủy/expiry/offline/stale/revoke/concurrency:** Worker partial fail giữ pending receipt+bounded retries; timeout không mark completed. Audit unavailable failclosed sensitive writes với recovery; help công khai vẫn có fallback. Missing owner/ledger checkpoint/quyền backup: dừng restore, escalate operator; không dùng DB cũ để serve raw. Concurrent delete lúc restore cần drain/reconcile tới cutover atomic checkpoint, authorize queries before pagination. Offline audit request không dump cache; bulk operations preview scope/limit.

**Side effects/cache/audit:** Mutation ghi actor, cap, scope, target/revision, reason, server time, outcome/request ID; không nhạy cảm trong before/after. Invalidate effective content/config hoặc permission cache theo scope, không cross-tenant broadcast nội dung riêng. Không auto-notify Zalo, không external provider call trong transaction.

**Config và tác động từng user flow:** CFG-J01..J12, H recovery/currentroles; impacts FL-01/05/07/11/19/20 và safety all flows. Retention chưa chốt không xóa audit vô hạn hoặc giữ dữ liệu vô hạn. Resultnotice không private payload.

**Cần coder/hạ tầng/quyết định:** DEC-12/14/18/22; Render/MySQL/Zalo/GitHub/provider billing/keys/backup consoles; RPO/RTO/ledger durability drills phải nghiệm thu bằng synthetic data.

**Acceptance:** AT-06-01 — View sanitized health/audit, privacycase truthful; không tải toàn DB/body logs; AT-06-02 — Restore backup trước delete/revoke; reapply ledger trước serve, không resurrect account/grant/consent; AT-06-03 — Bulk/page/retry bounds và audit failure/partial deletion; không fake completed,help vẫn mở. Expected; runtime NOT_RUN, chỉ chuyển PASS khi có bằng chứng thực.
