import AuthForm from "../components/AuthForm";

export default function UserLoginPage() {
  return (
    <div className="auth-page auth-page--user">
      <div className="auth-page__inner">
        <div className="auth-page__aside">
          <p className="eyebrow">For drivers</p>
          <h2>Park with confidence.</h2>
          <ul className="plain-list">
            <li>See live free-slot counts before you leave.</li>
            <li>Filter by area, price and availability.</li>
            <li>Cancel a booking yourself if plans change.</li>
          </ul>
        </div>
        <AuthForm role="user" />
      </div>
    </div>
  );
}
