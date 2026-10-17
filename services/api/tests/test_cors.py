from fastapi.testclient import TestClient

from app.main import create_app


def test_local_mobile_web_origin_can_call_api() -> None:
    app = create_app("sqlite://", "a-cors-test-secret-key-with-more-than-32-bytes", create_schema=True)
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/providers/discover",
            headers={
                "Origin": "http://192.168.100.214:8081",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://192.168.100.214:8081"
