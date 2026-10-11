"""TEST-ONLY program content (4 weeks + agreement template). Synthetic
content — production copy needs Thầy duyệt (US-009) via B16 lifecycle.

Faithful to the immutability contract: re-publishing creates a NEW
revision while previously published revisions remain retrievable (pinned
enrollments keep working)."""


class TestProgramProvider:
    def __init__(self) -> None:
        self.published = [self._snapshot(revision=1, agreement_revision=1)]

    def _snapshot(self, *, revision: int, agreement_revision: int) -> dict:
        weeks = [
            {"week_no": 1, "title": "Nhận diện cảm xúc",
             "goals": ["Gọi tên cảm xúc"],
             "student_guide": "Ghi lại 1 cảm xúc mỗi ngày.",
             "caregiver_guide": "Nghe không phán xét.",
             "joint_activity_keys": ["act-chat-5"]},
            {"week_no": 2, "title": "Bớt so sánh",
             "goals": ["Ghi nhận cố gắng"],
             "student_guide": "Kể 1 việc con tự hào.",
             "caregiver_guide": "Khen nỗ lực, không khen điểm.",
             "joint_activity_keys": ["act-meal"]},
            {"week_no": 3, "title": "Ranh giới riêng tư",
             "goals": ["Thống nhất không gian riêng"],
             "student_guide": "Nêu 1 điều con muốn riêng.",
             "caregiver_guide": "Thương lượng thay vì kiểm soát.",
             "joint_activity_keys": ["act-walk"]},
            {"week_no": 4, "title": "Cảm ơn và xin lỗi",
             "goals": ["Thỏa ước gia đình mới"],
             "student_guide": "Viết lời cảm ơn/xin lỗi.",
             "caregiver_guide": "Cùng ký thỏa ước.",
             "joint_activity_keys": ["act-call"]},
        ]
        return {
            "program_key": "family-4w",
            "revision": revision,
            "title": "Đồng hành 4 tuần",
            "status": "published",
            "weeks": weeks,
            "agreement": {
                "revision": agreement_revision,
                "title": "Thỏa ước gia đình mới",
                "commitments": ["Nghe nhau không phán xét",
                                "Tôn trọng không gian riêng"],
            },
        }

    def list_programs(self):
        # oldest -> newest; all published revisions remain retrievable
        return [dict(snapshot) for snapshot in self.published]

    def republish(self):
        last = self.published[-1]
        self.published.append(self._snapshot(
            revision=last["revision"] + 1,
            agreement_revision=last["agreement"]["revision"] + 1))
