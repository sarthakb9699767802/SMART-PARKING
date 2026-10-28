import { useState } from "react";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import StatusBadge from "../components/StatusBadge";
import { usePolling } from "../hooks/usePolling";
import { ownerApi } from "../services/api";
import { formatClock, formatCurrency, formatDateTime } from "../utils/format";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OwnerReservationsPage() {
  const [filters, setFilters] = useState({ locationId: "", date: "", status: "all" });
  const [confirmingId, setConfirmingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const { data, error, loading, lastUpdated, refresh } = usePolling(async () => {
    const [reservationsData, locationsData] = await Promise.all([
      ownerApi.listReservations({
        location_id: filters.locationId,
        date: filters.date,
        status: filters.status,
      }),
      ownerApi.listLocations(),
    ]);
    return {
      reservations: reservationsData.reservations,
      locations: locationsData.locations,
    };
  }, [filters.locationId, filters.date, filters.status]);

  const reservations = data?.reservations ?? [];
  const locations = data?.locations ?? [];

  async function handleCancel(reservationId) {
    setActionError("");
    setBusyId(reservationId);
    try {
      await ownerApi.cancelReservation(reservationId);
      setConfirmingId(null);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) {
    return <LoadingState message="Loading reservations…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Reservations</h1>
          <p className="muted">
            Bookings for your locations. You only see the customer name needed to manage a booking.
          </p>
        </div>
        <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
      </div>

      <Alert>{actionError}</Alert>

      <div className="panel filters">
        <div className="filters__row">
          <div className="field">
            <label htmlFor="filter-location">Location</label>
            <select
              id="filter-location"
              value={filters.locationId}
              onChange={(event) => setFilters({ ...filters, locationId: event.target.value })}
            >
              <option value="">All my locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-date">Date</label>
            <input
              id="filter-date"
              type="date"
              value={filters.date}
              onChange={(event) => setFilters({ ...filters, date: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filters__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setFilters({ locationId: "", date: "", status: "all" })}
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <p className="result-count small">
        <strong>{reservations.length}</strong> reservation{reservations.length === 1 ? "" : "s"}
      </p>

      {reservations.length === 0 ? (
        <EmptyState title="No reservations match these filters">
          Try clearing the date or status filter. New user bookings appear here automatically.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Reservations for your parking locations</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Customer</th>
                <th scope="col">Location</th>
                <th scope="col">Slot</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Status</th>
                <th scope="col">Price</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => {
                const cancellable =
                  reservation.status === "active" && new Date(reservation.end_time) > new Date();
                return (
                  <tr key={reservation.id}>
                    <td>{reservation.booking_reference}</td>
                    <td>{reservation.user?.name}</td>
                    <td>{reservation.location?.name}</td>
                    <td>{reservation.slot?.slot_number}</td>
                    <td>{formatDateTime(reservation.start_time)}</td>
                    <td>{formatDateTime(reservation.end_time)}</td>
                    <td>
                      <StatusBadge status={reservation.status} />
                    </td>
                    <td>{formatCurrency(reservation.total_price)}</td>
                    <td>
                      {cancellable ? (
                        confirmingId === reservation.id ? (
                          <div className="confirm-inline">
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => handleCancel(reservation.id)}
                              disabled={busyId === reservation.id}
                            >
                              {busyId === reservation.id ? "…" : "Confirm cancel"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setConfirmingId(null)}
                            >
                              Keep
                            </button>
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
                            Cancel
                          </button>
                        )
                      ) : (
                        <span className="small muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
