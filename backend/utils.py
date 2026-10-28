"""Small shared helpers used by the SmartPark backend.

Every API response uses one of two shapes so the frontend can handle
results in a single place:

    success -> {"ok": true,  "data": ...}
    failure -> {"ok": false, "error": "human readable message", "details": {...}}
"""

import re
from datetime import datetime

from flask import jsonify

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
MIN_PASSWORD_LENGTH = 8
MAX_RESERVATION_HOURS = 24
MIN_RESERVATION_MINUTES = 15


class ApiError(Exception):
    """An expected error that should be returned to the client as JSON."""

    def __init__(self, message, status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def success(data=None, status_code=200):
    """Return the standard success envelope."""
    return jsonify({"ok": True, "data": data}), status_code


def now():
    """Current local time without microseconds (the database is timezone-naive)."""
    return datetime.now().replace(microsecond=0)


def iso(value):
    """Serialise a datetime (or None) for JSON responses."""
    if value is None:
        return None
    return value.isoformat(timespec="seconds")


def parse_datetime(value, field_label):
    """Parse an ISO-8601 string coming from the frontend into a naive local datetime."""
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{field_label} is required.", 400, {field_label: "This field is required."})

    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1]

    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        raise ApiError(
            f"{field_label} must be a valid date and time.",
            400,
            {field_label: "Use the date/time picker or an ISO value such as 2026-01-31T18:30."},
        ) from None

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone().replace(tzinfo=None)

    return parsed.replace(second=0, microsecond=0)


def require_json_object(payload):
    if not isinstance(payload, dict):
        raise ApiError("Request body must be a JSON object.", 400)
    return payload


def require_text(payload, key, label, max_length=255):
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{label} is required.", 400, {key: f"{label} is required."})
    value = value.strip()
    if len(value) > max_length:
        raise ApiError(f"{label} must be {max_length} characters or fewer.", 400,
                       {key: f"Maximum {max_length} characters."})
    return value


def optional_text(payload, key, label, max_length=1000):
    """Return a stripped string, or None when the field is absent/blank."""
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(f"{label} must be text.", 400, {key: f"{label} must be text."})
    value = value.strip()
    if not value:
        return None
    if len(value) > max_length:
        raise ApiError(f"{label} must be {max_length} characters or fewer.", 400,
                       {key: f"Maximum {max_length} characters."})
    return value


def validate_email(value):
    if not isinstance(value, str) or not value.strip():
        raise ApiError("Email is required.", 400, {"email": "Email is required."})
    cleaned = value.strip().lower()
    if not EMAIL_PATTERN.match(cleaned) or len(cleaned) > 255:
        raise ApiError("Enter a valid email address.", 400,
                       {"email": "Enter a valid email address, for example name@example.com."})
    return cleaned


def validate_password(value):
    if not isinstance(value, str) or not value:
        raise ApiError("Password is required.", 400, {"password": "Password is required."})
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ApiError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.",
            400,
            {"password": f"Use at least {MIN_PASSWORD_LENGTH} characters."},
        )
    if len(value) > 128:
        raise ApiError("Password must be 128 characters or fewer.", 400,
                       {"password": "Maximum 128 characters."})
    return value


def parse_time_of_day(value, label):
    """Validate an 'HH:MM' string and return it as 'HH:MM'."""
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{label} is required.", 400, {label: f"{label} is required."})
    raw = value.strip()
    try:
        parsed = datetime.strptime(raw, "%H:%M")
    except ValueError:
        raise ApiError(f"{label} must use the HH:MM 24-hour format.", 400,
                       {label: "Use a 24-hour time such as 08:00 or 21:30."}) from None
    return parsed.strftime("%H:%M")


def parse_number(value, label, minimum=None, maximum=None):
    if value is None or value == "":
        raise ApiError(f"{label} is required.", 400, {label: f"{label} is required."})
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ApiError(f"{label} must be a number.", 400, {label: "Enter a number."}) from None
    if minimum is not None and number < minimum:
        raise ApiError(f"{label} must be at least {minimum}.", 400, {label: f"Minimum {minimum}."})
    if maximum is not None and number > maximum:
        raise ApiError(f"{label} must be at most {maximum}.", 400, {label: f"Maximum {maximum}."})
    return round(number, 2)
