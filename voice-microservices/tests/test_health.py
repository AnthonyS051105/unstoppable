"""
Test minimal. Jalankan DI DALAM container (butuh faster-whisper terpasang):

    docker run --rm --env-file .env unstoppable-voice \
      sh -c "pip install pytest httpx -q && python -m pytest tests/ -q"
"""
from fastapi.testclient import TestClient


def test_healthz():
    from app.main import app

    with TestClient(app) as client:
        res = client.get("/healthz")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}


def test_synthesize_requires_key():
    from app.main import app

    with TestClient(app) as client:
        res = client.post("/synthesize", json={"text": "halo"})
        assert res.status_code == 401


def test_transcribe_requires_key():
    from app.main import app

    with TestClient(app) as client:
        res = client.post("/transcribe")
        # 401 (auth ditolak) sebelum sampai ke validasi file
        assert res.status_code == 401
