import os
import subprocess
import tempfile

from .config import settings


def synthesize(text: str, length_scale: float = 1.0) -> bytes:
    """
    Ubah teks Bahasa Indonesia menjadi audio WAV memakai binary Piper.

    text         : kalimat (idealnya sudah natural, mis. hasil dari Claude API)
    length_scale : kecepatan bicara. >1.0 lebih lambat, <1.0 lebih cepat.
                   Ini yang dipetakan ke preferensi "kecepatan TTS" milik user.
    return       : bytes berformat WAV (audio/wav)

    Catatan: kita panggil binary "piper" via subprocess, BUKAN library Python
    `piper-tts`. Library tsb. butuh `piper-phonemize` yang tidak punya wheel
    untuk Python 3.11/3.12. Binary standalone tidak butuh Python sama sekali.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = tmp.name

    try:
        proc = subprocess.run(
            [
                settings.piper_bin,
                "--model", settings.piper_model_path,
                "--length_scale", str(length_scale),
                "--output_file", out_path,
            ],
            input=text.encode("utf-8"),   # Piper membaca teks dari stdin
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"piper gagal (exit {proc.returncode}): "
                f"{proc.stderr.decode('utf-8', 'ignore')}"
            )
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)


def convert_to_mp3(wav_bytes: bytes) -> bytes:
    """
    WAV -> MP3 lewat ffmpeg (sudah ada di image, dipakai faster-whisper untuk
    decode webm/ogg -- tidak perlu dependency baru). docs/API_CONTRACT.md §6
    menjanjikan audio/mpeg untuk /speech/synthesize, bukan audio/wav mentah.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_tmp:
        wav_tmp.write(wav_bytes)
        wav_path = wav_tmp.name

    mp3_path = wav_path.removesuffix(".wav") + ".mp3"

    try:
        proc = subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3_path],
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"ffmpeg gagal (exit {proc.returncode}): "
                f"{proc.stderr.decode('utf-8', 'ignore')}"
            )
        with open(mp3_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)
        if os.path.exists(mp3_path):
            os.unlink(mp3_path)
