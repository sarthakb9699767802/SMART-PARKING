/** Small formatting helpers shared by the pages. */

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const STATUS_LABELS = {
  available: "Available",
  occupied: "Occupied",
  reserved: "Reserved",
  out_of_service: "Out of Service",
  active: "Active",
  cancelled: "Cancelled",
  completed: "Completed",
  inactive: "Inactive",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Unknown";
}

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value) {
  if (!value) return "—";
  // Plain "HH:MM:SS" strings (opening hours) and ISO timestamps both work.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatClock(date) {
  if (!date) return "—";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** "YYYY-MM-DDTHH:MM" for <input type="datetime-local">. */
export function toDateTimeInputValue(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "YYYY-MM-DD" for <input type="date">. */
export function toDateInputValue(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isCancellable(reservation) {
  return reservation.status === "active" && new Date(reservation.end_time) > new Date();
}

export function toBooleanFlag(value) {
  return value === true || value === "true";
}
