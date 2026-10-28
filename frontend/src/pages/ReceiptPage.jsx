import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ErrorState, LoadingState } from "../components/Feedback";
import StatusBadge from "../components/StatusBadge";
import { reservationApi } from "../services/api";
import { formatCurrency, formatDateTime } from "../utils/format";

function formatDuration(start, end) {
  const hours = (new Date(end) - new Date(start)) / 3600000;
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

export default function ReceiptPage() {
  const { reservationId } = useParams();
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await reservationApi.get(reservationId);
        if (active) setReservation(data.reservation);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [reservationId]);

  if (loading) {
    return (
      <div className="receipt-page">
        <LoadingState message="Loading your receipt…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="receipt-page">
        <ErrorState message={error} />
        <p className="small">
          <Link className="link" to="/user/bookings">
            ← Back to my bookings
          </Link>
        </p>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="receipt-page">
        <ErrorState message="This reservation could not be found." />
      </div>
    );
  }

  const location = reservation.location;

  // Check if check-in is allowed
  const canCheckIn =
    reservation.status !== "cancelled" && reservation.status !== "completed";

  return (
    <div className="receipt-page">
      <div className="receipt-actions">
        <Link className="btn btn--ghost btn--sm" to="/user/bookings">
          ← Back to my bookings
        </Link>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        {canCheckIn ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => handleCheckIn(reservationId)}
          >
            Check in via QR
          </button>
        ) : null}
      </div>

      <article className="receipt" aria-labelledby="receipt-heading">
        <header className="receipt__head">
          <div className="receipt__identity">
            <p className="eyebrow">SmartPark · booking receipt</p>
            <h1 id="receipt-heading">{location?.name}</h1>
            <p className="small muted">
              {location?.address}, {location?.area}, {location?.city}
            </p>
            <p className="small muted">
              Opening hours {location?.opening_time} – {location?.closing_time}
            </p>
          </div>

          <div className="receipt__qr">
            <QRCodeSVG
              value={reservation.booking_reference}
              size={132}
              level="M"
              marginSize={2}
              title={`QR code for booking ${reservation.booking_reference}`}
              className="receipt__qr-svg"
            />
            <p className="receipt__qr-caption">{reservation.booking_reference}</p>
          </div>
        </header>

        <div className="receipt__status">
          <StatusBadge status={reservation.status} />
          <span className="small muted">Booked on {formatDateTime(reservation.created_at)}</span>
        </div>

        <dl className="receipt__grid">
          <div>
            <dt>Booking reference</dt>
            <dd>{reservation.booking_reference}</dd>
          </div>
          <div>
            <dt>Slot</dt>
            <dd>
              {reservation.slot?.slot_number} ({reservation.slot?.slot_type})
            </dd>
          </div>
          <div>
            <dt>Start</dt>
            <dd>{formatDateTime(reservation.start_time)}</dd>
          </div>
          <div>
            <dt>End</dt>
            <dd>{formatDateTime(reservation.end_time)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(reservation.start_time, reservation.end_time)}</dd>
          </div>
          <div>
            <dt>Hourly rate at booking</dt>
            <dd>{formatCurrency(reservation.hourly_rate_at_booking)}</dd>
          </div>
          {reservation.cancelled_at ? (
            <div>
              <dt>Cancelled on</dt>
              <dd>{formatDateTime(reservation.cancelled_at)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="receipt__total">
          <div>
            <p className="receipt__total-label">Total (estimated)</p>
            <p className="small muted">Unpaid demo booking — no payment has been taken.</p>
          </div>
          <p className="receipt__total-value">{formatCurrency(reservation.total_price)}</p>
        </div>

        <footer className="receipt__foot small muted">
          <p>
            Show this reference ({reservation.booking_reference}) or the QR code at the parking
            entrance. Scan the code to read the booking reference.
          </p>
          <p>
            SmartPark college project · demonstration receipt, not a tax invoice. Availability is
            refreshed from the local database every 5 seconds.
          </p>
        </footer>
      </article>
    </div>
  );
}

function handleCheckIn(reservationId) {
  if (!window.confirm("Check in for this reservation? This will mark the slot as occupied and complete the reservation.")) {
    return;
  }

  fetch(`/api/reservations/${reservationId}/check-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((err) => Promise.reject(err));
      }
      return response.json();
    })
    .then((data) => {
      window.alert("Check-in successful! Slot marked as occupied.");
      // Reload the page to show updated status
      window.location.reload();
    })
    .catch((err) => {
      console.error("Check-in failed:", err);
      window.alert(`Check-in failed: ${err.message || err}`);
    });
}