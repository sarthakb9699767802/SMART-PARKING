import { Link } from "react-router-dom";
import { formatCurrency } from "../utils/format";
import StatusBadge from "./StatusBadge";

export default function LocationCard({ location }) {
  const availability = location.availability;

  return (
    <article className="card location-card">
      <div className="location-card__head">
        <div>
          <h3 className="card__title">{location.name}</h3>
          <p className="muted small">
            {location.address}, {location.area}, {location.city}
          </p>
        </div>
        <p className="price">
          {formatCurrency(location.hourly_rate)}
          <span className="price__unit">/hour</span>
        </p>
      </div>

      {location.description ? <p className="small">{location.description}</p> : null}

      <dl className="meta-grid">
        <div>
          <dt>Opening hours</dt>
          <dd>
            {location.opening_time} – {location.closing_time}{" "}
            <span className={`dot-note${location.is_open_now ? "" : " dot-note--closed"}`}>
              {location.is_open_now ? "Open now" : "Closed now"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Total slots</dt>
          <dd>{availability.total}</dd>
        </div>
      </dl>

      <div className="chip-row" aria-label="Slot availability">
        <StatusBadge status="available" label={`${availability.available} available`} />
        <StatusBadge status="occupied" label={`${availability.occupied} occupied`} />
        <StatusBadge status="reserved" label={`${availability.reserved} reserved`} />
        {availability.out_of_service > 0 ? (
          <StatusBadge
            status="out_of_service"
            label={`${availability.out_of_service} out of service`}
          />
        ) : null}
      </div>

      <Link className="btn btn--primary btn--block" to={`/user/locations/${location.id}`}>
        {availability.available > 0 ? "View slots & book" : "View parking details"}
      </Link>
    </article>
  );
}
