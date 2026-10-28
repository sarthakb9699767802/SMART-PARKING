"""Business rules for availability, bookings and cancellations.

Everything that decides "is this slot free?" or "may this booking happen?"
lives here so the API routes stay thin and every caller applies the same rules.
"""

import secrets
import string
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError

from extensions import db
from models import (
    MANUAL_SLOT_STATUSES,
    RESERVATION_ACTIVE,
    RESERVATION_CANCELLED,
    RESERVATION_COMPLETED,
    SLOT_AVAILABLE,
    SLOT_OCCUPIED,
    SLOT_OUT_OF_SERVICE,
    SLOT_RESERVED,
    ActivityLog,
    ParkingLocation,
    ParkingSlot,
    Reservation,
)
from utils import MAX_RESERVATION_HOURS, MIN_RESERVATION_MINUTES, ApiError, iso, now

REFERENCE_ALPHABET = string.ascii_uppercase + string.digits


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------
def log_activity(action, actor=None, location_id=None, slot_id=None):
    """Record an action. The caller commits together with its own changes."""
    db.session.add(
        ActivityLog(
            actor_user_id=actor.id if actor else None,
            location_id=location_id,
            slot_id=slot_id,
            action=action,
            timestamp=now(),
        )
    )


def recent_activity(limit=8, owner=None):
    query = ActivityLog.query
    if owner is not None:
        query = query.join(ParkingLocation, ActivityLog.location_id == ParkingLocation.id).filter(
            ParkingLocation.owner_id == owner.id
        )
    rows = query.order_by(ActivityLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": row.id,
            "action": row.action,
            "timestamp": iso(row.timestamp),
            "actor_name": row.actor.name if row.actor else "System",
            "location_id": row.location_id,
            "slot_id": row.slot_id,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Availability helpers
# ---------------------------------------------------------------------------
def overlaps(start_a, end_a, start_b, end_b):
    """Half-open interval overlap: [start, end)."""
    return start_a < end_b and end_a > start_b


def reserved_slot_ids(slot_ids, at_time=None):
    """Slot ids that have an active reservation covering ``at_time``."""
    if not slot_ids:
        return set()
    at_time = at_time or now()
    rows = (
        db.session.query(Reservation.slot_id)
        .filter(
            Reservation.slot_id.in_(slot_ids),
            Reservation.status == RESERVATION_ACTIVE,
            Reservation.start_time <= at_time,
            Reservation.end_time > at_time,
        )
        .all()
    )
    return {row[0] for row in rows}


def effective_slot_status(slot, at_time=None, reserved_ids=None):
    """Combine the stored manual status with live reservations."""
    at_time = at_time or now()
    if slot.status == SLOT_OUT_OF_SERVICE:
        return SLOT_OUT_OF_SERVICE
    if slot.status == SLOT_OCCUPIED:
        return SLOT_OCCUPIED
    if reserved_ids is not None:
        return SLOT_RESERVED if slot.id in reserved_ids else SLOT_AVAILABLE
    reserved = Reservation.query.filter(
        Reservation.slot_id == slot.id,
        Reservation.status == RESERVATION_ACTIVE,
        Reservation.start_time <= at_time,
        Reservation.end_time > at_time,
    ).first()
    return SLOT_RESERVED if reserved else SLOT_AVAILABLE


def current_reservation_for_slot(slot_id, at_time=None):
    at_time = at_time or now()
    return Reservation.query.filter(
        Reservation.slot_id == slot_id,
        Reservation.status == RESERVATION_ACTIVE,
        Reservation.start_time <= at_time,
        Reservation.end_time > at_time,
    ).first()


def location_availability(location, at_time=None, slots=None):
    """Counts per effective status. The five numbers always add up to total."""
    at_time = at_time or now()
    slots = slots if slots is not None else location.slots
    reserved_ids = reserved_slot_ids([slot.id for slot in slots], at_time)

    counts = {
        "total": len(slots),
        SLOT_AVAILABLE: 0,
        SLOT_OCCUPIED: 0,
        SLOT_RESERVED: 0,
        SLOT_OUT_OF_SERVICE: 0,
    }
    for slot in slots:
        counts[effective_slot_status(slot, at_time, reserved_ids)] += 1
    return counts


def is_open_at(location, at_time=None):
    at_time = at_time or now()
    current = at_time.strftime("%H:%M")
    return location.opening_time <= current < location.closing_time


# ---------------------------------------------------------------------------
# Serialisers (single source of truth for JSON shapes)
# ---------------------------------------------------------------------------
def serialize_slot(slot, at_time=None, reserved_ids=None, window=None):
    at_time = at_time or now()
    status = effective_slot_status(slot, at_time, reserved_ids)
    active = None
    if status == SLOT_RESERVED:
        active = current_reservation_for_slot(slot.id, at_time)

    data = {
        "id": slot.id,
        "location_id": slot.location_id,
        "slot_number": slot.slot_number,
        "slot_type": slot.slot_type,
        "status": status,
        "manual_status": slot.status,
        "last_updated": iso(slot.last_updated),
        "reserved_until": iso(active.end_time) if active else None,
    }

    if window is not None:
        start, end = window
        data["is_bookable_for_window"] = is_slot_bookable(slot, start, end, at_time)
    return data


def serialize_location(location, at_time=None, include_slots=False, window=None):
    at_time = at_time or now()
    counts = location_availability(location, at_time)
    data = {
        "id": location.id,
        "owner_id": location.owner_id,
        "name": location.name,
        "address": location.address,
        "city": location.city,
        "area": location.area,
        "description": location.description,
        "opening_time": location.opening_time,
        "closing_time": location.closing_time,
        "hourly_rate": location.hourly_rate,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "is_active": location.is_active,
        "is_open_now": is_open_at(location, at_time),
        "created_at": iso(location.created_at),
        "updated_at": iso(location.updated_at),
        "availability": counts,
    }
    if include_slots:
        reserved_ids = reserved_slot_ids([slot.id for slot in location.slots], at_time)
        data["slots"] = [
            serialize_slot(slot, at_time, reserved_ids, window)
            for slot in sorted(location.slots, key=lambda s: s.slot_number.lower())
        ]
    return data


def serialize_reservation(reservation, include_user=False, include_location=False):
    slot = reservation.slot
    location = slot.location if slot else None
    data = {
        "id": reservation.id,
        "booking_reference": reservation.booking_reference,
        "status": reservation.status,
        "start_time": iso(reservation.start_time),
        "end_time": iso(reservation.end_time),
        "hourly_rate_at_booking": reservation.hourly_rate_at_booking,
        "total_price": reservation.total_price,
        "created_at": iso(reservation.created_at),
        "cancelled_at": iso(reservation.cancelled_at),
        "is_paid": False,
        "slot": {
            "id": slot.id,
            "slot_number": slot.slot_number,
            "slot_type": slot.slot_type,
        }
        if slot
        else None,
        "location": {
            "id": location.id,
            "name": location.name,
            "address": location.address,
            "city": location.city,
            "area": location.area,
            "opening_time": location.opening_time,
            "closing_time": location.closing_time,
        }
        if location and include_location
        else ({"id": location.id, "name": location.name} if location else None),
    }
    if include_user:
        data["user"] = {"id": reservation.user.id, "name": reservation.user.name}
    return data


# ---------------------------------------------------------------------------
# Reservation lifecycle
# ---------------------------------------------------------------------------
def finalize_expired_reservations():
    """Mark finished active bookings as completed. Safe to call on every read."""
    changed = (
        Reservation.query.filter(
            Reservation.status == RESERVATION_ACTIVE, Reservation.end_time <= now()
        ).update({Reservation.status: RESERVATION_COMPLETED}, synchronize_session=False)
    )
    if changed:
        db.session.commit()
    return changed


def generate_booking_reference():
    return "SP-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(8))


def calculate_price(hourly_rate, start, end):
    hours = (end - start).total_seconds() / 3600
    return round(hours * hourly_rate, 2)


def _parse_hhmm(value):
    return datetime.strptime(value, "%H:%M").time()


def validate_booking_window(location, start, end, at_time=None):
    at_time = at_time or now()

    if end <= start:
        raise ApiError("The end time must be after the start time.", 400,
                       {"end_time": "End time must be after the start time."})

    minutes = (end - start).total_seconds() / 60
    if minutes < MIN_RESERVATION_MINUTES:
        raise ApiError(
            f"A booking must be at least {MIN_RESERVATION_MINUTES} minutes long.", 400,
            {"end_time": f"Minimum {MIN_RESERVATION_MINUTES} minutes."})
    if minutes > MAX_RESERVATION_HOURS * 60:
        raise ApiError(
            f"A booking cannot be longer than {MAX_RESERVATION_HOURS} hours.", 400,
            {"end_time": f"Maximum {MAX_RESERVATION_HOURS} hours."})

    if start < at_time - timedelta(minutes=1):
        raise ApiError("The start time cannot be in the past.", 400,
                       {"start_time": "Choose a start time from now onwards."})

    if start.date() != end.date():
        raise ApiError("A booking must start and end on the same day.", 400,
                       {"end_time": "Choose an end time on the same calendar day."})

    opening = _parse_hhmm(location.opening_time)
    closing = _parse_hhmm(location.closing_time)
    if not (start.time() >= opening and end.time() <= closing):
        raise ApiError(
            f"This parking location is open from {location.opening_time} to {location.closing_time}.",
            400,
            {"start_time": f"Book between {location.opening_time} and {location.closing_time}."},
        )


def is_slot_bookable(slot, start, end, at_time=None):
    """True when the slot can be reserved for the given window."""
    if slot.location is None or not slot.location.is_active:
        return False
    if slot.status != SLOT_AVAILABLE:
        return False
    conflict = Reservation.query.filter(
        Reservation.slot_id == slot.id,
        Reservation.status == RESERVATION_ACTIVE,
        Reservation.start_time < end,
        Reservation.end_time > start,
    ).first()
    return conflict is None


def create_reservation(user, slot_id, start, end):
    """Create a booking or raise an ApiError explaining why it is not possible."""
    slot = db.session.get(ParkingSlot, slot_id)
    if slot is None:
        raise ApiError("That parking slot no longer exists.", 404)

    location = slot.location
    if location is None or not location.is_active:
        raise ApiError("This parking location is not accepting bookings right now.", 409)

    at_time = now()
    validate_booking_window(location, start, end, at_time)

    if slot.status == SLOT_OUT_OF_SERVICE:
        raise ApiError("This slot is out of service.", 409, {"slot_id": "Out of service."})
    if slot.status != SLOT_AVAILABLE:
        raise ApiError(
            "This slot is currently marked as occupied. Please choose another slot.",
            409,
            {"slot_id": "Slot is not available."},
        )

    conflict = Reservation.query.filter(
        Reservation.slot_id == slot.id,
        Reservation.status == RESERVATION_ACTIVE,
        Reservation.start_time < end,
        Reservation.end_time > start,
    ).first()
    if conflict is not None:
        raise ApiError(
            "This slot is already reserved for part of that time. Please pick another slot or time.",
            409,
            {"slot_id": "Overlapping reservation exists."},
        )

    reservation = Reservation(
        booking_reference=generate_booking_reference(),
        user_id=user.id,
        slot_id=slot.id,
        start_time=start,
        end_time=end,
        hourly_rate_at_booking=location.hourly_rate,
        total_price=calculate_price(location.hourly_rate, start, end),
        status=RESERVATION_ACTIVE,
        created_at=at_time,
    )

    try:
        db.session.add(reservation)
        log_activity(
            f"Reservation created for slot {slot.slot_number}",
            actor=user,
            location_id=location.id,
            slot_id=slot.id,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise ApiError("The booking could not be saved. Please try again.", 500) from None

    # Defensive second check: if two requests slipped through the read-time
    # check, the later row is removed so a slot is never double booked.
    later_conflict = Reservation.query.filter(
        Reservation.slot_id == slot.id,
        Reservation.id != reservation.id,
        Reservation.status == RESERVATION_ACTIVE,
        Reservation.start_time < end,
        Reservation.end_time > start,
    ).first()
    if later_conflict is not None:
        db.session.delete(reservation)
        db.session.commit()
        raise ApiError(
            "This slot was just booked by someone else. Please choose another slot.",
            409,
            {"slot_id": "Overlapping reservation exists."},
        )

    return reservation


def cancel_reservation(reservation, actor, reason="Reservation cancelled"):
    """Cancel an active reservation. Raises ApiError when that is not allowed."""
    if reservation.status == RESERVATION_CANCELLED:
        raise ApiError("This reservation is already cancelled.", 409)
    if reservation.status == RESERVATION_COMPLETED:
        raise ApiError("Completed reservations cannot be cancelled.", 409)
    if reservation.end_time <= now():
        raise ApiError("This reservation has already ended and cannot be cancelled.", 409)

    reservation.status = RESERVATION_CANCELLED
    reservation.cancelled_at = now()
    log_activity(
        f"{reason} ({reservation.booking_reference})",
        actor=actor,
        location_id=reservation.slot.location_id if reservation.slot else None,
        slot_id=reservation.slot_id,
    )
    db.session.commit()
    return reservation


# ---------------------------------------------------------------------------
# Slot status changes
# ---------------------------------------------------------------------------
def set_slot_status(slot, new_status, actor=None, context="Status change"):
    """Change a slot's stored status while protecting active reservations."""
    if new_status not in MANUAL_SLOT_STATUSES:
        raise ApiError(
            "Invalid slot status.",
            400,
            {"status": "Use available, occupied or out_of_service."},
        )

    active = current_reservation_for_slot(slot.id)
    if active is not None:
        raise ApiError(
            "This slot has an active reservation and cannot be changed manually.",
            409,
            {"slot_id": "Active reservation in progress."},
        )

    if slot.status == new_status:
        return slot

    slot.status = new_status
    slot.last_updated = now()
    log_activity(
        f"Slot {slot.slot_number} marked {new_status.replace('_', ' ')} ({context})",
        actor=actor,
        location_id=slot.location_id,
        slot_id=slot.id,
    )
    db.session.commit()
    return slot
