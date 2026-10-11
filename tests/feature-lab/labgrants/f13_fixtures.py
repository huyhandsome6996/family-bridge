"""TEST-ONLY directory provider for F13 (verified entries + edge cases)."""


class TestDirectoryProvider:
    def __init__(self) -> None:
        self.raise_error = False

    def list_public_contacts(self, *, now=None):
        if self.raise_error:
            raise RuntimeError("db down (simulated)")
        return [
            {"contact_id": "sch-01", "public_name": "Phòng tham vấn trường",
             "phone": "02401234567", "hours": {"always": True},
             "tz_offset_hours": 7, "contact_type": "school",
             "accepting_appointments": True, "verified": True,
             "review_due": None, "status": "published",
             "provenance": "test fixture"},
            {"contact_id": "help-01", "public_name": "Tổng đài hỗ trợ",
             "phone": "111", "hours": {"start_hour": 8, "end_hour": 17},
             "tz_offset_hours": 7, "contact_type": "help",
             "accepting_appointments": False, "verified": True,
             "review_due": None, "status": "published",
             "provenance": "test fixture"},
            {"contact_id": "help-expired", "public_name": "Đầu mối hết hạn",
             "phone": "0999999999", "hours": {"always": True},
             "tz_offset_hours": 7, "contact_type": "help",
             "accepting_appointments": False, "verified": True,
             "review_due": "2020-01-01", "status": "published",
             "provenance": "test fixture"},
            {"contact_id": "help-unverified", "public_name": "Chưa xác minh",
             "phone": "0988888888", "hours": {"always": True},
             "tz_offset_hours": 7, "contact_type": "help",
             "accepting_appointments": False, "verified": False,
             "review_due": None, "status": "published",
             "provenance": "test fixture"},
            {"contact_id": "help-retired", "public_name": "Đã nghỉ",
             "phone": "0977777777", "hours": {"always": True},
             "tz_offset_hours": 7, "contact_type": "help",
             "accepting_appointments": False, "verified": True,
             "review_due": None, "status": "retired",
             "provenance": "test fixture"},
        ]
