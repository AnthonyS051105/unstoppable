from fastapi import Header, HTTPException, status

from .config import settings


async def require_internal_key(x_internal_key: str = Header(default="")):
    """
    FastAPI dependency. Dipasang di endpoint yang hanya boleh dipanggil
    backend Express, bukan dari luar. Header "X-Internal-Key" harus cocok
    dengan settings.internal_api_key.
    """
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal key",
        )
