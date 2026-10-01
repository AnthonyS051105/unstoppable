import os
import tempfile

from faster_whisper import WhisperModel

from .config import settings

# Model di-load sekali lalu dipakai ulang (proses tunggal, 1 worker).
_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            settings.whisper_model_size,
            device="cpu",
            compute_type=settings.whisper_compute_type,
            download_root=settings.whisper_download_root,
        )
    return _model


def transcribe(audio_bytes: bytes, filename_hint: str = "audio.webm") -> dict:
    """
    Transkrip audio (webm/ogg/wav/mp3 — apa pun yang bisa dibaca ffmpeg)
    menjadi teks Bahasa Indonesia.

    return: {"text": str, "language": str, "duration": float, "confidence": float | None}

    Catatan soal "confidence": faster-whisper TIDAK mengekspos satu skor
    confidence resmi per transkrip. Nilai di bawah adalah PERKIRAAN KASAR dari
    rata-rata avg_logprob tiap segmen (umumnya di rentang -1..0), dinormalisasi
    ke skala 0..1 -- bukan metrik terkalibrasi, jangan diperlakukan sebagai
    probabilitas benar sungguhan. None kalau audio kosong/hening (tidak ada
    segmen sama sekali), supaya FE tidak salah tafsir "confidence 0" sebagai
    hasil nyata.
    """
    model = get_model()

    suffix = os.path.splitext(filename_hint)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language=settings.whisper_language,
            vad_filter=True,   # buang keheningan -> lebih cepat & akurat
            beam_size=1,       # 1 = tercepat, cukup untuk perintah/kalimat pendek
        )
        segments = list(segments)  # generator sekali-pakai -> materialisasi, dipakai 2x (teks + confidence)
        text = " ".join(s.text.strip() for s in segments).strip()

        avg_logprobs = [s.avg_logprob for s in segments if s.avg_logprob is not None]
        confidence = (
            round(min(1.0, max(0.0, 1 + (sum(avg_logprobs) / len(avg_logprobs)) / 5)), 2)
            if avg_logprobs
            else None
        )

        return {
            "text": text,
            "language": info.language,
            "duration": round(info.duration, 2),
            "confidence": confidence,
        }
    finally:
        os.unlink(tmp_path)
