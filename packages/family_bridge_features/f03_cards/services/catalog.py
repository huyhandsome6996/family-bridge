"""Card catalog service — published cards only, deny-by-default.

The provider port (owner B16 at integration) MUST return only published,
immutable-revision cards. This service defensively re-checks shape and
status so a misbehaving provider can never leak drafts/retired cards:
any card dict missing required keys or not status="published" is treated
as unavailable (fail closed, SEC-03).

list_cards is bounded: the API layer caps the result window at 50 items
(DEC-17 provisional bound) — no unbounded catalog dumps.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from ..services import registry

REQUIRED_CARD_KEYS = ("card_id", "version", "group_code", "title", "body",
                      "audience", "status")
MAX_CATALOG_WINDOW = 50


def _safe_card(raw: Optional[Dict]) -> Optional[Dict]:
    if not isinstance(raw, dict):
        return None
    for key in REQUIRED_CARD_KEYS:
        if key not in raw:
            return None
    if raw.get("status") != "published":
        return None
    try:
        version = int(raw["version"])
    except (TypeError, ValueError):
        return None
    return {
        "card_id": str(raw["card_id"])[:64],
        "version": version,
        "group_code": str(raw["group_code"])[:32],
        "title": str(raw["title"])[:120],
        "body": str(raw["body"]),
        "accent": str(raw.get("accent", ""))[:32],
        "audience": str(raw["audience"])[:16],
    }


class CardCatalogService:
    def list_cards(self, *, group_code: Optional[str] = None,
                   limit: int = MAX_CATALOG_WINDOW) -> Tuple[List[Dict], bool]:
        """Returns (cards, truncated). Published only; group filter optional;
        window bounded (no full dump)."""
        provider = registry.get_card_provider()
        if provider is None:
            return [], False
        raw_list = provider.list_cards(group_code=group_code or None)
        cards: List[Dict] = []
        for raw in raw_list or []:
            card = _safe_card(raw)
            if card is not None:
                cards.append(card)
        try:
            window = min(max(int(limit), 1), MAX_CATALOG_WINDOW)
        except (TypeError, ValueError):
            window = MAX_CATALOG_WINDOW
        truncated = len(cards) > window
        return cards[:window], truncated

    def get_published_card(self, *, card_id: str) -> Optional[Dict]:
        provider = registry.get_card_provider()
        if provider is None:
            return None
        return _safe_card(provider.get_card(card_id))

    def reply_suggestions(self, *, card: Dict, audience: Optional[str]) -> List[Dict]:
        """Published reply suggestions for the card's group; each item keeps
        its own audience tag. Suggestions are NOT replies (FL-11) — they are
        display-only text the recipient may edit and send explicitly."""
        provider = registry.get_card_provider()
        if provider is None:
            return []
        raw = provider.reply_suggestions(
            group_code=card.get("group_code", ""), audience=audience or None)
        out: List[Dict] = []
        for item in (raw or [])[:20]:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", ""))
            if not text or len(text) > 500:
                continue
            out.append({
                "code": str(item.get("code", ""))[:32],
                "text": text,
                "audience": str(item.get("audience", "neutral"))[:16],
            })
        return out
