"""Owner management API. Every handler is scoped to the signed-in owner."""

from datetime import datetime

from flask import Blueprint, g, request
from sqlalchemy import func

from extensions import db
from models import (
    ROLE_OWNER,
    SLOT_AVAILABLE,
    SLOT_OCCUPIED,
    SLOT_OUT_OF_SERVICE,
    ParkingLocation,
    ParkingSlot,
    Reservation,
)
from security import login_required
from services.booking_service import (
    cancel_reservation,
    finalize_expired_reservations,
    location_availability,
    log_activity,
    reserved_slot_ids,
    serialize_location,
    serialize_reservation,
    serialize_slot,
    set_slot_status,
)
from services.reporting_service import (
    owned_reservations_query,
    owner_dashboard,
    owner_statistics,
)
from utils import (
    ApiError,
    iso,
    now,
    optional_text,
    parse_number,
    parse_time_of_day,
    require_json_object,
    require_text,
    success,
)

owner_bp = Blueprint("owner", __name__, url_prefix="/api/owner")

MAX_SLOTS_PER_LOCATION = 300


# ---------------------------------------------------------------------------
# Ownership guards
# ---------------------------------------------------------------------------
def _owned_location(location_id, owner):
    location = ParkingLocation.query.filter_by(id=location_id, owner_id=owner.id).first()
    if location is None:
        raise ApiError("Parking location not found.", 404)
    return location


def _owned_slot(slot_id, owner):
    slot = db.session.get(ParkingSlot, slot_id)
    if slot is None or slot.location.owner_id != owner.id:
        raise ApiError("Parking slot not found.", 404)
    return slot


def _owned_reservation(reservation_id, owner):
    reservation = db.session.get(Reservation, reservation_id)
    if reservation is None or reservation.slot is None:
        raise ApiError("Reservation not found.", 404)
    if reservation.slot.location.owner_id != owner.id:
        raise ApiError("Reservation not found.", 404)
    return reservation


# ---------------------------------------------------------------------------
# Location payload validation
# ---------------------------------------------------------------------------
def _optional_coordinate(payload, key, label, limit):
    if key not in payload:
        return None
    value = payload.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    number = parse_number(value, label, -limit, limit)
    return number


def _apply_location_payload(location, payload, creating=False):
    if creating or "name" in payload:
        location.name = require_text(payload, "name", "Parking name", 150)
    if creating or "address" in payload:
        location.address = require_text(payload, "address", "Address", 255)
    if creating or "city" in payload:
        location.city = require_text(payload, "city", "City", 100)
    if creating or "area" in payload:
        location.area = require_text(payload, "area", "Area", 100)
    if creating or "opening_time" in payload:
        location.opening_time = parse_time_of_day(
            payload.get("opening_time", "08:00"), "Opening time"
        )
    if creating or "closing_time" in payload:
        location.closing_time = parse_time_of_day(
            payload.get("closing_time", "22:00"), "Closing time"
        )
    if creating or "hourly_rate" in payload:
        location.hourly_rate = parse_number(
            payload.get("hourly_rate"), "Hourly rate (INR)", minimum=0, maximum=100000
        )
    if "description" in payload:
        location.description = optional_text(payload, "description", "Description", 1000)
    if "latitude" in payload:
        location.latitude = _optional_coordinate(payload, "latitude", "Latitude", 90)
    if "longitude" in payload:
        location.longitude = _optional_coordinate(payload, "longitude", "Longitude", 180)
    if "is_active" in payload:
        value = payload.get("is_active")
        if not isinstance(value, bool):
            raise ApiError("is_active must be true or false.", 400)
        location.is_active = value

    if location.closing_time <= location.opening_time:
        raise ApiError(
            "Closing time must be after opening time.",
            400,
            {"closing_time": "Choose a closing time later than the opening time."},
        )


def _parse_total_slots(value, default=0):
    if value is None or value == "":
        return default
    try:
        total = int(value)
    except (TypeError, ValueError):
        raise ApiError("Total slots must be a whole number.", 400,
                       {"total_slots": "Enter a whole number."}) from None
    if total < 0 or total > MAX_SLOTS_PER_LOCATION:
        raise ApiError(
            f"Total slots must be between 0 and {MAX_SLOTS_PER_LOCATION}.",
            400,
            {"total_slots": f"Use a number from 0 to {MAX_SLOTS_PER_LOCATION}."},
        )
    return total


