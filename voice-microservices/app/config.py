from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Konfigurasi service. Nilai default di bawah adalah nilai yang dipakai
    DI DALAM container. Untuk override lokal, isi file .env (lihat .env.example).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Kunci rahasia yang WAJIB dikirim backend Express di header "X-Internal-Key".
    # Service ini tidak diekspos publik; ini lapisan auth kedua setelah isolasi network.
    internal_api_key: str = "change-me"

    # --- Piper (TTS) ---
    # Binary Piper standalone + model .onnx sudah di-COPY ke image oleh Dockerfile.
    piper_bin: str = "/opt/piper/piper"
    piper_model_path: str = "/app/models/piper/id_ID-news_tts-medium.onnx"

    # --- faster-whisper (STT) ---
    # tiny | base | small  — JANGAN large (CPU-only tidak kuat, latency demo jebol)
    whisper_model_size: str = "base"
    whisper_compute_type: str = "int8"  # int8 = paling ringan di CPU
    whisper_language: str = "id"
    whisper_download_root: str = "/app/models/whisper"

    # Tolak upload audio yang lebih besar dari ini (bytes). Default 10 MB.
    max_audio_bytes: int = 10 * 1024 * 1024


settings = Settings()
