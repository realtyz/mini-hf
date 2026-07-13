"""Unit tests for the acceleration probe endpoint.

Pure unit tests - no DB, no S3. Uses Starlette's TestClient against the ASGI app.
"""

from fastapi.testclient import TestClient

from ms_server.main import app


def test_internal_acceleration_info_returns_empty():
    client = TestClient(app)
    resp = client.get("/api/v1/repos/internalAccelerationInfo")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_internal_acceleration_info_is_object_not_null():
    """The probe checks for a body with ``Data.InternalRegionQueryAddress``;
    an empty object (not null/missing) is required."""
    client = TestClient(app)
    resp = client.get("/api/v1/repos/internalAccelerationInfo")
    body = resp.json()
    assert isinstance(body, dict)
    assert "Data" not in body


def test_root_endpoint():
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["message"] == "Welcome to mini-hf ModelScope API"
