"""Backend tests for the SmartPark API.

Run from the project root:
    .venv\\Scripts\\python -m pytest -q

Each test gets its own temporary SQLite file, so the development database in
backend/data/smartpark.db is never touched.
"""

import os
import sys
from datetime import datetime, timedelta

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "backend"))

from app import create_app  # noqa: E402
from extensions import db  # noqa: E402
from models import ParkingSlot, Reservation  # noqa: E402
from utils import now  # noqa: E402

PASSWORD = "Park@12345"


# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------
@pytest.fixture()
def app(tmp_path):
    database_uri = "sqlite:///" + str(tmp_path / "test_smartpark.db").replace("\\", "/")
    application = create_app({"SQLALCHEMY_DATABASE_URI": database_uri, "TESTING": True})
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def register(client, email, role="user", name="Test Person", business_name=None):
    payload = {
        "name": name,
        "email": email,
        "password": PASSWORD,
        "confirm_password": PASSWORD,
        "role": role,
    }
    if business_name:
        payload["business_name"] = business_name
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def login(client, email, role=None):
    payload = {"email": email, "password": PASSWORD}
    if role:
        payload["role"] = role
    return client.post("/api/auth/login", json=payload)


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def make_owner(client, email="owner@example.com", business_name="Skyline Parking"):
    data = register(client, email, role="owner", business_name=business_name)
    return data["token"], data["user"]


def make_user(client, email="user@example.com"):
    data = register(client, email)
    return data["token"], data["user"]


def create_location(client, token, name="City Centre Parking", total_slots=3, **overrides):
    payload = {
        "name": name,
        "address": "12 MG Road",
        "city": "Pune",
        "area": "Camp",
        "opening_time": "08:00",
        "closing_time": "22:00",
        "hourly_rate": 40.0,
        "total_slots": total_slots,
    }
    payload.update(overrides)
    response = client.post("/api/owner/locations", json=payload, headers=headers(token))
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]["location"]


def tomorrow_at(hour, minute=0):
    day = now().date() + timedelta(days=1)
    return datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)


def iso(value):
    return value.isoformat(timespec="seconds")


def book(client, token, slot_id, start, end):
    return client.post(
        "/api/reservations",
        json={"slot_id": slot_id, "start_time": iso(start), "end_time": iso(end)},
        headers=headers(token),
    )


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------
def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is True
    assert body["data"]["status"] == "ok"


