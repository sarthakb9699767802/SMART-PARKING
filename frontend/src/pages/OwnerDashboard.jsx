import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { usePolling } from "../hooks/usePolling";
import { ownerApi } from "../services/api";
import { formatClock, formatCurrency, formatDateTime } from "../utils/format";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
);

const OCCUPANCY_COLORS = ["#15803d", "#b42318", "#1d4ed8", "#94a3b8"];

function dayLabel(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export default function OwnerDashboard() {
  const { user } = useAuth();

  const { data, error, loading, lastUpdated, refresh } = usePolling(async () => {
    const [dashboard, statistics] = await Promise.all([
      ownerApi.dashboard(),
      ownerApi.statistics(),
    ]);
    return { dashboard, statistics };
  }, []);

  if (loading && !data) {
    return <LoadingState message="Loading your parking overview…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  const dashboard = data.dashboard;
  const statistics = data.statistics;
  const slots = dashboard.slots;
  const activity = statistics.booking_activity;
  const hasSlots = slots.total > 0;
  const hasBookings = activity.some((day) => day.bookings > 0);
  const hasReservations = dashboard.bookings.total > 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner console · {user?.business_name || user?.name}</p>
          <h1>Parking overview</h1>
          <p className="muted">
            Everything below is read from your own parking locations in the local database.
          </p>
        </div>
        <div className="page-head__actions">
          <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={refresh}>
            Refresh now
          </button>
        </div>
      </div>

      <section className="stat-grid stat-grid--owner" aria-label="Owner statistics">
        <StatCard
          label="Locations owned"
          value={dashboard.locations_owned}
          hint={`${dashboard.active_locations} active`}
        />
        <StatCard label="Total slots" value={slots.total} />
        <StatCard label="Available" value={slots.available} tone="success" />
        <StatCard label="Occupied" value={slots.occupied} tone="warning" />
        <StatCard label="Reserved now" value={slots.reserved} />
        <StatCard label="Upcoming reservations" value={dashboard.bookings.upcoming} />
        <StatCard
          label="Total bookings"
          value={dashboard.bookings.total}
          hint={`${dashboard.bookings.cancelled} cancelled`}
        />
        <StatCard
          label="Estimated revenue"
          value={formatCurrency(dashboard.estimated_revenue)}
          hint="From bookings, not collected"
          tone="dark"
        />
      </section>

      <p className="note">
        Estimated revenue is calculated from booking records only. No payment gateway is connected,
        so no money has actually been collected.
      </p>

      <div className="chart-grid">
        <section className="panel chart-card">
          <h2>Occupancy summary</h2>
          {hasSlots ? (
            <>
              <div className="chart-box">
                <Doughnut
                  data={{
                    labels: ["Available", "Occupied", "Reserved", "Out of service"],
                    datasets: [
                      {
                        data: [slots.available, slots.occupied, slots.reserved, slots.out_of_service],
                        backgroundColor: OCCUPANCY_COLORS,
                        borderWidth: 0,
                      },
                    ],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom" } },
                  }}
                />
              </div>
              <p className="small muted">
                {slots.available} of {slots.total} slots are free right now.
              </p>
            </>
          ) : (
            <EmptyState
              title="No slots yet"
              action={
                <Link className="btn btn--secondary btn--sm" to="/owner/locations">
                  Add a parking location
                </Link>
              }
            >
              Add a location with slots to see occupancy.
            </EmptyState>
          )}
        </section>

        <section className="panel chart-card">
          <h2>Booking activity</h2>
          <p className="small muted">Bookings created per day over the last 7 days.</p>
          {hasBookings ? (
            <div className="chart-box">
              <Bar
                data={{
                  labels: activity.map((day) => dayLabel(day.date)),
                  datasets: [
                    {
                      label: "Bookings",
                      data: activity.map((day) => day.bookings),
                      backgroundColor: "#0f766e",
                      borderRadius: 6,
                    },
                  ],
                }}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                }}
              />
            </div>
          ) : (
            <EmptyState title="No bookings in the last 7 days">
              New reservations will appear here as soon as users book your slots.
            </EmptyState>
          )}
        </section>

        <section className="panel chart-card">
          <h2>Estimated booking revenue</h2>
          <p className="small muted">Value of bookings created per day (not money collected).</p>
          {hasBookings ? (
            <div className="chart-box">
              <Line
                data={{
                  labels: activity.map((day) => dayLabel(day.date)),
                  datasets: [
                    {
                      label: "Estimated revenue (₹)",
                      data: activity.map((day) => day.estimated_revenue),
                      borderColor: "#b45309",
                      backgroundColor: "rgba(180, 83, 9, 0.15)",
                      fill: true,
                      tension: 0.3,
                    },
                  ],
                }}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true } },
                }}
              />
            </div>
          ) : (
            <EmptyState title="No revenue data yet">
              Revenue estimates appear once bookings exist.
            </EmptyState>
          )}
        </section>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel__head">
            <h2>Upcoming reservations</h2>
            <Link className="link" to="/owner/reservations">
              View all
            </Link>
          </div>
          {dashboard.upcoming_reservations.length === 0 ? (
            <EmptyState title="No upcoming reservations">
              {hasReservations
                ? "All bookings have already started or finished."
                : "Users will show up here when they book one of your slots."}
            </EmptyState>
          ) : (
            <ul className="booking-list">
              {dashboard.upcoming_reservations.map((reservation) => (
                <li key={reservation.id} className="booking-row">
                  <div>
                    <p className="booking-row__title">
                      {reservation.location?.name} · Slot {reservation.slot?.slot_number}
                    </p>
                    <p className="small muted">
                      {reservation.user?.name} · {formatDateTime(reservation.start_time)} →{" "}
                      {formatDateTime(reservation.end_time)}
                    </p>
                    <p className="small muted">Ref {reservation.booking_reference}</p>
                  </div>
                  <div className="booking-row__right">
                    <StatusBadge status={reservation.status} />
                    <p className="small">{formatCurrency(reservation.total_price)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel">
          <div className="panel__head">
            <h2>Recent activity</h2>
          </div>
          {dashboard.recent_activity.length === 0 ? (
            <EmptyState title="No activity yet">
              Location, slot and booking changes for your car parks appear here.
            </EmptyState>
          ) : (
            <ul className="activity-list">
              {dashboard.recent_activity.map((entry) => (
                <li key={entry.id}>
                  <p className="small">{entry.action}</p>
                  <p className="small muted">
                    {entry.actor_name} · {formatDateTime(entry.timestamp)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