def _add_numbered_slots(location, count):
    """Create ``count`` slots numbered 01, 02, ... skipping existing numbers."""
    taken = {slot.slot_number for slot in location.slots}
    created = []
    candidate = 1
    while len(created) < count:
        number = f"{candidate:02d}" if candidate < 100 else str(candidate)
        candidate += 1
        if number in taken:
            continue
        taken.add(number)
        slot = ParkingSlot(
            location_id=location.id,
            slot_number=number,
            slot_type="standard",
            status=SLOT_AVAILABLE,
            last_updated=now(),
        )
        db.session.add(slot)
        created.append(slot)
    return created


# ---------------------------------------------------------------------------
# Dashboard and statistics
# ---------------------------------------------------------------------------
@owner_bp.get("/dashboard")
@login_required(ROLE_OWNER)
def dashboard():
    return success(owner_dashboard(g.current_user))


@owner_bp.get("/statistics")
@login_required(ROLE_OWNER)
def statistics():
    return success(owner_statistics(g.current_user))


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------
@owner_bp.get("/locations")
@login_required(ROLE_OWNER)
def list_locations():
    at_time = now()
    locations = (
        ParkingLocation.query.filter_by(owner_id=g.current_user.id)
        .order_by(ParkingLocation.name.asc())
        .all()
    )
    return success({
        "locations": [serialize_location(location, at_time) for location in locations],
        "count": len(locations),
        "last_updated": iso(at_time),
    })


@owner_bp.post("/locations")
@login_required(ROLE_OWNER)
def create_location():
    payload = require_json_object(request.get_json(silent=True))
    total_slots = _parse_total_slots(payload.get("total_slots"))

    location = ParkingLocation(owner_id=g.current_user.id, is_active=True)
    _apply_location_payload(location, payload, creating=True)

    db.session.add(location)
    db.session.flush()  # assigns location.id so slots can reference it

    created_slots = _add_numbered_slots(location, total_slots)
    log_activity(
        f"Parking location created: {location.name}",
        actor=g.current_user,
        location_id=location.id,
    )
    db.session.commit()

    data = serialize_location(location, include_slots=True)
    data["slots_created"] = len(created_slots)
    return success({"location": data}, 201)


@owner_bp.patch("/locations/<int:location_id>")
@login_required(ROLE_OWNER)
def update_location(location_id):
    payload = require_json_object(request.get_json(silent=True))
    location = _owned_location(location_id, g.current_user)

    _apply_location_payload(location, payload)

    if "total_slots" in payload:
        target = _parse_total_slots(payload.get("total_slots"))
        current = len(location.slots)
        if target < current:
            raise ApiError(
                "Total slots cannot be reduced here because existing slots may hold bookings.",
                400,
                {"total_slots": f"This location already has {current} slots."},
            )
        _add_numbered_slots(location, target - current)

    log_activity(
        f"Parking location updated: {location.name}",
        actor=g.current_user,
        location_id=location.id,
    )
    db.session.commit()
    return success({"location": serialize_location(location, include_slots=True)})


@owner_bp.delete("/locations/<int:location_id>")
@login_required(ROLE_OWNER)
def delete_location(location_id):
    location = _owned_location(location_id, g.current_user)
    booking_count = (
        db.session.query(func.count(Reservation.id))
        .join(ParkingSlot, Reservation.slot_id == ParkingSlot.id)
        .filter(ParkingSlot.location_id == location.id)
        .scalar()
    )
    if booking_count:
        raise ApiError(
            "This location has booking records and cannot be deleted. "
            "Deactivate it instead to hide it from users.",
            409,
        )

    name = location.name
    db.session.delete(location)
    log_activity(f"Parking location deleted: {name}", actor=g.current_user)
    db.session.commit()
    return success({"message": f"{name} was deleted."})


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------
@owner_bp.get("/locations/<int:location_id>/slots")
@login_required(ROLE_OWNER)
def list_slots(location_id):
    location = _owned_location(location_id, g.current_user)
    at_time = now()
    slots = sorted(location.slots, key=lambda slot: slot.slot_number.lower())
    reserved_ids = reserved_slot_ids([slot.id for slot in slots], at_time)
    return success({
        "location": serialize_location(location, at_time),
        "slots": [serialize_slot(slot, at_time, reserved_ids) for slot in slots],
        "availability": location_availability(location, at_time, slots),
        "last_updated": iso(at_time),
    })


