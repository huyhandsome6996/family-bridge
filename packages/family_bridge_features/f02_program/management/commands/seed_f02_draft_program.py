"""Lenh quan tri: nap NOI DUNG DRAFT chuong trinh "Dong hanh bon tuan"
(F02) + 4 hoat dong chung tham chieu F09 vao thu vien noi dung B16.

KHONG TU PUBLISH: tat ca cac item duoc tao o trang thai draft — viec
duyet/publish thuoc nhiem vu nguoi co capability content.publish (B16
lifecycle WF-15). Provider F02 chi doc trang thai published (fail-closed),
nen cho den khi thay/nguoi phu trao duyet va publish, API chuong trinh se
tra loi trung thuc "chua co noi dung phat hanh" (404 program_not_published /
catalog rong) — khong bao gio hien noi dung synthetic nhu da duyet.

Idempotent: content_key da ton tai (bat ky trang thai nao) thi skip — khong
sua, khong ghi de, khong clone ho item cua nguoi khac.

Chay: python manage.py seed_f02_draft_program [--json]
"""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from family_bridge_features.admin_core.models import ContentItem
from family_bridge_features.admin_core.services.admin import (
    ContentLifecycleService,
)

PROGRAM_KEY = "dong-hanh-bon-tuan"
PROGRAM_TITLE = "Đồng hành bốn tuần"

