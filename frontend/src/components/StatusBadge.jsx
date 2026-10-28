import { statusLabel } from "../utils/format";

/** Colour plus a text label, so status never depends on colour alone. */
export default function StatusBadge({ status, label }) {
  const key = status || "unknown";
  return (
    <span className={`badge badge--${key}`}>
      <span className="badge__dot" aria-hidden="true" />
      {label || statusLabel(status)}
    </span>
  );
}
