"""SQLAlchemy models for SmartPark.

Schema overview
---------------
users             one row per account (role: "user" or "owner")
auth_sessions     one row per active login token (only the hash is stored)
parking_locations one row per parking lot, owned by exactly one owner
parking_slots     one row per physical bay, unique number per location
reservations      one row per booking, checked for overlaps in booking_service
activity_log      audit trail of important actions

"Reserved" is not stored on a slot: it is derived from an active reservation
covering the current time, so the two tables can never disagree.
"""

from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db

# --- Roles -----------------------------------------------------------------
ROLE_USER = "user"
ROLE_OWNER = "owner"
VALID_ROLES = (ROLE_USER, ROLE_OWNER)

# --- Slot statuses ---------------------------------------------------------
SLOT_AVAILABLE = "available"
SLOT_OCCUPIED = "occupied"
SLOT_OUT_OF_SERVICE = "out_of_service"
SLOT_RESERVED = "reserved"  # derived, never stored
MANUAL_SLOT_STATUSES = (SLOT_AVAILABLE, SLOT_OCCUPIED, SLOT_OUT_OF_SERVICE)

# --- Reservation statuses --------------------------------------------------
RESERVATION_ACTIVE = "active"
RESERVATION_CANCELLED = "cancelled"
RESERVATION_COMPLETED = "completed"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, index=True)
    # Only used by owners; shown on the owner dashboard header.
    business_name = db.Column(db.String(160))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    locations = db.relationship(
        "ParkingLocation",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    reservations = db.relationship("Reservation", back_populates="user")

    __table_args__ = (db.CheckConstraint("role IN ('user', 'owner')", name="ck_users_role"),)

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    @property
    def display_name(self):
        return self.name


class AuthSession(db.Model):
    """A login token. The raw token is only ever returned to the client once."""

    __tablename__ = "auth_sessions"

    id = db.Column(db.Integer, primary_key=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    expires_at = db.Column(db.DateTime, nullable=False)

    user = db.relationship("User")


class ParkingLocation(db.Model):
    __tablename__ = "parking_locations"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = db.Column(db.String(150), nullable=False)
    address = db.Column(db.String(255), nullable=False)
    city = db.Column(db.String(100), nullable=False, index=True)
    area = db.Column(db.String(100), nullable=False, index=True)
    description = db.Column(db.Text)
    opening_time = db.Column(db.String(5), nullable=False, default="08:00")
    closing_time = db.Column(db.String(5), nullable=False, default="22:00")
    hourly_rate = db.Column(db.Float, nullable=False)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    owner = db.relationship("User", back_populates="locations")
    slots = db.relationship(
        "ParkingSlot", back_populates="location", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        db.CheckConstraint("hourly_rate >= 0", name="ck_locations_rate"),
        db.Index("ix_locations_owner_active", "owner_id", "is_active"),
    )


class ParkingSlot(db.Model):
    __tablename__ = "parking_slots"

    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(
        db.Integer,
        db.ForeignKey("parking_locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slot_number = db.Column(db.String(30), nullable=False)
    slot_type = db.Column(db.String(30), nullable=False, default="standard")
    # "reserved" is derived at read time and must never be stored here.
    status = db.Column(db.String(20), nullable=False, default=SLOT_AVAILABLE, index=True)
    last_updated = db.Column(db.DateTime, nullable=False, default=datetime.now)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    location = db.relationship("ParkingLocation", back_populates="slots")
    reservations = db.relationship("Reservation", back_populates="slot")

    __table_args__ = (
        db.UniqueConstraint("location_id", "slot_number", name="uq_slots_location_number"),
        db.CheckConstraint(
            "status IN ('available', 'occupied', 'out_of_service')", name="ck_slots_status"
        ),
    )


class Reservation(db.Model):
    __tablename__ = "reservations"

    id = db.Column(db.Integer, primary_key=True)
    booking_reference = db.Column(db.String(20), nullable=False, unique=True, index=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slot_id = db.Column(
        db.Integer, db.ForeignKey("parking_slots.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    hourly_rate_at_booking = db.Column(db.Float, nullable=False)
    total_price = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False, default=RESERVATION_ACTIVE, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    cancelled_at = db.Column(db.DateTime)

    user = db.relationship("User", back_populates="reservations")
    slot = db.relationship("ParkingSlot", back_populates="reservations")

    __table_args__ = (
        db.CheckConstraint("end_time > start_time", name="ck_reservations_time_range"),
        db.CheckConstraint(
            "status IN ('active', 'cancelled', 'completed')", name="ck_reservations_status"
        ),
        # Speeds up the overlap check used on every booking.
        db.Index("ix_reservations_slot_window", "slot_id", "status", "start_time", "end_time"),
    )


class ActivityLog(db.Model):
    __tablename__ = "activity_log"

    id = db.Column(db.Integer, primary_key=True)
    actor_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location_id = db.Column(
        db.Integer, db.ForeignKey("parking_locations.id", ondelete="CASCADE"), nullable=True
    )
    slot_id = db.Column(
        db.Integer, db.ForeignKey("parking_slots.id", ondelete="SET NULL"), nullable=True
    )
    action = db.Column(db.String(160), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)

    actor = db.relationship("User")