WEEKS_BODY = {
    "weeks": [
        {
            "week_no": 1,
            "title": "Nhận diện cảm xúc — Tiếng lòng chưa nói",
            "goals": [
                "Gọi tên được ít nhất một cảm xúc của mình mỗi ngày",
                "Chia sẻ với người đồng hành một điều buồn/khó mở lời (khi sẵn sàng)",
                "Người đồng hành luyện nghe không phán xét",
            ],
            "student_guide": (
                "Tuần này chỉ có một nhiệm vụ nhỏ: dám gọi tên cảm xúc của mình. "
                "Mỗi tối, chọn một từ cho cảm xúc trong ngày (vui, bình an, lo, mệt, "
                "khó nói thành lời) và ghi vào app hoặc sổ giấy — chỉ mình bạn thấy. "
                "Khi sẵn sàng, hãy chia sẻ với người đồng hành MỘT điều mà bạn chưa "
                "nói ra được. Không cần kể hết — chỉ cần câu mở đầu: 'Dạo này con/mình "
                "đang thấy…'. Bạn hoàn toàn có thể bỏ qua ngày nào đó, không ai chấm "
                "điểm. Nếu chưa muốn chia sẻ, đó cũng là một lựa chọn đúng."
            ),
            "caregiver_guide": (
                "Tuần này con tập gọi tên cảm xúc — việc của anh/chị là LẮNG NGHE, "
                "không sửa, không dạy, không so sánh. Khi con chia sẻ, chỉ cần: 'Cảm "
                "ơn con đã kể', 'Nghe ra là con đã cố gắng lắm'. Tránh hỏi dồn 'Tại "
                "sao', tránh khuyên ngay. Nếu con chưa nói gì, đừng ép — hãy tự chia "
                "sẻ một cảm xúc nhỏ của chính anh/chị trong ngày để con thấy được "
                "lắng nghe là việc hai chiều. Ghi lại cho mình một câu con nói mà "
                "anh/chị muốn nhớ."
            ),
            "joint_activity_keys": ["f09-w1-tieng-long-chua-noi"],
        },
        {
            "week_no": 2,
            "title": "Giảm so sánh — Bản sắc riêng của con",
            "goals": [
                "Ghi nhận một nỗ lực cụ thể của con/người kia (không so với ai)",
                "Luyện nghe 10 phút không ngắt lời",
                "Dành một khoảng thời gian nhỏ cho nhau mỗi ngày",
            ],
            "student_guide": (
                "Tuần này mình tập nhìn lại chính mình, không nhìn sang người khác. "
                "Mỗi ngày, ghi lại MỘT việc bạn đã làm được (dù nhỏ: dậy đúng giờ, "
                "hỏi bài, giúp việc nhà). Cùng người đồng hành dành 10 phút nghe nhau "
                "nói — một người nói, một người nghe, rồi đổi vai. Bạn được chọn chủ "
                "đề bất kỳ: trò chơi, bài học khó, một bộ phim. Sổ giấy vẫn dùng được "
                "như mọi tuần."
            ),
            "caregiver_guide": (
                "Câu thần chú tuần này: 'so với HÔM QUA của con, không so với con nhà "
                "người'. Mỗi ngày tìm một nỗ lực cụ thể để ghi nhận: 'Hôm nay mẹ thấy "
                "con tự vào bàn học lúc 7 giờ — con chủ động lắm'. Tránh khen chung "
                "chung ('con giỏi') — khen cụ thể giúp con thấy bản sắc riêng. Khi "
                "nghe con nói 10 phút, để điện thoại xa một tay. Đừng biến buổi nghe "
                "thành buổi kiểm tra bài vở."
            ),
            "joint_activity_keys": ["f09-w2-ban-sac-rieng"],
        },
        {
            "week_no": 3,
            "title": "Ranh giới riêng tư và niềm tin",
            "goals": [
                "Thống nhất một ranh giới riêng tư hai bên cùng tôn trọng",
                "Điện thoại/thông tin riêng: hỏi trước khi xem",
                "Thử dùng trạng thái 'Chỉ mình tôi' cho một ghi chú riêng",
            ],
            "student_guide": (
                "Riêng tư không có nghĩa là giấu giếm — đó là sự tôn trọng. Tuần này, "
                "cùng người đồng hành thống nhất MỘT ranh giới (ví dụ: không đọc tin "
                "nhắn của nhau, gõ cửa trước khi vào phòng). Trong app, mọi ghi chú "
                "cảm xúc và nhật ký mặc định là 'Chỉ mình tôi' — bạn tự quyết định có "
                "chia sẻ hay không, và có thể rút lại. Nếu anh/chị muốn xem điều gì, "
                "bạn có quyền nói 'để mình chuẩn bị rồi mình chia sẻ'."
            ),
            "caregiver_guide": (
                "Niềm tin lớn lên từ sự tôn trọng ranh giới. Tuần này hãy cùng con "
                "chốt một ranh giới cụ thể và TÔN TRỌNG nó cả tuần — kể cả khi lo "
                "lắng. Quy tắc đề xuất: muốn biết điều gì thì HỎI thẳng, không lục "
                "điện thoại/nhật ký. Nếu anh/chị lo cho con, hãy nói thẳng điều lo: "
                "'Mẹ lo, con có thể kể cho mẹ nghe không?' thay vì tìm cách xem lén. "
                "Con được từ chối — và đó không phải là bất hiếu."
            ),
            "joint_activity_keys": ["f09-w3-ranh-gioi-tin-tuong"],
        },
        {
            "week_no": 4,
            "title": "Cảm ơn, xin lỗi và Thỏa ước gia đình mới",
            "goals": [
                "Nói một lời cảm ơn hoặc xin lỗi cụ thể với nhau",
                "Cùng chọn những việc cụ thể muốn tiếp tục làm sau chương trình",
                "Hai bên cùng xác nhận thỏa ước cùng phiên bản",
            ],
            "student_guide": (
                "Tuần cuối — mình cùng giữ lại những gì đã tốt. Hãy nghĩ về một điều "
                "bạn muốn CẢM ƠN hoặc XIN LỖI người đồng hành (cụ thể, ngắn gọn). Sau "
                "đó, hai bên cùng chọn vài việc cụ thể muốn tiếp tục làm (mục 'Thỏa "
                "ước gia đình mới') và mỗi người tự bấm xác nhận — thỏa ước chỉ có "
                "hiệu lực khi CẢ HAI cùng xác nhận cùng phiên bản. Không có hiệu lực "
                "pháp lý — đó là lời hứa thân tình với nhau."
            ),
            "caregiver_guide": (
                "Tuần này là tuần của lời cảm ơn và lời xin lỗi — cả hai chiều. Hãy "
                "nói với con một lời cảm ơn cụ thể về tuần qua, và nếu có sai sót, một "
                "lời xin lỗi thật lòng (con học được cách nhận lỗi nhiều hơn từ cách "
                "anh/chị nhận lỗi). Về Thỏa ước gia đình mới: cùng con chọn những việc "
                "CẢ HAI bên thấy khả thi — đừng ôm hết phần việc về mình, cũng đừng "
                "đẩy hết cho con. Mỗi người tự xác nhận trong app; bản đã xác nhận "
                "được đọc lại bất cứ lúc nào."
            ),
            "joint_activity_keys": ["f09-w4-thoa-uoc-moi"],
        },
    ],
    "agreement": {
        "revision": 1,
        "title": "Thỏa ước gia đình mới",
        "commitments": [
            "Mỗi tuần có ít nhất một khoảng thời gian nói chuyện riêng không điện thoại",
            "Gọi tên cảm xúc thay vì trách móc",
            "Không so sánh con với ai — so với chính con hôm qua",
            "Tôn trọng ranh giới riêng tư đã thống nhất; muốn biết thì hỏi thẳng",
            "Cảm ơn và xin lỗi cụ thể, cả hai chiều",
        ],
    },
}

