"""F13 port registry — directory reader (B12/B13 content owner)."""

from __future__ import annotations

from typing import Callable, Optional

_directory_reader: Optional[Callable] = None


def register_directory_reader(fn: Callable) -> None:
    global _directory_reader
    if not (callable(fn) or hasattr(fn, "list_public_contacts")):
        raise ValueError("directory reader must implement the port")
    _directory_reader = fn


def reset_registries() -> None:
    global _directory_reader
    _directory_reader = None


def get_directory_reader() -> Optional[Callable]:
    return _directory_reader
