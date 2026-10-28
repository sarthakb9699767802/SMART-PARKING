import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, ErrorState, LoadingState } from "../components/Feedback";
import SlotTile from "../components/SlotTile";
import StatusBadge from "../components/StatusBadge";
import { usePolling } from "../hooks/usePolling";
import { parkingApi, reservationApi } from "../services/api";
import {
  formatClock,
  formatCurrency,
  formatDateTime,
  toDateTimeInputValue,
} from "../utils/format";

const LEGEND = [
  { status: "available", text: "Available" },
  { status: "occupied", text: "Occupied" },
  { status: "reserved", text: "Reserved" },
  { status: "out_of_service", text: "Out of service" },
];

/** A sensible starting window: the next half hour for two hours, inside opening hours. */
function defaultWindow(location) {
  const [openHour, openMinute] = location.opening_time.split(":").map(Number);
  const [closeHour, closeMinute] = location.closing_time.split(":").map(Number);

  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + (30 - (start.getMinutes() % 30)));

  const opening = new Date(start);
  opening.setHours(openHour, openMinute, 0, 0);
  if (start < opening) {
    start.setTime(opening.getTime());
  }

  const closing = new Date(start);
  closing.setHours(closeHour, closeMinute, 0, 0);
  const latestStart = new Date(closing.getTime() - 60 * 60 * 1000);
  if (start > latestStart) {
    start.setDate(start.getDate() + 1);
    start.setHours(openHour, openMinute, 0, 0);
  }

  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const endClosing = new Date(start);
  endClosing.setHours(closeHour, closeMinute, 0, 0);
  if (end > endClosing) {
    end.setTime(endClosing.getTime());
  }

  return { start: toDateTimeInputValue(start), end: toDateTimeInputValue(end) };
}

