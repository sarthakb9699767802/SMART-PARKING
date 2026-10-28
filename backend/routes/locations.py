"""Public parking endpoints: search locations and inspect slots."""

from flask import Blueprint, request
from sqlalchemy import or_

from extensions import db
from models import ParkingLocation, ParkingSlot
from services.booking_service import (
    calculate_price,
    is_open_at,
    is_slot_bookable,
    location_availability,
    reserved_slot_ids,
    serialize_location,
    serialize_slot,
    validate_booking_window,
)
from utils import ApiError, iso, now, parse_datetime, success

locations_bp = Blueprint("locations", __name__, url_prefix="/api")


def _float_arg(name):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        return float(raw)
    except ValueError:
        raise ApiError(f"'{name}' must be a number.", 400) from None


def _parse_window():
    """Optional ?start_time=...&end_time=... used to test future availability."""
    raw_start = request.args.get("start_time")
    raw_end = request.args.get("end_time")
    if not raw_start and not raw_end:
        return None
    if not raw_start or not raw_end:
        raise ApiError("Provide both start_time and end_time, or neither.", 400)
    start = parse_datetime(raw_start, "start_time")
    end = parse_datetime(raw_end, "end_time")
    if end <= start:
        raise ApiError("end_time must be after start_time.", 400)
    return start, end


@locations_bp.get("/locations")
def list_locations():
    at_time = now()
    query = ParkingLocation.query.filter(ParkingLocation.is_active.is_(True))

    search = (request.args.get("search") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                ParkingLocation.name.ilike(pattern),
                ParkingLocation.city.ilike(pattern),
                ParkingLocation.area.ilike(pattern),
                ParkingLocation.address.ilike(pattern),
            )
        )

    city = (request.args.get("city") or "").strip()
    if city:
        query = query.filter(ParkingLocation.city.ilike(f"%{city}%"))

    area = (request.args.get("area") or "").strip()
    if area:
        query = query.filter(ParkingLocation.area.ilike(f"%{area}%"))

    max_price = _float_arg("max_price")
    if max_price is not None:
        if max_price < 0:
            raise ApiError("max_price cannot be negative.", 400)
        query = query.filter(ParkingLocation.hourly_rate <= max_price)

    locations = query.order_by(ParkingLocation.name.asc()).all()
    items = [serialize_location(location, at_time) for location in locations]

    if (request.args.get("available_only") or "").lower() in ("1", "true", "yes"):
        items = [item for item in items if item["availability"]["available"] > 0]

    return success({"locations": items, "count": len(items), "last_updated": iso(at_time)})


@locations_bp.get("/locations/<int:location_id>")
def get_location(location_id):
    at_time = now()
    location = db.session.get(ParkingLocation, location_id)
    if location is None or not location.is_active:
        raise ApiError("Parking location not found.", 404)
    return success({
        "location": serialize_location(
            location, at_time, include_slots=True, window=_parse_window()
        ),
        "last_updated": iso(at_time),
    })


@locations_bp.get("/locations/<int:location_id>/slots")
def get_location_slots(location_id):
    at_time = now()
    location = db.session.get(ParkingLocation, location_id)
    if location is None or not location.is_active:
        raise ApiError("Parking location not found.", 404)

    window = _parse_window()
    slots = sorted(location.slots, key=lambda slot: slot.slot_number.lower())
    reserved_ids = reserved_slot_ids([slot.id for slot in slots], at_time)

    return success({
        "location": {
            "id": location.id,
            "name": location.name,
            "hourly_rate": location.hourly_rate,
            "opening_time": location.opening_time,
            "closing_time": location.closing_time,
            "is_open_now": is_open_at(location, at_time),
        },
        "slots": [serialize_slot(slot, at_time, reserved_ids, window) for slot in slots],
        "availability": location_availability(location, at_time, slots),
        "window": {"start_time": iso(window[0]), "end_time": iso(window[1])} if window else None,
        "last_updated": iso(at_time),
    })


@locations_bp.get("/locations/<int:location_id>/estimate")
def estimate_price(location_id):
    """Backend-calculated price preview for a chosen time window."""
    location = db.session.get(ParkingLocation, location_id)
    if location is None or not location.is_active:
        raise ApiError("Parking location not found.", 404)

    start = parse_datetime(request.args.get("start_time"), "start_time")
    end = parse_datetime(request.args.get("end_time"), "end_time")

    hours = max((end - start).total_seconds() / 3600, 0)
    try:
        validate_booking_window(location, start, end)
        is_valid, message = True, None
    except ApiError as error:
        is_valid, message = False, error.message

    return success({
        "hourly_rate": location.hourly_rate,
        "hours": round(hours, 2),
        "estimated_total": calculate_price(location.hourly_rate, start, end) if is_valid else None,
        "is_valid": is_valid,
        "message": message,
        "start_time": iso(start),
        "end_time": iso(end),
    })


@locations_bp.get("/slots/available")
def available_slots():
    """Flat list of slots that can be booked right now (or in a given window)."""
    at_time = now()
    window = _parse_window()

    query = (
        ParkingSlot.query.join(ParkingLocation)
        .filter(ParkingLocation.is_active.is_(True), ParkingSlot.status == "available")
    )

    location_id = request.args.get("location_id")
    if location_id:
        try:
            query = query.filter(ParkingSlot.location_id == int(location_id))
        except ValueError:
            raise ApiError("location_id must be a whole number.", 400) from None

    rows = []
    for slot in query.all():
        bookable = is_slot_bookable(slot, window[0], window[1], at_time) if window else True
        if bookable:
            rows.append({
                "id": slot.id,
                "slot_number": slot.slot_number,
                "slot_type": slot.slot_type,
                "location_id": slot.location_id,
                "location_name": slot.location.name,
                "hourly_rate": slot.location.hourly_rate,
            })

    return success({"slots": rows, "count": len(rows), "last_updated": iso(at_time)})