@owner_bp.post("/locations/<int:location_id>/slots")
@login_required(ROLE_OWNER)
def create_slot(location_id):
    payload = require_json_object(request.get_json(silent=True))
    location = _owned_location(location_id, g.current_user)

    slot_number = require_text(payload, "slot_number", "Slot number", 30)
    duplicate = ParkingSlot.query.filter(
        ParkingSlot.location_id == location.id,
        func.lower(ParkingSlot.slot_number) == slot_number.lower(),
    ).first()
    if duplicate is not None:
        raise ApiError(f"Slot {slot_number} already exists at this location.", 400,
                       {"slot_number": "Slot numbers must be unique within a location."})

    slot = ParkingSlot(
        location_id=location.id,
        slot_number=slot_number,
        slot_type=optional_text(payload, "slot_type", "Slot type", 30) or "standard",
        status=SLOT_AVAILABLE,
        last_updated=now(),
    )
    db.session.add(slot)
    log_activity(
        f"Slot {slot_number} added to {location.name}",
        actor=g.current_user,
        location_id=location.id,
    )
    db.session.commit()
    return success({"slot": serialize_slot(slot)}, 201)


@owner_bp.patch("/slots/<int:slot_id>")
@login_required(ROLE_OWNER)
def update_slot(slot_id):
    payload = require_json_object(request.get_json(silent=True))
    slot = _owned_slot(slot_id, g.current_user)

    if "slot_number" in payload:
        slot_number = require_text(payload, "slot_number", "Slot number", 30)
        duplicate = ParkingSlot.query.filter(
            ParkingSlot.location_id == slot.location_id,
            ParkingSlot.id != slot.id,
            func.lower(ParkingSlot.slot_number) == slot_number.lower(),
        ).first()
        if duplicate is not None:
            raise ApiError(f"Slot {slot_number} already exists at this location.", 400,
                           {"slot_number": "Slot numbers must be unique within a location."})
        slot.slot_number = slot_number

    if "slot_type" in payload:
        slot.slot_type = optional_text(payload, "slot_type", "Slot type", 30) or "standard"

    if "status" in payload:
        db.session.flush()
        # Validates the transition and refuses to touch a slot with a live reservation.
        set_slot_status(slot, payload.get("status"), actor=g.current_user,
                        context="Slot management")
    else:
        db.session.commit()

    return success({"slot": serialize_slot(slot)})


@owner_bp.post("/slots/<int:slot_id>/simulate")
@login_required(ROLE_OWNER)
def simulate_slot(slot_id):
    """Demo-only occupancy toggle standing in for a future sensor reading."""
    payload = require_json_object(request.get_json(silent=True))
    slot = _owned_slot(slot_id, g.current_user)
    requested = payload.get("status")

    if requested not in (SLOT_AVAILABLE, SLOT_OCCUPIED):
        raise ApiError(
            "Simulation can only switch a slot between available and occupied.",
            400,
            {"status": "Use 'available' or 'occupied'."},
        )
    if slot.status == SLOT_OUT_OF_SERVICE:
        raise ApiError(
            "This slot is out of service. Return it to service from slot management first.",
            409,
        )

    set_slot_status(slot, requested, actor=g.current_user, context="Simulation mode")
    return success({
        "slot": serialize_slot(slot),
        "message": "Simulated occupancy updated. This is demo data, not a real sensor reading.",
    })


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------
@owner_bp.get("/reservations")
@login_required(ROLE_OWNER)
def list_reservations():
    finalize_expired_reservations()
    query = owned_reservations_query(g.current_user)

    location_id = request.args.get("location_id")
    if location_id:
        try:
            query = query.filter(ParkingSlot.location_id == int(location_id))
        except ValueError:
            raise ApiError("location_id must be a whole number.", 400) from None

    date_filter = (request.args.get("date") or "").strip()
    if date_filter:
        try:
            day = datetime.strptime(date_filter, "%Y-%m-%d").date()
        except ValueError:
            raise ApiError("date must use the YYYY-MM-DD format.", 400) from None
        query = query.filter(func.date(Reservation.start_time) == day.isoformat())

    status_filter = (request.args.get("status") or "").strip()
    if status_filter and status_filter != "all":
        if status_filter not in ("active", "cancelled", "completed"):
            raise ApiError("status must be active, cancelled, completed or all.", 400)
        query = query.filter(Reservation.status == status_filter)

    rows = query.order_by(Reservation.start_time.desc()).limit(200).all()
    return success({
        "reservations": [
            serialize_reservation(row, include_user=True, include_location=True) for row in rows
        ],
        "count": len(rows),
        "last_updated": iso(now()),
    })


@owner_bp.patch("/reservations/<int:reservation_id>/cancel")
@login_required(ROLE_OWNER)
def cancel_owner_reservation(reservation_id):
    reservation = _owned_reservation(reservation_id, g.current_user)
    cancel_reservation(reservation, g.current_user,
                       reason="Reservation cancelled by parking owner")
    return success({
        "reservation": serialize_reservation(reservation, include_user=True, include_location=True),
        "message": "Reservation cancelled.",
    })