export default function LocationDetailPage() {
  const { locationId } = useParams();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [initialisedFor, setInitialisedFor] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const windowParams = useMemo(() => {
    if (!start || !end) return {};
    return new Date(end) > new Date(start)
      ? { start_time: start, end_time: end }
      : {};
  }, [start, end]);

  const { data, error, loading, lastUpdated, refresh } = usePolling(
    () => parkingApi.getLocation(locationId, windowParams),
    [locationId, windowParams.start_time, windowParams.end_time]
  );

  const location = data?.location;
  const slots = location?.slots ?? [];

  // Start fresh when navigating from one parking location to another.
  useEffect(() => {
    setInitialisedFor(null);
    setSelectedSlotId(null);
    setConfirmation(null);
    setSubmitError("");
  }, [locationId]);

  useEffect(() => {
    if (location && initialisedFor !== location.id) {
      const initial = defaultWindow(location);
      setStart(initial.start);
      setEnd(initial.end);
      setInitialisedFor(location.id);
    }
  }, [location, initialisedFor]);

  // Ask the backend for the price of the current window (debounced).
  useEffect(() => {
    if (!start || !end || new Date(end) <= new Date(start)) {
      setEstimate(null);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await parkingApi.estimatePrice(locationId, start, end);
        if (active) setEstimate(result);
      } catch (err) {
        if (active) setEstimate({ is_valid: false, message: err.message });
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locationId, start, end]);

  const windowActive = Boolean(windowParams.start_time);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) || null;
  const selectedIsBookable =
    Boolean(selectedSlot) &&
    selectedSlot.status === "available" &&
    (!windowActive || selectedSlot.is_bookable_for_window !== false);

  function slotAvailability(slot) {
    if (slot.status === "available" && windowActive && slot.is_bookable_for_window === false) {
      return { status: "reserved", label: "Booked" };
    }
    return { status: slot.status, label: undefined };
  }

  async function handleBook(event) {
    event.preventDefault();
    setSubmitError("");

    if (!selectedSlotId) {
      setSubmitError("Choose an available slot from the grid first.");
      return;
    }

    setBusy(true);
    try {
      const result = await reservationApi.create({
        slot_id: selectedSlotId,
        start_time: start,
        end_time: end,
      });
      setConfirmation(result.reservation);
      setSelectedSlotId(null);
      refresh();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <LoadingState message="Loading parking location…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  if (!location) {
    return <ErrorState message="This parking location could not be found." />;
  }

  return (
    <div className="stack">
      <p className="small">
        <Link className="link" to="/user/find">
          ← Back to search
        </Link>
      </p>

      <div className="page-head">
        <div>
          <p className="eyebrow">
            {location.area} · {location.city}
          </p>
          <h1>{location.name}</h1>
          <p className="muted">{location.address}</p>
          {location.description ? <p className="small">{location.description}</p> : null}
        </div>
        <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
      </div>

      <section className="panel summary-strip" aria-label="Location summary">
        <div>
          <p className="stat__label">Hourly rate</p>
          <p className="summary-strip__value">{formatCurrency(location.hourly_rate)}</p>
        </div>
        <div>
          <p className="stat__label">Open</p>
          <p className="summary-strip__value">
            {location.opening_time} – {location.closing_time}
          </p>
        </div>
        <div>
          <p className="stat__label">Free now</p>
          <p className="summary-strip__value">{location.availability.available}</p>
        </div>
        <div>
          <p className="stat__label">Reserved now</p>
          <p className="summary-strip__value">{location.availability.reserved}</p>
        </div>
        <div>
          <p className="stat__label">Total slots</p>
          <p className="summary-strip__value">{location.availability.total}</p>
        </div>
      </section>

      {confirmation ? (
        <section className="panel confirmation" aria-live="polite">
          <div className="confirmation__head">
            <h2>Reservation confirmed</h2>
            <StatusBadge status={confirmation.status} />
          </div>
          <p className="confirmation__ref">
            Booking reference <strong>{confirmation.booking_reference}</strong>
          </p>
          <dl className="meta-grid">
            <div>
              <dt>Parking</dt>
              <dd>{confirmation.location?.name}</dd>
            </div>
            <div>
              <dt>Slot</dt>
              <dd>{confirmation.slot?.slot_number}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{formatDateTime(confirmation.start_time)}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{formatDateTime(confirmation.end_time)}</dd>
            </div>
            <div>
              <dt>Estimated total</dt>
              <dd>{formatCurrency(confirmation.total_price)}</dd>
            </div>
          </dl>
          <p className="small muted">
            This is an unpaid demo booking. No payment has been taken.
          </p>
          <div className="button-row">
            <Link className="btn btn--primary" to="/user/bookings">
              Go to my bookings
            </Link>
            <Link
              className="btn btn--outline"
              to={`/user/bookings/${confirmation.id}/receipt`}
            >
              View / print receipt
            </Link>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirmation(null)}
            >
              Book another slot
            </button>
          </div>
        </section>
      ) : null}

      <div className="split split--wide">
        <section className="panel" aria-labelledby="slots-heading">
          <div className="panel__head">
            <h2 id="slots-heading">Choose a slot</h2>
            <span className="small muted">
              {slots.filter((slot) => slot.status === "available").length} available now
            </span>
          </div>

          <ul className="legend" aria-label="Slot status legend">
            {LEGEND.map((item) => (
              <li key={item.status}>
                <StatusBadge status={item.status} label={item.text} />
              </li>
            ))}
          </ul>

          {windowActive ? (
            <p className="small muted">
              Slots marked “Booked” are already reserved for your selected time window.
            </p>
          ) : null}

          {slots.length === 0 ? (
            <p className="muted">This location has no slots yet.</p>
          ) : (
            <div className="slot-grid">
              {slots.map((slot) => {
                const display = slotAvailability(slot);
                const disabled =
                  display.status !== "available" ||
                  (windowActive && slot.is_bookable_for_window === false);
                return (
                  <SlotTile
                    key={slot.id}
                    slot={slot}
                    stateLabel={display.label}
                    selected={slot.id === selectedSlotId}
                    onSelect={(chosen) => setSelectedSlotId(chosen.id)}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          )}
        </section>

        <aside className="panel panel--sticky" aria-labelledby="booking-heading">
          <h2 id="booking-heading">Reserve a slot</h2>
          <form className="form" onSubmit={handleBook}>
            <div className="field">
              <label htmlFor="start-time">Start</label>
              <input
                id="start-time"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="end-time">End</label>
              <input
                id="end-time"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </div>

            <div className="estimate" aria-live="polite">
              {estimate?.is_valid ? (
                <>
                  <p className="estimate__label">Estimated total (from the backend)</p>
                  <p className="estimate__value">
                    {formatCurrency(estimate.estimated_total)}
                  </p>
                  <p className="small muted">
                    {estimate.hours} h × {formatCurrency(estimate.hourly_rate)}/hour
                  </p>
                </>
              ) : (
                <p className="estimate__message small muted">
                  {estimate?.message ||
                    "Choose a start and end time to see the estimated price."}
                </p>
              )}
            </div>

            <div className="field">
              <span className="field__label">Selected slot</span>
              <p className="selected-slot">
                {selectedSlot
                  ? `Slot ${selectedSlot.slot_number} (${selectedSlot.slot_type})`
                  : "Tap a free slot in the grid"}
              </p>
            </div>

            <Alert>{submitError}</Alert>

            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={busy || !selectedIsBookable || !estimate?.is_valid}
            >
              {busy ? "Booking…" : "Confirm reservation"}
            </button>
            <p className="small muted">
              The server re-checks availability and calculates the final price when you confirm.
              Unpaid demo booking.
            </p>
          </form>
        </aside>
      </div>
    </div>
  );
}
