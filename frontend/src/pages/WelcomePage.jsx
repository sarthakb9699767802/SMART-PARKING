import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Live availability",
    text: "Slot counts refresh from the database every five seconds, so you see the current state of a car park, not a cached guess.",
  },
  {
    title: "Reserve in seconds",
    text: "Pick a slot, choose your time window and get a booking reference with a price calculated by the server.",
  },
  {
    title: "Owner console",
    text: "Owners manage locations, bays and reservations, and see occupancy and booking activity for their own car parks only.",
  },
];

export default function WelcomePage() {
  return (
    <div className="welcome">
      <header className="welcome__head">
        <Link to="/" className="brand" aria-label="SmartPark home">
          <span className="brand__mark" aria-hidden="true">
            P
          </span>
          <span className="brand__text">SmartPark</span>
        </Link>
        <div className="welcome__head-actions">
          <Link className="btn btn--ghost btn--sm" to="/user/login">
            User sign in
          </Link>
          <Link className="btn btn--secondary btn--sm" to="/owner/login">
            Owner sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Smart parking · real-time availability</p>
            <h1 className="hero__title">
              Know which bay is free <span className="hero__accent">before you drive.</span>
            </h1>
            <p className="hero__text">
              SmartPark is a local demo of a smart parking system. Drivers search car parks, see
              which slots are free right now, and reserve a bay for a chosen time. Owners manage
              their locations, bays and bookings from a separate console.
            </p>
            <div className="hero__actions">
              <Link className="btn btn--primary btn--lg" to="/user/login">
                Find parking
              </Link>
              <Link className="btn btn--outline btn--lg" to="/owner/login">
                List my parking
              </Link>
            </div>
            <p className="hero__note small muted">
              Runs entirely on your computer · SQLite database · no payments, no paid APIs
            </p>
          </div>

          <div className="hero__panel" aria-hidden="true">
            <div className="hero__panel-head">
              <span>City Centre Parking</span>
              <span className="pill pill--live">Live</span>
            </div>
            <div className="slot-mini-grid">
              <span className="slot-mini slot-mini--free">01</span>
              <span className="slot-mini slot-mini--occupied">02</span>
              <span className="slot-mini slot-mini--free">03</span>
              <span className="slot-mini slot-mini--reserved">04</span>
              <span className="slot-mini slot-mini--free">05</span>
              <span className="slot-mini slot-mini--free">06</span>
              <span className="slot-mini slot-mini--occupied">07</span>
              <span className="slot-mini slot-mini--free">08</span>
            </div>
            <dl className="hero__panel-stats">
              <div>
                <dt>Available</dt>
                <dd>18</dd>
              </div>
              <div>
                <dt>Reserved</dt>
                <dd>6</dd>
              </div>
              <div>
                <dt>Occupied</dt>
                <dd>6</dd>
              </div>
            </dl>
            <p className="hero__panel-note">Illustration of the dashboard view</p>
          </div>
        </section>

        <section className="role-section" aria-labelledby="role-heading">
          <h2 id="role-heading" className="section-title">
            Choose how you want to continue
          </h2>
          <div className="role-grid">
            <article className="role-card role-card--user">
              <span className="role-card__icon" aria-hidden="true">
                🚗
              </span>
              <h3>I&apos;m a User</h3>
              <p>
                Search parking by city, area or name, compare prices and reserve a slot for the
                exact time you need it.
              </p>
              <Link className="btn btn--primary btn--block" to="/user/login">
                Continue as user
              </Link>
            </article>

            <article className="role-card role-card--owner">
              <span className="role-card__icon" aria-hidden="true">
                🅿️
              </span>
              <h3>I&apos;m a Parking Owner</h3>
              <p>
                Add your parking locations, keep bay status up to date and track reservations and
                estimated revenue.
              </p>
              <Link className="btn btn--dark btn--block" to="/owner/login">
                Continue as owner
              </Link>
            </article>
          </div>
        </section>

        <section className="feature-section" aria-label="How SmartPark works">
          <h2 className="section-title">Built for a clear demonstration</h2>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature" key={feature.title}>
                <h3>{feature.title}</h3>
                <p className="muted small">{feature.text}</p>
              </article>
            ))}
          </div>
          <p className="welcome__disclaimer small muted">
            This is a college project prototype. Demonstration parking data is added only if you run
            the optional seed command described in the README. Bookings are unpaid demo bookings:
            no payment gateway and no physical sensors are connected. Availability is updated by
            polling and an owner-only simulation control.
          </p>
        </section>
      </main>

      <footer className="welcome__foot small muted">
        SmartPark · Smart Parking System with Real-Time Availability · Local demo
      </footer>
    </div>
  );
}
