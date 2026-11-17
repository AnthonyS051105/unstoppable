# Voice service: STT (faster-whisper) + TTS (binary Piper standalone).
# Semua bahan berat (binary piper, model piper, model whisper) diunduh SAAT BUILD
# dan di-bake ke image, jadi repo tidak perlu menyimpan file besar dan build bisa
# dilakukan dari git saja. Setelah image jadi, container tidak butuh internet
# (mendukung demo offline). Setiap unduhan diverifikasi dengan SHA-256.

FROM python:3.11-slim

# ffmpeg: dibutuhkan faster-whisper untuk decode webm/ogg dari browser.
# curl + ca-certificates: untuk mengunduh binary/model Piper saat build.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Binary Piper (rilis resmi, x86-64) -> /opt/piper/ ---
# Layer ini ter-cache selama baris ini tidak berubah (jarang).
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_SHA256=a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992
RUN curl -fsSL -o /tmp/piper.tgz \
      "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz" \
    && echo "${PIPER_SHA256}  /tmp/piper.tgz" | sha256sum -c - \
    && tar -xzf /tmp/piper.tgz -C /opt && rm /tmp/piper.tgz \
    && chmod +x /opt/piper/piper /opt/piper/piper_phonemize \
    && (/opt/piper/piper --help > /dev/null 2>&1 \
        || (echo "Binary piper tidak bisa dijalankan (arsitektur salah?)" && exit 1))

WORKDIR /app

# --- Dependency Python ---
# Di atas COPY app/ supaya edit kode tidak meng-invalidasi layer pip.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Model Piper (suara Indonesia) ---
ARG PIPER_VOICE_URL=https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium
ARG PIPER_ONNX_SHA256=ed8f02aa593f7af6b19acbdb8142e0da0dd72f46194eb33d38e0eb10a52597e8
ARG PIPER_JSON_SHA256=1ef677072668a5e172e0759b1d3871f129009d1167f093325a17607f7add5ad7
RUN mkdir -p /app/models/piper && cd /app/models/piper \
    && curl -fsSL -O "${PIPER_VOICE_URL}/id_ID-news_tts-medium.onnx" \
    && curl -fsSL -O "${PIPER_VOICE_URL}/id_ID-news_tts-medium.onnx.json" \
    && echo "${PIPER_ONNX_SHA256}  id_ID-news_tts-medium.onnx" | sha256sum -c - \
    && echo "${PIPER_JSON_SHA256}  id_ID-news_tts-medium.onnx.json" | sha256sum -c -

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
