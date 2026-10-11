"""TEST-ONLY doubles for F08: published topic-prompt provider."""

_PROMPTS = [
    {"topic_code": "thu_nhap", "prompt_text":
        "Hôm nay có điều gì con muốn bố mẹ hiểu mà chưa nói được?",
     "status": "published"},
    {"topic_code": "ranh_gioi", "prompt_text":
        "Khoảnh khắc nào hôm nay con thấy được tôn trọng không gian riêng?",
     "status": "published"},
    {"topic_code": "loi_cam_on", "prompt_text":
        "Có lời cảm ơn nào con muốn gửi một người trong nhà không?",
     "status": "published"},
    {"topic_code": "prompt-nhap", "prompt_text": "BẢN NHÁP - không hiện.",
     "status": "draft"},
]


class TestPromptProvider:
    def list_prompts(self):
        return [dict(p) for p in _PROMPTS]
