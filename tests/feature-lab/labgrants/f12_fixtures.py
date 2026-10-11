"""TEST-ONLY doubles for F12: synthetic staff directory (capability gate)
and a school contact directory. Clearly test-only; production staff/
contacts come from B16 + Thầy verification (US-006)."""


class TestStaffDirectory:
    def __init__(self) -> None:
        self.handlers = set()
        self.revoked = set()

    def add_handler(self, user_id):
        self.handlers.add(str(user_id))

    def revoke(self, user_id):
        self.revoked.add(str(user_id))

    def list_handlers(self):
        return sorted(self.handlers - self.revoked)

    def has_capability(self, user_id):
        return str(user_id) in self.handlers and \
            str(user_id) not in self.revoked


class TestSchoolDirectory:
    def list_public_contacts(self, *, now=None):
        return [
            {"contact_id": "school-counselor-01",
             "public_name": "Phòng tham vấn học đường",
             "phone": "02401234567", "hours": {"always": True},
             "tz_offset_hours": 7, "contact_type": "school",
             "accepting_appointments": True, "verified": True,
             "review_due": None, "status": "published"},
        ]
