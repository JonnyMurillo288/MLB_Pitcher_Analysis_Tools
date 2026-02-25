"""Supabase JWT verification dependency for FastAPI, with TEST_MODE bypass."""

from __future__ import annotations

import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Header


SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
TEST_MODE = os.getenv("TEST_MODE", "") == "1"

# Fixed UUIDs for the two seeded dev accounts
TEST_PAID_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_FREE_USER_ID = "00000000-0000-0000-0000-000000000002"


def get_current_user(
    authorization: Optional[str] = Header(None),
    x_dev_user_id: Optional[str] = Header(None, alias="X-Dev-User-ID"),
) -> dict:
    """
    Extract and verify the user from the request.

    In TEST_MODE:
      - Pass  X-Dev-User-ID: <uuid>  to act as any user.
      - Omit the header to default to the seeded paid user.

    In production:
      - Requires  Authorization: Bearer <supabase_jwt>
    """
    if TEST_MODE:
        uid = x_dev_user_id or TEST_PAID_USER_ID
        return {"sub": uid, "email": f"{uid}@dev.local"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


def require_user(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency that returns the verified user payload."""
    return user


def get_user_id(user: dict = Depends(require_user)) -> str:
    """FastAPI dependency that extracts just the user ID (sub claim)."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="No user ID in token")
    return uid
