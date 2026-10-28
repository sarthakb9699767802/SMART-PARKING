import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { usePolling } from "../hooks/usePolling";
import { parkingApi, reservationApi } from "../services/api";
import { formatClock, formatCurrency, formatDateTime } from "../utils/format";

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, error, loading, lastUpdated, refresh } = usePolling(async () => {
    const [locationsData, bookingsData] = await Promise.all([
      parkingApi.listLocations(),
      reservationApi.listMine(),
    ]);
    return { locations: locationsData.locations, bookings: bookingsData.reservations };
  }, []);

  const locations = data?.locations ?? [];
  const bookings = data?.bookings ?? [];
  const availableSlots = locations.reduce(
    (total, location) => total + location.availability.available,
    0
  );
  const activeBookings = bookings.filter((booking) => booking.status === "active");
  const nextBooking = [...activeBookings].sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time)
  )[0];
  const recentBookings = bookings.slice(0, 3);

  function handleSearch(event) {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/user/find?search=${encodeURIComponent(query)}` : "/user/find");
  }

  if (loading && !data) {
    return <LoadingState message="Loading your dashboard…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">User dashboard</p>
          <h1>Welcome back, {user?.name?.split(" ")[0]}</h1>
          <p className="muted">
            Find a free bay, reserve it for your time window and manage your bookings here.
          </p>
        </div>
        <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
      </div>

      <form className="search-bar" onSubmit={handleSearch} role="search">
        <label className="sr-only" htmlFor="dashboard-search">
          Search parking by city, area, address or name
        </label>
        <input
          id="dashboard-search"
          type="search"
          placeholder="Search by city, area, address or parking name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" className="btn btn--primary">
          Search parking
        </button>
      </form>

      <section className="stat-grid" aria-label="Parking summary">
        <StatCard
          label="Parking locations"
          value={locations.length}
          hint="Open to users right now"
        />
        <StatCard
          label="Free slots"
          value={availableSlots}
          hint="Across all locations"
          tone="success"
        />
        <StatCard
          label="Active bookings"
          value={activeBookings.length}
          hint="Reservations you have not cancelled"
        />
        <StatCard
          label="Next booking"
          value={nextBooking ? formatDateTime(nextBooking.start_time) : "None"}
          hint={nextBooking ? nextBooking.location?.name : "Book a slot to get started"}
        />
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="recent-heading">
          <div className="panel__head">
            <h2 id="recent-heading">Recent bookings</h2>
            <Link className="link" to="/user/bookings">
              View all
            </Link>
          </div>

          {recentBookings.length === 0 ? (
            <EmptyState
              title="No bookings yet"
              action={
                <Link className="btn btn--secondary btn--sm" to="/user/find">
                  Find parking
                </Link>
              }
            >
              Search for parking and reserve your first slot.
            </EmptyState>
          ) : (
            <ul className="booking-list">
              {recentBookings.map((booking) => (
                <li key={booking.id} className="booking-row">
                  <div>
                    <p className="booking-row__title">
                      {booking.location?.name} · Slot {booking.slot?.slot_number}
                    </p>
                    <p className="small muted">
                      {formatDateTime(booking.start_time)} → {formatDateTime(booking.end_time)}
                    </p>
                    <p className="small muted">Ref {booking.booking_reference}</p>
                  </div>
                  <div className="booking-row__right">
                    <StatusBadge status={booking.status} />
                    <p className="small">{formatCurrency(booking.total_price)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel panel--tinted" aria-labelledby="quick-heading">
          <h2 id="quick-heading">Quick actions</h2>
          <div className="quick-links">
            <Link className="quick-link" to="/user/find">
              <span className="quick-link__title">Find parking</span>
              <span className="small muted">Search and filter every location</span>
            </Link>
            <Link className="quick-link" to="/user/bookings">
              <span className="quick-link__title">My bookings</span>
              <span className="small muted">Cancel or review a reservation</span>
            </Link>
          </div>
          <p className="small muted">
            Booking totals are unpaid demo amounts calculated locally. No payment is processed.
          </p>
        </aside>
      </div>
    </div>
  );
}
