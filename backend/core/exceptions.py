"""Stable error envelope for every API response.

B18 wiring: feature services raise family_bridge_core.FamilyBridgeError
subclasses; those are mapped first via exc.to_payload() (the B00 contract
envelope with its fixed HTTP_BY_CODE mapping). Everything else keeps the
scaffold behavior unchanged — DRF exceptions map through rest_framework's
handler with the scaffold code vocabulary; Cache-Control: no-store is
always applied on both paths.
"""
from rest_framework.response import Response
from rest_framework.views import exception_handler

from family_bridge_core.errors import FamilyBridgeError


def api_exception_handler(exc, context):
    if isinstance(exc, FamilyBridgeError):
        response = Response(exc.to_payload(), status=exc.http_status)
        response["Cache-Control"] = "no-store"
        return response
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {"error": {"code": getattr(exc, "default_code", "request_error"), "details": response.data}}
        response["Cache-Control"] = "no-store"
    return response
