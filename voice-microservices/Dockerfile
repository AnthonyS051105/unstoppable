# Voice service: STT (faster-whisper) + TTS (binary Piper standalone).
# Semua bahan berat (binary piper, model piper, model whisper) di-bake ke image
# supaya container self-contained: bisa jalan tanpa internet (mendukung demo offline).

FROM python:3.11-slim

# ffmpeg: dibutuhkan faster-whisper untuk decode webm/ogg dari browser.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# --- Binary Piper (dari host: vendor/piper/) ---
# Di-COPY, bukan di-download saat build -> layer cache permanen.
COPY vendor/piper/ /opt/piper/
RUN chmod +x /opt/piper/piper /opt/piper/piper_phonemize 2>/dev/null; \
    /opt/piper/piper --help > /dev/null 2>&1 \
    || (echo "Binary piper tidak bisa dijalankan (arsitektur salah?)" && exit 1)

WORKDIR /app

# --- Dependency Python ---
# Di atas COPY app/ supaya edit kode tidak meng-invalidasi layer pip.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Model Piper (dari host: models/piper/) ---
COPY models/piper/ /app/models/piper/
RUN test "$(stat -c%s /app/models/piper/id_ID-news_tts-medium.onnx)" -eq 62950044 \
    || (echo "Model Piper tidak utuh / bukan file asli (LFS pointer?)" && exit 1)

# --- Bake model Whisper 'base' ke image ---
# Butuh internet SAAT BUILD saja. Setelah ini container tidak perlu internet.
# Hapus baris ini kalau ingin build lebih cepat & terima download saat start pertama.
RUN python -c "from faster_whisper import WhisperModel; \
    WhisperModel('base', device='cpu', compute_type='int8', download_root='/app/models/whisper')"

# --- Kode aplikasi (paling sering berubah -> paling bawah) ---
COPY app/ /app/app/

EXPOSE 8080

# 1 worker: model di-load per proses & inferensi CPU-bound. uvicorn async
# sudah cukup menangani konkurensi I/O untuk skala service ini.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
