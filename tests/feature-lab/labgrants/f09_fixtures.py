"""TEST-ONLY doubles for F09: published content (activities + micro
lessons, with retired/draft edges) via the PublishedContentReader shape."""

_CONTENT = [
    {"content_key": "act-chat-5", "kind": "activity", "revision": 1,
     "title": "Trò chuyện 5 phút", "audience": "joint", "status": "published",
     "body": "Cả nhà dành 5 phút nghe nhau nói mà không phán xét.",
     "minutes": 5},
    {"content_key": "act-meal", "kind": "activity", "revision": 2,
     "title": "Bữa cơm không điện thoại", "audience": "joint",
     "status": "published", "body": "Một bữa ăn không điện thoại.",
     "minutes": 30},
    {"content_key": "act-walk", "kind": "activity", "revision": 1,
     "title": "Đi dạo cùng nhau", "audience": "joint", "status": "published",
     "body": "Đi dạo 15 phút cùng nhau.", "minutes": 15},
    {"content_key": "act-call", "kind": "activity", "revision": 1,
     "title": "Gọi khi xa nhà", "audience": "student", "status": "published",
     "body": "Gọi điện hỏi thăm khi ở xa.", "minutes": 10},
    {"content_key": "lesson-listen", "kind": "micro_lesson", "revision": 1,
     "title": "Lắng nghe 60 giây", "audience": "caregiver",
     "status": "published",
     "body": "60 giây: nghe hết ý con trước khi góp ý.", "minutes": 1},
    {"content_key": "act-retired", "kind": "activity", "revision": 3,
     "title": "Đã nghỉ", "audience": "joint", "status": "retired",
     "body": "Khóa dùng nữa.", "minutes": 5},
    {"content_key": "lesson-draft", "kind": "micro_lesson", "revision": 1,
     "title": "Bản nháp", "audience": "caregiver", "status": "draft",
     "body": "Chưa duyệt.", "minutes": 1},
]


class TestContentReader:
    def list_published(self, *, kind=None, audience=None, limit=50):
        return [dict(c) for c in _CONTENT]
