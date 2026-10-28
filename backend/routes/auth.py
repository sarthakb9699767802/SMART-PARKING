"""Registration, login, logout and "who am I" endpoints for both roles."""

from flask import Blueprint, g, request

from extensions import db
from models import ROLE_OWNER, ROLE_USER, VALID_ROLES, User
from security import create_session, end_current_session, login_required
from utils import (
    ApiError,
    iso,
    now,
    optional_text,
    require_json_object,
    require_text,
    success,
    validate_email,
    validate_password,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def serialize_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "business_name": user.business_name,
        "created_at": iso(user.created_at),
    }


@auth_bp.post("/register")
def register():
    payload = require_json_object(request.get_json(silent=True))

    name = require_text(payload, "name", "Name", 120)
    email = validate_email(payload.get("email"))
    password = validate_password(payload.get("password"))
    role = payload.get("role", ROLE_USER)

    if role not in VALID_ROLES:
        raise ApiError("Choose a valid account type.", 400, {"role": "Use 'user' or 'owner'."})

    confirm = payload.get("confirm_password")
    if confirm is not None and confirm != password:
        raise ApiError("Passwords do not match.", 400,
                       {"confirm_password": "Both passwords must match."})

    business_name = optional_text(payload, "business_name", "Business name", 160)
    if role == ROLE_OWNER and not business_name:
        raise ApiError("Business name is required for parking owners.", 400,
                       {"business_name": "Enter the name of your parking business."})

    if User.query.filter_by(email=email).first():
        raise ApiError("An account with this email already exists.", 409,
                       {"email": "This email is already registered. Try signing in instead."})

    user = User(
        name=name,
        email=email,
        role=role,
        business_name=business_name if role == ROLE_OWNER else None,
        created_at=now(),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = create_session(user)
    return success({"user": serialize_user(user), "token": token}, 201)


@auth_bp.post("/login")
def login():
    payload = require_json_object(request.get_json(silent=True))

    email = validate_email(payload.get("email"))
    password = payload.get("password")
    if not isinstance(password, str) or not password:
        raise ApiError("Password is required.", 400, {"password": "Password is required."})

    user = User.query.filter_by(email=email).first()
    if user is None or not user.check_password(password):
        raise ApiError("Incorrect email or password.", 401)

    expected_role = payload.get("role")
    if expected_role in VALID_ROLES and user.role != expected_role:
        account_label = "parking owner" if user.role == ROLE_OWNER else "user"
        raise ApiError(
            f"This email belongs to a {account_label} account. "
            f"Please use the {account_label} sign-in page.",
            403,
        )

    token = create_session(user)
    return success({"user": serialize_user(user), "token": token})


@auth_bp.post("/logout")
@login_required()
def logout():
    end_current_session()
    return success({"message": "You have been signed out."})


@auth_bp.get("/me")
@login_required()
def me():
    return success({"user": serialize_user(g.current_user)})
