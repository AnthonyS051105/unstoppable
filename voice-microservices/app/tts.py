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