def test_unknown_route_returns_json_404(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["ok"] is False


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
def test_user_registration_and_login(client):
    data = register(client, "asha@example.com", name="Asha")
    assert data["user"]["role"] == "user"
    assert data["user"]["email"] == "asha@example.com"
    assert data["token"]

    response = login(client, "asha@example.com", role="user")
    assert response.status_code == 200
    token = response.get_json()["data"]["token"]

    me = client.get("/api/auth/me", headers=headers(token))
    assert me.status_code == 200
    assert me.get_json()["data"]["user"]["name"] == "Asha"


def test_owner_registration_requires_business_name(client):
    response = client.post("/api/auth/register", json={
        "name": "Ravi", "email": "ravi@example.com", "password": PASSWORD, "role": "owner",
    })
    assert response.status_code == 400
    assert "business_name" in response.get_json()["details"]


def test_owner_registration_and_login(client):
    token, user = make_owner(client, "ravi@example.com")
    assert user["role"] == "owner"
    assert user["business_name"] == "Skyline Parking"

    response = login(client, "ravi@example.com", role="owner")
    assert response.status_code == 200


def test_duplicate_registration_rejected(client):
    register(client, "dup@example.com")
    response = client.post("/api/auth/register", json={
        "name": "Dup", "email": "dup@example.com", "password": PASSWORD, "role": "user",
    })
    assert response.status_code == 409


def test_registration_validation_errors(client):
    short_password = client.post("/api/auth/register", json={
        "name": "A", "email": "a@example.com", "password": "123", "role": "user",
    })
    assert short_password.status_code == 400

    bad_email = client.post("/api/auth/register", json={
        "name": "A", "email": "not-an-email", "password": PASSWORD, "role": "user",
    })
    assert bad_email.status_code == 400

    mismatch = client.post("/api/auth/register", json={
        "name": "A", "email": "a@example.com", "password": PASSWORD,
        "confirm_password": "Different1!", "role": "user",
    })
    assert mismatch.status_code == 400

    missing_name = client.post("/api/auth/register", json={
        "email": "b@example.com", "password": PASSWORD, "role": "user",
    })
    assert missing_name.status_code == 400


def test_invalid_credentials_rejected(client):
    register(client, "known@example.com")
    response = client.post("/api/auth/login", json={"email": "known@example.com"})
    assert response.status_code == 400  # no password supplied

    wrong = client.post("/api/auth/login", json={
        "email": "known@example.com", "password": "WrongPass1!",
    })
    assert wrong.status_code == 401

    unknown = client.post("/api/auth/login", json={
        "email": "nobody@example.com", "password": PASSWORD,
    })
    assert unknown.status_code == 401


def test_role_mismatch_on_login_is_rejected(client):
    make_owner(client, "owner-login@example.com")
    response = login(client, "owner-login@example.com", role="user")
    assert response.status_code == 403


def test_logout_invalidates_token(client):
    data = register(client, "logout@example.com")
    token = data["token"]
    assert client.get("/api/auth/me", headers=headers(token)).status_code == 200

    out = client.post("/api/auth/logout", headers=headers(token))
    assert out.status_code == 200
    assert client.get("/api/auth/me", headers=headers(token)).status_code == 401


def test_me_requires_authentication(client):
    assert client.get("/api/auth/me").status_code == 401


# ---------------------------------------------------------------------------
# Role restrictions
# ---------------------------------------------------------------------------
def test_user_cannot_access_owner_endpoints(client):
    token, _ = make_user(client)
    for path in ("/api/owner/dashboard", "/api/owner/locations", "/api/owner/statistics"):
        response = client.get(path, headers=headers(token))
        assert response.status_code == 403, path

    create = client.post("/api/owner/locations", json={
        "name": "Nope", "address": "x", "city": "x", "area": "x", "hourly_rate": 10,
    }, headers=headers(token))
    assert create.status_code == 403


def test_owner_cannot_use_user_booking_endpoints(client):
    token, _ = make_owner(client)
    assert client.get("/api/reservations/my", headers=headers(token)).status_code == 403


def test_anonymous_requests_are_rejected(client):
    assert client.get("/api/reservations/my").status_code == 401
    assert client.get("/api/owner/dashboard").status_code == 401


# ---------------------------------------------------------------------------
# Locations and slots
# ---------------------------------------------------------------------------
def test_owner_creates_location_with_slots(client):
    token, _ = make_owner(client)
    location = create_location(client, token, total_slots=30)

    assert location["name"] == "City Centre Parking"
    assert location["availability"]["total"] == 30
    assert location["availability"]["available"] == 30
    assert len(location["slots"]) == 30
    assert location["slots"][0]["slot_number"] == "01"
    assert location["latitude"] is None


def test_location_validation(client):
    token, _ = make_owner(client)

    bad_hours = client.post("/api/owner/locations", json={
        "name": "Bad Hours", "address": "a", "city": "Pune", "area": "Camp",
        "opening_time": "22:00", "closing_time": "08:00", "hourly_rate": 20,
    }, headers=headers(token))
    assert bad_hours.status_code == 400

    negative_rate = client.post("/api/owner/locations", json={
        "name": "Bad Rate", "address": "a", "city": "Pune", "area": "Camp",
        "opening_time": "08:00", "closing_time": "20:00", "hourly_rate": -5,
    }, headers=headers(token))
    assert negative_rate.status_code == 400

    missing_name = client.post("/api/owner/locations", json={
        "address": "a", "city": "Pune", "area": "Camp",
        "opening_time": "08:00", "closing_time": "20:00", "hourly_rate": 20,
    }, headers=headers(token))
    assert missing_name.status_code == 400


def test_public_location_and_slot_retrieval(client):
    token, _ = make_owner(client)
    location = create_location(client, token, total_slots=5)

    listing = client.get("/api/locations").get_json()["data"]
    assert listing["count"] == 1
    assert listing["locations"][0]["availability"]["total"] == 5

    detail = client.get(f"/api/locations/{location['id']}")
    assert detail.status_code == 200
    assert len(detail.get_json()["data"]["location"]["slots"]) == 5

    slots = client.get(f"/api/locations/{location['id']}/slots")
    assert slots.status_code == 200
    assert len(slots.get_json()["data"]["slots"]) == 5


def test_search_and_filters(client):
    token, _ = make_owner(client)
    create_location(client, token, name="City Centre Parking", total_slots=2)
    create_location(client, token, name="Riverside Mall Parking", total_slots=2,
                    city="Mumbai", area="Bandra", hourly_rate=90)

    by_name = client.get("/api/locations?search=city").get_json()["data"]
    assert by_name["count"] == 1
    assert by_name["locations"][0]["name"] == "City Centre Parking"

    by_city = client.get("/api/locations?city=Mumbai").get_json()["data"]
    assert by_city["count"] == 1

    by_price = client.get("/api/locations?max_price=50").get_json()["data"]
    assert by_price["count"] == 1

    missing = client.get("/api/locations?search=nowhere").get_json()["data"]
    assert missing["count"] == 0
    assert missing["locations"] == []


def test_duplicate_slot_number_rejected(client):
    token, _ = make_owner(client)
    location = create_location(client, token, total_slots=1)

    response = client.post(
        f"/api/owner/locations/{location['id']}/slots",
        json={"slot_number": "01"},
        headers=headers(token),
    )
    assert response.status_code == 400


def test_slot_addition_and_edit(client):
    token, _ = make_owner(client)
    location = create_location(client, token, total_slots=1)

    added = client.post(
        f"/api/owner/locations/{location['id']}/slots",
        json={"slot_number": "PREMIUM-1", "slot_type": "covered"},
        headers=headers(token),
    )
    assert added.status_code == 201
    slot = added.get_json()["data"]["slot"]
    assert slot["status"] == "available"

    renamed = client.patch(f"/api/owner/slots/{slot['id']}",
                           json={"slot_number": "PREMIUM-2"}, headers=headers(token))
    assert renamed.status_code == 200
    assert renamed.get_json()["data"]["slot"]["slot_number"] == "PREMIUM-2"

    invalid_status = client.patch(f"/api/owner/slots/{slot['id']}",
                                  json={"status": "reserved"}, headers=headers(token))
    assert invalid_status.status_code == 400


def test_owner_isolation_between_accounts(client):
    owner_a, _ = make_owner(client, "a@example.com")
    owner_b, _ = make_owner(client, "b@example.com", business_name="Other Parking")
    location = create_location(client, owner_a, name="Owner A Lot", total_slots=2)
    slot_id = location["slots"][0]["id"]

    assert client.patch(f"/api/owner/locations/{location['id']}",
                        json={"name": "Hijacked"}, headers=headers(owner_b)).status_code == 404
    assert client.delete(f"/api/owner/locations/{location['id']}",
                         headers=headers(owner_b)).status_code == 404
    assert client.post(f"/api/owner/locations/{location['id']}/slots",
                       json={"slot_number": "99"}, headers=headers(owner_b)).status_code == 404
    assert client.patch(f"/api/owner/slots/{slot_id}",
                        json={"status": "occupied"}, headers=headers(owner_b)).status_code == 404
    assert client.post(f"/api/owner/slots/{slot_id}/simulate",
                       json={"status": "occupied"}, headers=headers(owner_b)).status_code == 404

    listing_b = client.get("/api/owner/locations", headers=headers(owner_b)).get_json()["data"]
    assert listing_b["count"] == 0

    dashboard_b = client.get("/api/owner/dashboard", headers=headers(owner_b)).get_json()["data"]
    assert dashboard_b["locations_owned"] == 0
    assert dashboard_b["slots"]["total"] == 0
    assert dashboard_b["bookings"]["total"] == 0

    dashboard_a = client.get("/api/owner/dashboard", headers=headers(owner_a)).get_json()["data"]
    assert dashboard_a["locations_owned"] == 1


def test_deactivated_location_is_hidden_and_not_bookable(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    slot_id = location["slots"][0]["id"]

    patched = client.patch(f"/api/owner/locations/{location['id']}",
                          json={"is_active": False}, headers=headers(owner_token))
    assert patched.status_code == 200
    assert patched.get_json()["data"]["location"]["is_active"] is False

    assert client.get("/api/locations").get_json()["data"]["count"] == 0
    assert client.get(f"/api/locations/{location['id']}").status_code == 404

    blocked = book(client, user_token, slot_id, tomorrow_at(9), tomorrow_at(11))
    assert blocked.status_code == 409


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------
def test_successful_reservation_flow(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    slot_id = location["slots"][0]["id"]

    start, end = tomorrow_at(9), tomorrow_at(11)
    response = book(client, user_token, slot_id, start, end)
    assert response.status_code == 201, response.get_json()
    reservation = response.get_json()["data"]["reservation"]
    assert reservation["status"] == "active"
    assert reservation["booking_reference"].startswith("SP-")
    assert reservation["total_price"] == 80.0  # 2 hours x 40 INR
    assert reservation["location"]["name"] == "City Centre Parking"
    assert reservation["slot"]["slot_number"] == "01"

    mine = client.get("/api/reservations/my", headers=headers(user_token)).get_json()["data"]
    assert mine["count"] == 1
    assert mine["reservations"][0]["booking_reference"] == reservation["booking_reference"]

    owner_view = client.get("/api/owner/reservations", headers=headers(owner_token)).get_json()["data"]
    assert owner_view["count"] == 1
    assert owner_view["reservations"][0]["user"]["name"] == "Test Person"

    dashboard = client.get("/api/owner/dashboard", headers=headers(owner_token)).get_json()["data"]
    assert dashboard["bookings"]["total"] == 1
    assert dashboard["bookings"]["upcoming"] == 1
    assert dashboard["estimated_revenue"] == 80.0


def test_price_is_calculated_by_backend(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=1, hourly_rate=55.5)

    response = book(client, user_token, location["slots"][0]["id"],
                    tomorrow_at(9), tomorrow_at(10, 30))
    assert response.status_code == 201
    reservation = response.get_json()["data"]["reservation"]
    assert reservation["hourly_rate_at_booking"] == 55.5
    assert reservation["total_price"] == 83.25


def test_occupied_slot_cannot_be_booked(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    slot_id = location["slots"][0]["id"]

    assert client.patch(f"/api/owner/slots/{slot_id}", json={"status": "occupied"},
                        headers=headers(owner_token)).status_code == 200

    response = book(client, user_token, slot_id, tomorrow_at(9), tomorrow_at(11))
    assert response.status_code == 409


def test_out_of_service_slot_cannot_be_booked(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=1)
    slot_id = location["slots"][0]["id"]

    client.patch(f"/api/owner/slots/{slot_id}", json={"status": "out_of_service"},
                 headers=headers(owner_token))
    response = book(client, user_token, slot_id, tomorrow_at(9), tomorrow_at(10))
    assert response.status_code == 409


def test_overlapping_bookings_are_rejected(client):
    owner_token, _ = make_owner(client)
    first_user, _ = make_user(client, "first@example.com")
    second_user, _ = make_user(client, "second@example.com")
    location = create_location(client, owner_token, total_slots=1)
    slot_id = location["slots"][0]["id"]

    assert book(client, first_user, slot_id, tomorrow_at(9), tomorrow_at(12)).status_code == 201

    overlapping = book(client, second_user, slot_id, tomorrow_at(11), tomorrow_at(13))
    assert overlapping.status_code == 409

    inside = book(client, second_user, slot_id, tomorrow_at(10), tomorrow_at(11))
    assert inside.status_code == 409

    adjacent = book(client, second_user, slot_id, tomorrow_at(12), tomorrow_at(13))
    assert adjacent.status_code == 201


def test_invalid_booking_windows_are_rejected(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    slot_id = location["slots"][0]["id"]

    assert book(client, user_token, slot_id, tomorrow_at(12), tomorrow_at(11)).status_code == 400
    assert book(client, user_token, slot_id, tomorrow_at(12), tomorrow_at(12)).status_code == 400

    yesterday = now() - timedelta(days=1)
    assert book(client, user_token, slot_id, yesterday, yesterday + timedelta(hours=1)).status_code == 400

    # Outside opening hours (08:00 - 22:00)
    assert book(client, user_token, slot_id, tomorrow_at(23), tomorrow_at(23, 30)).status_code == 400
    assert book(client, user_token, slot_id, tomorrow_at(6), tomorrow_at(7)).status_code == 400

    missing_slot = client.post("/api/reservations", json={
        "start_time": iso(tomorrow_at(9)), "end_time": iso(tomorrow_at(10)),
    }, headers=headers(user_token))
    assert missing_slot.status_code == 400

    missing_time = client.post("/api/reservations", json={"slot_id": slot_id},
                               headers=headers(user_token))
    assert missing_time.status_code == 400


def test_users_only_see_their_own_reservations(client):
    owner_token, _ = make_owner(client)
    first_user, _ = make_user(client, "first@example.com")
    second_user, _ = make_user(client, "second@example.com")
    location = create_location(client, owner_token, total_slots=1)
    slot_id = location["slots"][0]["id"]

    created = book(client, first_user, slot_id, tomorrow_at(9), tomorrow_at(10))
    reservation_id = created.get_json()["data"]["reservation"]["id"]

    assert client.get("/api/reservations/my", headers=headers(second_user)).get_json()["data"]["count"] == 0
    assert client.get(f"/api/reservations/{reservation_id}",
                      headers=headers(second_user)).status_code == 404
    assert client.patch(f"/api/reservations/{reservation_id}/cancel",
                        headers=headers(second_user)).status_code == 404

    own = client.get(f"/api/reservations/{reservation_id}", headers=headers(first_user))
    assert own.status_code == 200


def test_cancellation_updates_availability(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=1)
    slot_id = location["slots"][0]["id"]

    created = book(client, user_token, slot_id, tomorrow_at(9), tomorrow_at(11))
    reservation_id = created.get_json()["data"]["reservation"]["id"]

    # The slot is free right now (the booking is tomorrow), so it still shows available.
    slots_now = client.get(f"/api/locations/{location['id']}/slots").get_json()["data"]["slots"]
    assert slots_now[0]["status"] == "available"

    # For the booked window it must not be bookable.
    window = client.get(
        f"/api/locations/{location['id']}/slots"
        f"?start_time={iso(tomorrow_at(9))}&end_time={iso(tomorrow_at(11))}"
    ).get_json()["data"]["slots"]
    assert window[0]["is_bookable_for_window"] is False

    cancelled = client.patch(f"/api/reservations/{reservation_id}/cancel",
                             headers=headers(user_token))
    assert cancelled.status_code == 200
    assert cancelled.get_json()["data"]["reservation"]["status"] == "cancelled"

    after = client.get(
        f"/api/locations/{location['id']}/slots"
        f"?start_time={iso(tomorrow_at(9))}&end_time={iso(tomorrow_at(11))}"
    ).get_json()["data"]["slots"]
    assert after[0]["is_bookable_for_window"] is True

    twice = client.patch(f"/api/reservations/{reservation_id}/cancel",
                         headers=headers(user_token))
    assert twice.status_code == 409

    # The slot can now be booked by somebody else for the same window.
    other_token, _ = make_user(client, "other@example.com")
    assert book(client, other_token, slot_id, tomorrow_at(9), tomorrow_at(11)).status_code == 201


def test_owner_can_cancel_reservation_in_own_location(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=1)

    created = book(client, user_token, location["slots"][0]["id"], tomorrow_at(9), tomorrow_at(10))
    reservation_id = created.get_json()["data"]["reservation"]["id"]

    response = client.patch(f"/api/owner/reservations/{reservation_id}/cancel",
                            headers=headers(owner_token))
    assert response.status_code == 200
    assert response.get_json()["data"]["reservation"]["status"] == "cancelled"

    mine = client.get("/api/reservations/my", headers=headers(user_token)).get_json()["data"]
    assert mine["reservations"][0]["status"] == "cancelled"


def test_owner_cannot_cancel_another_owners_reservation(client):
    owner_a, _ = make_owner(client, "a@example.com")
    owner_b, _ = make_owner(client, "b@example.com", business_name="Other Parking")
    user_token, _ = make_user(client)
    location = create_location(client, owner_a, total_slots=1)

    created = book(client, user_token, location["slots"][0]["id"], tomorrow_at(9), tomorrow_at(10))
    reservation_id = created.get_json()["data"]["reservation"]["id"]

    assert client.patch(f"/api/owner/reservations/{reservation_id}/cancel",
                        headers=headers(owner_b)).status_code == 404


def test_owner_reservation_filters(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)

    book(client, user_token, location["slots"][0]["id"], tomorrow_at(9), tomorrow_at(10))
    day = tomorrow_at(9).date().isoformat()

    by_date = client.get(f"/api/owner/reservations?date={day}",
                         headers=headers(owner_token)).get_json()["data"]
    assert by_date["count"] == 1

    empty_date = client.get("/api/owner/reservations?date=2000-01-01",
                            headers=headers(owner_token)).get_json()["data"]
    assert empty_date["count"] == 0

    by_status = client.get("/api/owner/reservations?status=cancelled",
                           headers=headers(owner_token)).get_json()["data"]
    assert by_status["count"] == 0

    bad_status = client.get("/api/owner/reservations?status=bogus",
                            headers=headers(owner_token))
    assert bad_status.status_code == 400


# ---------------------------------------------------------------------------
# Slot status protection and simulation
# ---------------------------------------------------------------------------
def _insert_active_reservation(app, slot_id, user_id):
    """Directly insert a reservation covering 'now' to simulate a live parking session."""
    with app.app_context():
        start = now() - timedelta(minutes=20)
        reservation = Reservation(
            booking_reference="SP-LIVE0001",
            user_id=user_id,
            slot_id=slot_id,
            start_time=start,
            end_time=now() + timedelta(minutes=40),
            hourly_rate_at_booking=40.0,
            total_price=40.0,
            status="active",
        )
        db.session.add(reservation)
        db.session.commit()


def test_manual_status_change_cannot_overwrite_active_reservation(app, client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    slot_id = location["slots"][0]["id"]

    me = client.get("/api/auth/me", headers=headers(user_token)).get_json()["data"]["user"]
    _insert_active_reservation(app, slot_id, me["id"])

    slots = client.get(f"/api/locations/{location['id']}/slots").get_json()["data"]["slots"]
    reserved = [slot for slot in slots if slot["id"] == slot_id][0]
    assert reserved["status"] == "reserved"

    patch = client.patch(f"/api/owner/slots/{slot_id}", json={"status": "available"},
                         headers=headers(owner_token))
    assert patch.status_code == 409

    simulate = client.post(f"/api/owner/slots/{slot_id}/simulate",
                           json={"status": "occupied"}, headers=headers(owner_token))
    assert simulate.status_code == 409

    out_of_service = client.patch(f"/api/owner/slots/{slot_id}",
                                  json={"status": "out_of_service"}, headers=headers(owner_token))
    assert out_of_service.status_code == 409


def test_simulation_toggles_slot_without_reservation(client):
    owner_token, _ = make_owner(client)
    location = create_location(client, owner_token, total_slots=2)
    slot_id = location["slots"][0]["id"]

    occupied = client.post(f"/api/owner/slots/{slot_id}/simulate",
                           json={"status": "occupied"}, headers=headers(owner_token))
    assert occupied.status_code == 200
    assert occupied.get_json()["data"]["slot"]["status"] == "occupied"

    detail = client.get(f"/api/locations/{location['id']}").get_json()["data"]["location"]
    assert detail["availability"]["occupied"] == 1
    assert detail["availability"]["available"] == 1

    freed = client.post(f"/api/owner/slots/{slot_id}/simulate",
                        json={"status": "available"}, headers=headers(owner_token))
    assert freed.status_code == 200
    assert freed.get_json()["data"]["slot"]["status"] == "available"

    invalid = client.post(f"/api/owner/slots/{slot_id}/simulate",
                          json={"status": "out_of_service"}, headers=headers(owner_token))
    assert invalid.status_code == 400


def test_reserved_slots_are_listed_for_owner(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    start = now() - timedelta(minutes=10)
    end = now() + timedelta(minutes=50)

    # Insert directly so the window covers "now" and shows as reserved.
    with client.application.app_context():
        user = client.get("/api/auth/me", headers=headers(user_token)).get_json()["data"]["user"]
        slot_id = location["slots"][1]["id"]
        db.session.add(Reservation(
            booking_reference="SP-LIVE0002", user_id=user["id"], slot_id=slot_id,
            start_time=start, end_time=end, hourly_rate_at_booking=40.0,
            total_price=40.0, status="active",
        ))
        db.session.commit()

    dashboard = client.get("/api/owner/dashboard", headers=headers(owner_token)).get_json()["data"]
    assert dashboard["slots"]["reserved"] == 1
    assert dashboard["slots"]["available"] == 1
    assert dashboard["slots"]["total"] == 2


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------
def test_statistics_handle_empty_and_real_data(client):
    owner_token, _ = make_owner(client)

    empty = client.get("/api/owner/statistics", headers=headers(owner_token))
    assert empty.status_code == 200
    body = empty.get_json()["data"]
    assert body["occupancy"] == []
    assert len(body["booking_activity"]) == 7
    assert body["estimated_revenue_total"] == 0.0

    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=2)
    book(client, user_token, location["slots"][0]["id"], tomorrow_at(9), tomorrow_at(11))

    filled = client.get("/api/owner/statistics", headers=headers(owner_token)).get_json()["data"]
    assert len(filled["occupancy"]) == 1
    assert filled["occupancy"][0]["total"] == 2
    assert filled["estimated_revenue_total"] == 80.0
    assert sum(day["bookings"] for day in filled["booking_activity"]) == 1


def test_reservation_activity_appears_in_owner_activity_log(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=1)
    book(client, user_token, location["slots"][0]["id"], tomorrow_at(9), tomorrow_at(10))

    dashboard = client.get("/api/owner/dashboard", headers=headers(owner_token)).get_json()["data"]
    actions = [entry["action"] for entry in dashboard["recent_activity"]]
    assert any("Parking location created" in action for action in actions)
    assert any("Reservation created" in action for action in actions)


# ---------------------------------------------------------------------------
# Deletion safety
# ---------------------------------------------------------------------------
def test_location_with_bookings_cannot_be_deleted(client):
    owner_token, _ = make_owner(client)
    user_token, _ = make_user(client)
    location = create_location(client, owner_token, total_slots=1)
    book(client, user_token, location["slots"][0]["id"], tomorrow_at(9), tomorrow_at(10))

    response = client.delete(f"/api/owner/locations/{location['id']}", headers=headers(owner_token))
    assert response.status_code == 409


def test_location_without_bookings_can_be_deleted(client):
    owner_token, _ = make_owner(client)
    location = create_location(client, owner_token, total_slots=2)

    response = client.delete(f"/api/owner/locations/{location['id']}", headers=headers(owner_token))
    assert response.status_code == 200
    assert client.get(f"/api/locations/{location['id']}").status_code == 404

    with client.application.app_context():
        assert ParkingSlot.query.filter_by(location_id=location["id"]).count() == 0
