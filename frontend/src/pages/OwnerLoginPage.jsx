import AuthForm from "../components/AuthForm";

export default function OwnerLoginPage() {
  return (
    <div className="auth-page auth-page--owner">
      <div className="auth-page__inner">
        <div className="auth-page__aside">
          <p className="eyebrow">For parking owners</p>
          <h2>Run your car park from one screen.</h2>
          <ul className="plain-list">
            <li>Add locations and bays in a minute.</li>
            <li>Update bay status or run the demo simulation mode.</li>
            <li>Track occupancy, bookings and estimated revenue.</li>
          </ul>
        </div>
        <AuthForm role="owner" />
      </div>
    </div>
  );
}
