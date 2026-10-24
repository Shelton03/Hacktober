"""
Encryption for fiscal device secrets (Fernet, key from env) and misc security utils.

The Fernet key comes from FDMS_ENCRYPTION_KEY in .env. If missing, one is
derived from SECRET_KEY (dev convenience; set it explicitly in production).
"""
import base64
import hashlib

from django.conf import settings


def _fernet_key() -> bytes:
    explicit = getattr(settings, "FDMS_ENCRYPTION_KEY", "") or ""
    material = explicit or settings.SECRET_KEY
    digest = hashlib.sha256(material.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet():
    from cryptography.fernet import Fernet

    return Fernet(_fernet_key())


def encrypt_value(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    if not token:
        return ""
    return _fernet().decrypt(token.encode()).decode()
