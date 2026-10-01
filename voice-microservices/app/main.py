from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import stt, tts
from .auth import require_internal_key
from .config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload model Whisper saat startup supaya request /transcribe pertama
    # tidak menanggung waktu load model. Piper tidak perlu preload — ia proses
    # terpisah yang dijalankan per-request.
    stt.get_model()
    yield


app = FastAPI(title="Unstoppable Voice Service", lifespan=lifespan)


class SynthesizeIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    # Bentuk persis docs/API_CONTRACT.md §6: speedPercent (100=normal),
    # BUKAN length_scale Piper langsung -- itu detail internal, tidak dikirim
    # oleh backend Express. lang diterima tapi diabaikan, model cuma dukung id.
    speedPercent: int = Field(default=100, ge=50, le=200)
    lang: str = Field(default="id-ID")


@app.get("/healthz")
async def healthz():
    """Cek hidup. Tidak butuh auth — dipakai oleh healthcheck Docker."""
    return {"status": "ok"}


@app.post("/synthesize", dependencies=[Depends(require_internal_key)])
async def synthesize(body: SynthesizeIn):
    """Teks -> MP3. Dipanggil backend untuk membacakan panduan rute (F3)."""
    # speedPercent 100 -> length_scale 1.0 (normal); >100 (lebih cepat) ->
    # length_scale <1.0; <100 (lebih lambat) -> length_scale >1.0 (terbalik,
    # sesuai semantik length_scale Piper).
    length_scale = 100 / body.speedPercent
    wav_bytes = tts.synthesize(body.text, length_scale=length_scale)
    mp3_bytes = tts.convert_to_mp3(wav_bytes)
    return Response(
        content=mp3_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/transcribe", dependencies=[Depends(require_internal_key)])
async def transcribe(audio: UploadFile = File(...)):
    """Audio (multipart) -> teks. Dipakai voice command / AI Planner input suara."""
    data = await audio.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="empty audio")
    if len(data) > settings.max_audio_bytes:
        raise HTTPException(status_code=413, detail="audio too large")
    return stt.transcribe(data, filename_hint=audio.filename or "audio.webm")
