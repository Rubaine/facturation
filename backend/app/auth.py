"""Authentification mono-utilisateur : mot de passe unique (ADMIN_PASSWORD) + cookie signé."""

import hmac
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from pydantic import BaseModel

from .config import get_settings

COOKIE = "facturation_session"
router = APIRouter(prefix="/api/auth", tags=["auth"])

_failures: dict[str, list[float]] = defaultdict(list)
MAX_FAILURES = 5
WINDOW = 15 * 60


def _signer() -> TimestampSigner:
    return TimestampSigner(get_settings().secret_key, salt="session")


def require_auth(request: Request) -> None:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Non authentifié")
    try:
        _signer().unsign(token, max_age=get_settings().session_days * 86400)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Session expirée") from None


class LoginIn(BaseModel):
    password: str


@router.post("/login")
def login(data: LoginIn, request: Request, response: Response):
    settings = get_settings()
    ip = request.client.host if request.client else "?"
    now = time.time()
    _failures[ip] = [t for t in _failures[ip] if now - t < WINDOW]
    if len(_failures[ip]) >= MAX_FAILURES:
        raise HTTPException(429, "Trop de tentatives, réessaie dans quelques minutes.")
    if not hmac.compare_digest(data.password.encode(), settings.admin_password.encode()):
        _failures[ip].append(now)
        raise HTTPException(401, "Mot de passe incorrect")
    _failures.pop(ip, None)
    token = _signer().sign(b"admin").decode()
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/me", dependencies=[Depends(require_auth)])
def me():
    return {"ok": True}