ACTIVITIES = [
    {
        "content_key": "f09-w1-tieng-long-chua-noi",
        "kind": "activity",
        "title": "Tiếng lòng chưa nói — trao nhau một điều",
        "body": {"steps": [
            "Mỗi người chuẩn bị một điều chưa nói ra (ghi sổ giấy hoặc trong app)",
            "Người student chọn thời điểm và mở đầu: 'Dạo này con/mình đang thấy…'",
            "Người caregiver chỉ lắng nghe và cảm ơn, không phán xét",
            "Cùng ghi lại một câu muốn nhớ lại sau chương trình",
        ]},
        "audience": "joint",
    },
    {
        "content_key": "f09-w2-ban-sac-rieng",
        "kind": "activity",
        "title": "Bản sắc riêng — nghe nhau 10 phút",
        "body": {"steps": [
            "Chủ đề bất kỳ con thích: game, phim, bài học, mong ước",
            "5 phút con nói, caregiver chỉ nghe; đổi vai 5 phút",
            "Cuối cùng mỗi người nói một nỗ lực cụ thể của đối phương tuần này",
        ]},
        "audience": "joint",
    },
    {
        "content_key": "f09-w3-ranh-gioi-tin-tuong",
        "kind": "activity",
        "title": "Ranh giới và niềm tin — chốt một quy ước",
        "body": {"steps": [
            "Cùng liệt kê 2–3 ranh giới riêng tư cần tôn trọng",
            "Chọn MỘT ranh giới để thỏa thuận tuần này",
            "Ghi lại quy ước bằng lời của hai bên (app hoặc sổ giấy)",
        ]},
        "audience": "joint",
    },
    {
        "content_key": "f09-w4-thoa-uoc-moi",
        "kind": "activity",
        "title": "Thỏa ước gia đình mới — cùng chọn và cùng xác nhận",
        "body": {"steps": [
            "Đọc lại các cam kết gợi ý trong Thỏa ước gia đình mới",
            "Cùng điều chỉnh thành các việc cụ thể, khả thi với gia đình mình",
            "Mỗi người tự bấm xác nhận trong app — đủ hai người mới thành thỏa ước",
        ]},
        "audience": "joint",
    },
]


class Command(BaseCommand):
    help = ("Nap noi dung DRAFT chuong trinh Dong hanh bon tuan (F02) + 4 "
            "hoat dong chung F09 vao thu vien B16. KHONG tu publish — "
            "cho nguoi co quyen duyet publish theo lifecycle WF-15.")

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true",
                            help="In summary JSON thay vi thong bao nguoi")

    def handle(self, *args, **options):
        service = ContentLifecycleService()
        summary = {"program": None, "activities": [], "skipped": [],
                   "ok": True, "published": False}
        existing_program = ContentItem.objects.filter(
            content_key=PROGRAM_KEY).first()
        if existing_program is not None:
            summary["skipped"].append(
                f"program:{PROGRAM_KEY} da ton tai "
                f"(status={existing_program.status}, revision="
                f"{existing_program.revision})")
        else:
            item = service.create_draft(
                actor_id="system:seed_f02_draft_program",
                kind="f02_program", title=PROGRAM_TITLE,
                body=json.dumps(WEEKS_BODY, ensure_ascii=False),
                audience="neutral", content_key=PROGRAM_KEY)
            summary["program"] = {"content_id": str(item.id),
                                  "content_key": PROGRAM_KEY,
                                  "status": item.status,
                                  "revision": item.revision}
        for activity in ACTIVITIES:
            if ContentItem.objects.filter(
                    content_key=activity["content_key"]).exists():
                summary["skipped"].append(
                    f"activity:{activity['content_key']} da ton tai")
                continue
            item = service.create_draft(
                actor_id="system:seed_f02_draft_program",
                kind=activity["kind"], title=activity["title"],
                body=json.dumps(activity["body"], ensure_ascii=False),
                audience=activity["audience"],
                content_key=activity["content_key"])
            summary["activities"].append({
                "content_id": str(item.id),
                "content_key": activity["content_key"],
                "status": item.status})
        if options["json"]:
            self.stdout.write(json.dumps(summary, ensure_ascii=False, indent=2))
        else:
            self.stdout.write(f"[F02] seed draft — program: "
                              f"{summary['program'] or summary['skipped']}")
            self.stdout.write(
                f"  Hoat dong: {len(summary['activities'])} tao; "
                f"{len([s for s in summary['skipped'] if s.startswith('activity')])} skip")
            self.stdout.write(
                "  Trang thai: DRAFT — can nguoi co content.publish duyet va "
                "publish (B16); truoc do API chuong trinh bao trung thuc chua "
                "co noi dung phat hanh.")
