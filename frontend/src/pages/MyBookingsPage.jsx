import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import StatusBadge from "../components/StatusBadge";
import { usePolling } from "../hooks/usePolling";
import { reservationApi } from "../services/api";
import { formatClock, formatCurrency, formatDateTime, isCancellable } from "../utils/format";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function MyBookingsPage() {
  const [filter, setFilter] = useState("all");
  const [confirmingId, setConfirmingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const { data, error, loading, lastUpdated, refresh } = usePolling(
    async () => (await reservationApi.listMine()).reservations,
    []
  );

  const reservations = data ?? [];
  const visible = filter === "all" ? reservations : reservations.filter((r) => r.status === filter);

  async function handleCancel(reservationId) {
    setBusyId(reservationId);
    setActionError("");
    try {
      await reservationApi.cancel(reservationId);
      setConfirmingId(null);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) {
    return <LoadingState message="Loading your bookings…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">My bookings</p>
          <h1>Your reservations</h1>
          <p className="muted">
            Bookings are unpaid demo reservations. Cancelling a booking frees the slot immediately.
          </p>
        </div>
        <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
      </div>

      <Alert>{actionError}</Alert>

      <div className="tabs tabs--left" role="tablist" aria-label="Filter bookings">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            className={`tabs__tab${filter === item.key ? " tabs__tab--active" : ""}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No bookings here"
          action={
            <Link className="btn btn--primary btn--sm" to="/user/find">
              Find parking
            </Link>
          }
        >
          {filter === "all"
            ? "You have not reserved a parking slot yet."
            : `You have no ${filter} bookings right now.`}
        </EmptyState>
      ) : (
        <ul className="booking-list">
          {visible.map((reservation) => (
            <li key={reservation.id} className="booking-card">
              <div className="booking-card__head">
                <div>
                  <p className="booking-card__ref">{reservation.booking_reference}</p>
                  <h2 className="booking-card__title">{reservation.location?.name}</h2>
                  <p className="small muted">
                    {reservation.location?.address}, {reservation.location?.city}
                  </p>
                </div>
                <div className="booking-card__side">
                  <StatusBadge status={reservation.status} />
                  <p className="booking-card__price">{formatCurrency(reservation.total_price)}</p>
                  <p className="small muted">Unpaid demo booking</p>
                </div>
              </div>

              <dl className="meta-grid">
                <div>
                  <dt>Slot</dt>
                  <dd>{reservation.slot?.slot_number}</dd>
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
                  <dt>Booked on</dt>
                  <dd>{formatDateTime(reservation.created_at)}</dd>
                </div>
                {reservation.cancelled_at ? (
                  <div>
                    <dt>Cancelled on</dt>
                    <dd>{formatDateTime(reservation.cancelled_at)}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="button-row">
                <Link
                  className="btn btn--outline btn--sm"
                  to={`/user/bookings/${reservation.id}/receipt`}
                >
                  View / print receipt
                </Link>
              </div>

              {isCancellable(reservation) ? (
                confirmingId === reservation.id ? (
                  <div className="confirm-bar">
                    <p className="small">Cancel this reservation? The slot becomes free again.</p>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => handleCancel(reservation.id)}
                        disabled={busyId === reservation.id}
                      >
                        {busyId === reservation.id ? "Cancelling…" : "Yes, cancel booking"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setConfirmingId(null)}
                      >
                        Keep booking
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => {
                      setConfirmingId(reservation.id);
                      setActionError("");
                    }}
                  >
                    Cancel booking
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
