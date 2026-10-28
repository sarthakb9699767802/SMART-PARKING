"""Optional demo data for SmartPark.

This script is NEVER run automatically. Nothing is added to the database unless
you run it yourself, and it refuses to run silently when accounts already exist.

Usage (Windows PowerShell, from the backend folder):
    python seed_demo.py          # asks for confirmation if the database has users
    python seed_demo.py --yes    # no prompt

What it creates (all clearly labelled as demonstration data):
    Owner: owner@smartpark.demo / Park@12345  (Skyline Parking Services)
    User:  user@smartpark.demo  / Park@12345  (Demo User)
    Two parking locations owned by the demo owner, one with 30 slots
    A handful of slots marked occupied so availability looks realistic
    One future reservation so the dashboards have something to show
"""

import sys
from datetime import datetime, timedelta

from app import create_app
from extensions import db
from models import (
    ROLE_OWNER,
    ROLE_USER,
    SLOT_OCCUPIED,
    ParkingLocation,
    ParkingSlot,
    Reservation,
    User,
)
from services.booking_service import (
    calculate_price,
    generate_booking_reference,
    log_activity,
)
from utils import now

OWNER_EMAIL = "owner@smartpark.demo"
USER_EMAIL = "user@smartpark.demo"
DEMO_PASSWORD = "Park@12345"

LOCATIONS = [
    {
        "name": "City Centre Parking",
        "address": "12 MG Road, Near Central Metro Station",
        "city": "Pune",
        "area": "Camp",
        "description": "Covered multi-level parking in the heart of the city. Demo data.",
        "opening_time": "07:00",
        "closing_time": "23:00",
        "hourly_rate": 40.0,
        "latitude": 18.5158,
        "longitude": 73.8785,
        "slots": 30,
        "occupied": 7,
    },
    {
        "name": "Riverside Mall Parking",
        "address": "Riverside Mall, Baner Road",
        "city": "Pune",
        "area": "Baner",
        "description": "Open air parking behind the mall. Demo data.",
        "opening_time": "09:00",
        "closing_time": "22:00",
        "hourly_rate": 30.0,
        "latitude": 18.5590,
        "longitude": 73.7800,
        "slots": 20,
        "occupied": 3,
    },
]


def seed():
    app = create_app()
    with app.app_context():
        existing_users = db.session.query(User).count()
        if existing_users:
            print(f"The database already contains {existing_users} account(s).")
            if "--yes" not in sys.argv:
                answer = input("Add demo records anyway? Type 'yes' to continue: ").strip()
                if answer.lower() != "yes":
                    print("Nothing was changed.")
                    return

        owner = User.query.filter_by(email=OWNER_EMAIL).first()
        if owner:
            print(f"Demo owner {OWNER_EMAIL} already exists - nothing to do.")
            return

        owner = User(
            name="Skyline Parking Services",
            email=OWNER_EMAIL,
            role=ROLE_OWNER,
            business_name="Skyline Parking Services",
            created_at=now(),
        )
        owner.set_password(DEMO_PASSWORD)

        demo_user = User(
            name="Demo User",
            email=USER_EMAIL,
            role=ROLE_USER,
            created_at=now(),
        )
        demo_user.set_password(DEMO_PASSWORD)
        db.session.add_all([owner, demo_user])
        db.session.flush()

        first_location = None
        for index, spec in enumerate(LOCATIONS):
            location = ParkingLocation(
                owner_id=owner.id,
                name=spec["name"],
                address=spec["address"],
                city=spec["city"],
                area=spec["area"],
                description=spec["description"],
                opening_time=spec["opening_time"],
                closing_time=spec["closing_time"],
                hourly_rate=spec["hourly_rate"],
                latitude=spec["latitude"],
                longitude=spec["longitude"],
                is_active=True,
                created_at=now(),
            )
            db.session.add(location)
            db.session.flush()

            for number in range(1, spec["slots"] + 1):
                db.session.add(
                    ParkingSlot(
                        location_id=location.id,
                        slot_number=f"{number:02d}",
                        slot_type="standard",
                        status=SLOT_OCCUPIED if number <= spec["occupied"] else "available",
                        last_updated=now(),
                    )
                )
            log_activity(
                f"Parking location created: {location.name}",
                actor=owner,
                location_id=location.id,
            )
            if index == 0:
                first_location = location

        db.session.flush()

        # One upcoming booking for the demo user so dashboards are not empty.
        free_slot = (
            ParkingSlot.query.filter_by(
                location_id=first_location.id, status="available"
            )
            .order_by(ParkingSlot.slot_number.asc())
            .first()
        )
        if free_slot is not None:
            start = (now() + timedelta(hours=2)).replace(minute=0, second=0)
            closing = datetime.strptime(first_location.closing_time, "%H:%M").time()
            # Keep the demo booking inside opening hours and on one calendar day.
            if start.date() != now().date() or start.time() >= closing:
                start = (now() + timedelta(days=1)).replace(hour=10, minute=0, second=0)
            end = start + timedelta(hours=2)
            rate = first_location.hourly_rate
            db.session.add(
                Reservation(
                    booking_reference=generate_booking_reference(),
                    user_id=demo_user.id,
                    slot_id=free_slot.id,
                    start_time=start,
                    end_time=end,
                    hourly_rate_at_booking=rate,
                    total_price=calculate_price(rate, start, end),
                    status="active",
                    created_at=now(),
                )
            )
            log_activity(
                f"Reservation created for slot {free_slot.slot_number} (demo data)",
                actor=demo_user,
                location_id=first_location.id,
                slot_id=free_slot.id,
            )

        db.session.commit()

        print("Demo data created:")
        print(f"  Owner  -> {OWNER_EMAIL} / {DEMO_PASSWORD}")
        print(f"  User   -> {USER_EMAIL} / {DEMO_PASSWORD}")
        print("  Locations -> " + ", ".join(spec["name"] for spec in LOCATIONS))
        print("These accounts only exist because you ran this seed script.")


if __name__ == "__main__":
    seed()
