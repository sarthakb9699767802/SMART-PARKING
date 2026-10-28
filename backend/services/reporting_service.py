"""Owner dashboard and statistics built from real database rows only."""
from datetime import timedelta

from sqlalchemy import func

from extensions import db
from models import (
    RESERVATION_ACTIVE,
    RESERVATION_CANCELLED,
    Reservation,
    ParkingLocation,
    ParkingSlot,
)
from services.booking_service import (
    finalize_expired_reservations,
    location_availability,
    recent_activity,
    serialize_reservation,
)
from utils import iso, now


def _owned_location_ids(owner):
    return [location.id for location in owner.locations]


def owned_reservations_query(owner):
    """All reservations whose slot belongs to one of the owner's locations."""
    return (
        Reservation.query.join(ParkingSlot, Reservation.slot_id == ParkingSlot.id)
        .join(ParkingLocation, ParkingSlot.location_id == ParkingLocation.id)
        .filter(ParkingLocation.owner_id == owner.id)
    )


def owner_dashboard(owner):
    """Headline numbers plus recent activity for the owner overview page."""
    finalize_expired_reservations()
    at_time = now()
    locations = owner.locations
    slot_total = available = occupied = reserved = out_of_service = 0

    for location in locations:
        counts = location_availability(location, at_time)
        slot_total += counts["total"]
        available += counts["available"]
        occupied += counts["occupied"]
        reserved += counts["reserved"]
        out_of_service += counts["out_of_service"]

    reservations = owned_reservations_query(owner).all()
    active_bookings = [r for r in reservations if r.status == RESERVATION_ACTIVE]
    upcoming = sorted(
        [r for r in active_bookings if r.start_time >= at_time], key=lambda r: r.start_time
    )
    estimated_revenue = round(
        sum(r.total_price for r in reservations if r.status != RESERVATION_CANCELLED), 2
    )

    return {
        "locations_owned": len(locations),
        "active_locations": len([location for location in locations if location.is_active]),
        "slots": {
            "total": slot_total,
            "available": available,
            "occupied": occupied,
            "reserved": reserved,
            "out_of_service": out_of_service,
        },
        "bookings": {
            "total": len(reservations),
            "active": len(active_bookings),
            "upcoming": len(upcoming),
            "cancelled": len([r for r in reservations if r.status == RESERVATION_CANCELLED]),
            "completed": len([r for r in reservations if r.status == "completed"]),
        },
        "estimated_revenue": estimated_revenue,
        "revenue_note": "Estimated from bookings. No payment gateway is connected, so no money has been collected.",
        "upcoming_reservations": [
            serialize_reservation(r, include_user=True) for r in upcoming[:5]
        ],
        "recent_activity": recent_activity(limit=8, owner=owner),
        "last_updated": iso(at_time),
    }


def owner_statistics(owner):
    """Chart friendly data: occupancy per location and last 7 days of bookings."""
    finalize_expired_reservations()
    at_time = now()
    locations = owner.locations

    occupancy = []
    for location in locations:
        counts = location_availability(location, at_time)
        occupancy.append(
            {
                "location_id": location.id,
                "name": location.name,
                "available": counts["available"],
                "occupied": counts["occupied"],
                "reserved": counts["reserved"],
                "out_of_service": counts["out_of_service"],
                "total": counts["total"],
            }
        )

    # "Booking activity" = bookings created per day over the last 7 days,
    # which stays meaningful for bookings made in advance.
    start_day = (at_time - timedelta(days=6)).date()
    booking_rows = (
        db.session.query(
            func.date(Reservation.created_at).label("day"),
            func.count(Reservation.id),
            func.coalesce(func.sum(Reservation.total_price), 0.0),
        )
        .join(ParkingSlot, Reservation.slot_id == ParkingSlot.id)
        .join(ParkingLocation, ParkingSlot.location_id == ParkingLocation.id)
        .filter(ParkingLocation.owner_id == owner.id)
        .filter(Reservation.status != RESERVATION_CANCELLED)
        .filter(Reservation.created_at >= at_time - timedelta(days=7))
        .group_by("day")
        .all()
    )
    by_day = {row[0]: (row[1], float(row[2])) for row in booking_rows}

    activity = []
    for offset in range(7):
        day = start_day + timedelta(days=offset)
        key = day.isoformat()
        count, revenue = by_day.get(key, (0, 0.0))
        activity.append(
            {"date": key, "bookings": int(count), "estimated_revenue": round(revenue, 2)}
        )

    total_revenue = round(
        owned_reservations_query(owner)
        .filter(Reservation.status != RESERVATION_CANCELLED)
        .with_entities(func.coalesce(func.sum(Reservation.total_price), 0.0))
        .scalar()
        or 0.0,
        2,
    )

    return {
        "occupancy": occupancy,
        "booking_activity": activity,
        "estimated_revenue_total": total_revenue,
        "generated_at": iso(at_time),
    }
