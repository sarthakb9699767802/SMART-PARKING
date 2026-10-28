"""Password hashing, token based sessions and role guards.

Authentication flow
-------------------
1. ``POST /api/auth/register`` or ``POST /api/auth/login`` creates a random token.
2. Only the SHA-256 hash of that token is stored in ``auth_sessions``, so a
   leaked database cannot be replayed as a live login.
3. The frontend sends ``Authorization: Bearer <token>`` with each request.
4. ``@login_required()`` / ``@login_required(ROLE_OWNER)`` resolves the session,
   loads the user into ``flask.g.current_user`` and enforces the role.
"""

import hashlib
import secrets
from datetime import timedelta
from functools import wraps

from flask import current_app, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db
from models import AuthSession, User
from utils import ApiError, now

DEFAULT_SESSION_HOURS = 24


def make_password_hash(raw_password):
    return generate_password_hash(raw_password)


def verify_password(raw_password, password_hash):
    return check_password_hash(password_hash, raw_password)


def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _extract_token():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def create_session(user):
    """Create a login session for ``user`` and return the raw token."""
    hours = current_app.config.get("SESSION_TTL_HOURS", DEFAULT_SESSION_HOURS)
    token = secrets.token_urlsafe(32)

    # Opportunistic housekeeping: drop this user's expired sessions.
    AuthSession.query.filter(
        AuthSession.user_id == user.id, AuthSession.expires_at <= now()
    ).delete(synchronize_session=False)

    db.session.add(
        AuthSession(
            token_hash=_hash_token(token),
            user_id=user.id,
            created_at=now(),
            expires_at=now() + timedelta(hours=hours),
        )
    )
    db.session.commit()
    return token


def end_current_session():
    session = getattr(g, "current_session", None)
    if session is not None:
        db.session.delete(session)
        db.session.commit()


def resolve_session_user():
    """Return the logged-in user for the current request, or None."""
    token = _extract_token()
    if not token:
        return None

    session = AuthSession.query.filter_by(token_hash=_hash_token(token)).first()
    if session is None:
        return None

    if session.expires_at <= now():
        db.session.delete(session)
        db.session.commit()
        return None

    user = db.session.get(User, session.user_id)
    if user is None:
        return None

    g.current_session = session
    return user


def login_required(role=None):
    """Protect a route. Optionally require a specific role (ROLE_USER/ROLE_OWNER)."""

    def decorator(view_function):
        @wraps(view_function)
        def wrapper(*args, **kwargs):
            user = resolve_session_user()
            if user is None:
                raise ApiError("Please sign in to continue.", 401)

            if role is not None and user.role != role:
                raise ApiError(
                    "You do not have permission to perform this action.",
                    403,
                    {"required_role": role},
                )

            g.current_user = user
            return view_function(*args, **kwargs)

        return wrapper

    return decorator


def current_user():
    """The user resolved by ``@login_required`` for this request."""
    return getattr(g, "current_user", None)
