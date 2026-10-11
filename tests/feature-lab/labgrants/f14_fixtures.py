"""TEST-ONLY doubles for F14: published survey forms (typed, no text) and
a synthetic research policy (DEC-15: real policy needs approval)."""

_FORMS = [
    {"form_key": "wellbeing-pre", "revision": 1, "title":
        "Khảo sát trước chương trình", "audience": "student",
     "cohort": "pilot-2026", "phase": "pre_post", "status": "published",
     "questions": [
         {"q_key": "mood_scale", "kind": "scale_1_5", "required": True},
         {"q_key": "share_comfort", "kind": "choice", "required": True,
          "choices": ["dễ", "bình thường", "khó"]},
         {"q_key": "hours_sleep", "kind": "number", "required": False},
     ]},
    {"form_key": "draft-form", "revision": 1, "title": "Bản nháp",
     "audience": "student", "cohort": "pilot-2026", "phase": "pre",
     "status": "draft", "questions": []},
    {"form_key": "text-form", "revision": 1, "title": "Có text tự do",
     "audience": "student", "cohort": "pilot-2026", "phase": "pre",
     "status": "published",
     "questions": [{"q_key": "free_text", "kind": "text", "required": False}]},
]


class TestFormProvider:
    def list_forms(self):
        return [dict(f) for f in _FORMS]


class SyntheticPolicy:
    """Synthetic policy for testing ONLY — DEC-15 real policy unset."""

    def __init__(self, *, minimum_group_size=5, version=1) -> None:
        self.minimum_group_size = minimum_group_size
        self.policy_version = version
        self.allowed_dimensions = ("phase",)

    def current_policy(self, *, cohort_id):
        return self
