"""Reservation endpoints for normal users. Every query is scoped to the caller."""

from flask import Blueprint, g, request

from extensions import db
from models import ROLE_USER, Reservation, RESERVATION_CANCELLED, RESERVATION_COMPLETED, SLOT_OCCUPIED
from security import login_required
from services.booking_service import (
    cancel_reservation,
    create_reservation,
    finalize_expired_reservations,
    serialize_reservation,
    set_slot_status,
)
from utils import ApiError, parse_datetime, require_json_object, success

reservations_bp = Blueprint("reservations", __name__, url_prefix="/api/reservations")


def _slot_id_from(payload):
    raw = payload.get("slot_id")
    if isinstance(raw, bool) or raw is None:
        raise ApiError("Choose a parking slot.", 400, {"slot_id": "Choose a slot to book."})
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ApiError("Choose a valid parking slot.", 400,
                       {"slot_id": "slot_id must be a number."}) from None


def _own_reservation(reservation_id, user):
    reservation = db.session.get(Reservation, reservation_id)
    # Return 404 rather than 403 so other users' bookings are not even confirmed to exist.
    if reservation is None or reservation.user_id != user.id:
        raise ApiError("Reservation not found.", 404)
    return reservation


@reservations_bp.post("")
@login_required(ROLE_USER)
def create():
    payload = require_json_object(request.get_json(silent=True))
    slot_id = _slot_id_from(payload)
    start = parse_datetime(payload.get("start_time"), "start_time")
    end = parse_datetime(payload.get("end_time"), "end_time")

    reservation = create_reservation(g.current_user, slot_id, start, end)
    return success(
        {"reservation": serialize_reservation(reservation, include_location=True)}, 201
    )


@reservations_bp.get("/my")
@login_required(ROLE_USER)
def my_reservations():
    finalize_expired_reservations()
    rows = (
        Reservation.query.filter_by(user_id=g.current_user.id)
        .order_by(Reservation.start_time.desc())
        .all()
    )
    return success({
        "reservations": [
            serialize_reservation(row, include_location=True) for row in rows
        ],
        "count": len(rows),
    })


@reservations_bp.get("/<int:reservation_id>")
@login_required(ROLE_USER)
def get_one(reservation_id):
    reservation = _own_reservation(reservation_id, g.current_user)
    return success({"reservation": serialize_reservation(reservation, include_location=True)})


@reservations_bp.patch("/<int:reservation_id>/cancel")
@login_required(ROLE_USER)
def cancel(reservation_id):
    reservation = _own_reservation(reservation_id, g.current_user)
    cancel_reservation(reservation, g.current_user, reason="Reservation cancelled by user")
    return success({"reservation": serialize_reservation(reservation, include_location=True),
                    "message": "Reservation cancelled."})


@reservations_bp.post("/<int:reservation_id>/check-in")
@login_required(ROLE_USER)
def check_in(reservation_id):
    reservation = _own_reservation(reservation_id, g.current_user)
    slot = reservation.slot
    if slot is None:
        raise ApiError("Reservation has no slot.", 404)
    if reservation.status == RESERVATION_CANCELLED:
        raise ApiError("This reservation is already cancelled.", 409)
    if reservation.status == RESERVATION_COMPLETED:
        raise ApiError("Completed reservations cannot be checked in.", 409)
    # Mark slot as occupied and record the check-in
    set_slot_status(slot, SLOT_OCCUPIED, actor=g.current_user, context="QR check-in")
    reservation.status = RESERVATION_COMPLETED
    reservation.end_time = now()
    reservation.cancelled_at = now()
    db.session.commit()
    return success({"reservation": serialize_reservation(reservation, include_location=True),
                    "message": "Slot marked as occupied via QR check-in."})
