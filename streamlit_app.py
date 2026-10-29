"""Streamlit entry point for the SmartPark migration prototype.

This is deliberately separate from the existing React + Flask application.
It reuses the existing database models and availability rules. It does not
seed or delete data automatically.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

import streamlit as st

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from extensions import db  # noqa: E402
from models import (  # noqa: E402
    MANUAL_SLOT_STATUSES,
    ParkingLocation,
    ParkingSlot,
    Reservation,
    User,
)
from services.booking_service import (  # noqa: E402
    effective_slot_status,
    location_availability,
    reserved_slot_ids,
)
from utils import now  # noqa: E402

st.set_page_config(page_title="SmartPark", page_icon="🅿️", layout="wide")

@st.cache_resource
def get_flask_app():
    # Uses the project's existing database configuration and schema.
    return create_app()

flask_app = get_flask_app()


def logout():
    st.session_state.pop("smartpark_user_id", None)
    st.rerun()


def render_login():
    st.title("🅿️ SmartPark")
    st.subheader("Sign in")
    st.caption("Use an account already registered in your SmartPark database.")
    with st.form("login_form"):
        email = st.text_input("Email").strip().lower()
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Sign in", type="primary")
    if submitted:
        with flask_app.app_context():
            user = User.query.filter_by(email=email).first()
            if user and user.check_password(password):
                st.session_state["smartpark_user_id"] = user.id
                st.rerun()
            st.error("Email or password is incorrect.")


def render_dashboard(user):
    st.title("🅿️ SmartPark")
    st.caption("Streamlit migration prototype · Existing React/Flask app remains unchanged.")
    with st.sidebar:
        st.write(f"Signed in as **{user.name}**")
        st.write(f"Role: {user.role.title()}")
        if st.button("Sign out", use_container_width=True):
            logout()

    locations = ParkingLocation.query.filter_by(is_active=True).order_by(ParkingLocation.name).all()
    if user.role == "owner":
        locations = ParkingLocation.query.filter_by(owner_id=user.id, is_active=True).order_by(ParkingLocation.name).all()

    if not locations:
        st.info(
            "No active parking locations are available for this account. "
            "The app does not create demo users or sample parking data automatically. "
            "For local demo data, follow STREAMLIT_SETUP.md."
        )
        return

    st.subheader("Parking locations")
    for location in locations:
        slots = ParkingSlot.query.filter_by(location_id=location.id).order_by(ParkingSlot.slot_number).all()
        counts = location_availability(location, slots=slots)
        with st.container(border=True):
            st.markdown(f"### {location.name}")
            st.write(f"{location.address}, {location.area}, {location.city}")
            st.caption(f"Hours: {location.opening_time}–{location.closing_time} · ₹{location.hourly_rate:.2f}/hour")
            cols = st.columns(4)
            cols[0].metric("Total", counts["total"])
            cols[1].metric("Available", counts["available"])
            cols[2].metric("Occupied", counts["occupied"])
            cols[3].metric("Reserved", counts["reserved"])

            if slots:
                reserved_ids = reserved_slot_ids([slot.id for slot in slots])
                slot_rows = []
                for slot in slots:
                    slot_rows.append({
                        "Slot": slot.slot_number,
                        "Type": slot.slot_type,
                        "Status": effective_slot_status(slot, reserved_ids=reserved_ids),
                        "Last updated": slot.last_updated.strftime("%Y-%m-%d %H:%M") if slot.last_updated else "—",
                    })
                st.dataframe(slot_rows, use_container_width=True, hide_index=True)

                if user.role == "owner":
                    st.markdown("**Owner status simulation**")
                    st.caption("This changes the stored manual status; it does not connect to a physical sensor.")
                    with st.form(f"slot_status_{location.id}"):
                        chosen_slot_id = st.selectbox(
                            "Select slot",
                            options=[slot.id for slot in slots],
                            format_func=lambda slot_id: next(
                                f"{slot.slot_number} (current: {slot.status})"
                                for slot in slots if slot.id == slot_id
                            ),
                            key=f"slot_select_{location.id}",
                        )
                        new_status = st.selectbox(
                            "Set manual status",
                            options=list(MANUAL_SLOT_STATUSES),
                            key=f"status_select_{location.id}",
                        )
                        update = st.form_submit_button("Update slot status")
                    if update:
                        chosen_slot = db.session.get(ParkingSlot, chosen_slot_id)
                        if chosen_slot is None or chosen_slot.location_id != location.id:
                            st.error("That slot could not be found in this location.")
                        else:
                            current = now()
                            active_reservation = Reservation.query.filter(
                                Reservation.slot_id == chosen_slot.id,
                                Reservation.status == "active",
                                Reservation.start_time <= current,
                                Reservation.end_time > current,
                            ).first()
                            if active_reservation and new_status != "available":
                                st.error("This slot has an active reservation. Its status was not changed.")
                            else:
                                chosen_slot.status = new_status
                                chosen_slot.last_updated = datetime.now()
                                db.session.commit()
                                st.success(f"Slot {chosen_slot.slot_number} updated to {new_status}.")
                                st.rerun()


with flask_app.app_context():
    user_id = st.session_state.get("smartpark_user_id")
    current_user = db.session.get(User, user_id) if user_id else None
    if current_user is None:
        render_login()
    else:
        render_dashboard(current_user)
