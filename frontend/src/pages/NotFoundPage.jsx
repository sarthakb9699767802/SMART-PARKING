import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="page page--centered">
      <div className="feedback">
        <p className="feedback__title">Page not found</p>
        <p>That address does not exist in SmartPark.</p>
        <Link className="btn btn--primary" to="/">
          Go to the welcome page
        </Link>
      </div>
    </div>
  );
}
