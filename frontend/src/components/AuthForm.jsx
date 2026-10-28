import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert } from "./Feedback";

/**
 * One form for both roles. The owning page passes role="user" or role="owner"
 * so the copy, fields and dashboard redirect differ without duplicating logic.
 */
export default function AuthForm({ role }) {
  const isOwner = role === "owner";
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    business_name: "",
    password: "",
    confirm_password: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);

  const dashboardPath = isOwner ? "/owner/dashboard" : "/user/dashboard";

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  function validate() {
    const errors = {};
    if (mode === "register" && !form.name.trim()) {
      errors.name = "Enter your name.";
    }
    if (!form.email.trim()) {
      errors.email = "Enter your email address.";
    } else if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(form.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (isOwner && mode === "register" && !form.business_name.trim()) {
      errors.business_name = "Enter your parking business name.";
    }
    if (!form.password) {
      errors.password = "Enter your password.";
    } else if (mode === "register" && form.password.length < 8) {
      errors.password = "Use at least 8 characters.";
    }
    if (mode === "register" && form.confirm_password !== form.password) {
      errors.confirm_password = "Both passwords must match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    setBusy(true);
    try {
      if (mode === "register") {
        await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          confirm_password: form.confirm_password,
          role,
          business_name: isOwner ? form.business_name.trim() : undefined,
        });
      } else {
        await login({ email: form.email.trim(), password: form.password, role });
      }
      const requested = location.state?.from;
      navigate(requested?.startsWith(isOwner ? "/owner" : "/user") ? requested : dashboardPath, {
        replace: true,
      });
    } catch (error) {
      setSubmitError(error.message);
      setFieldErrors(error.details || {});
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setSubmitError("");
    setFieldErrors({});
  }

  return (
    <div className={`auth-card auth-card--${role}`}>
      <div className="auth-card__head">
        <p className="eyebrow">{isOwner ? "Parking owner" : "Driver"}</p>
        <h1 className="auth-card__title">
          {mode === "login" ? `Sign in as ${isOwner ? "an owner" : "a user"}` : "Create your account"}
        </h1>
        <p className="muted small">
          {isOwner
            ? "Manage your parking locations, slots and reservations."
            : "Find parking near you and reserve a slot in seconds."}
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Login or register">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`tabs__tab${mode === "login" ? " tabs__tab--active" : ""}`}
          onClick={() => switchMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`tabs__tab${mode === "register" ? " tabs__tab--active" : ""}`}
          onClick={() => switchMode("register")}
        >
          Register
        </button>
      </div>

      <Alert>{submitError}</Alert>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {mode === "register" ? (
          <div className="field">
            <label htmlFor="name">{isOwner ? "Owner name" : "Full name"}</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={updateField}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
            />
            {fieldErrors.name ? (
              <p className="field__error" id="name-error">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>
        ) : null}

        {isOwner && mode === "register" ? (
          <div className="field">
            <label htmlFor="business_name">Business name</label>
            <input
              id="business_name"
              name="business_name"
              type="text"
              value={form.business_name}
              onChange={updateField}
              placeholder="e.g. Skyline Parking Services"
              aria-invalid={Boolean(fieldErrors.business_name)}
              aria-describedby={fieldErrors.business_name ? "business-error" : undefined}
            />
            {fieldErrors.business_name ? (
              <p className="field__error" id="business-error">
                {fieldErrors.business_name}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={updateField}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email ? (
            <p className="field__error" id="email-error">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={form.password}
            onChange={updateField}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
          {fieldErrors.password ? (
            <p className="field__error" id="password-error">
              {fieldErrors.password}
            </p>
          ) : mode === "register" ? (
            <p className="field__hint">At least 8 characters.</p>
          ) : null}
        </div>

        {mode === "register" ? (
          <div className="field">
            <label htmlFor="confirm_password">Confirm password</label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={updateField}
              aria-invalid={Boolean(fieldErrors.confirm_password)}
              aria-describedby={fieldErrors.confirm_password ? "confirm-error" : undefined}
            />
            {fieldErrors.confirm_password ? (
              <p className="field__error" id="confirm-error">
                {fieldErrors.confirm_password}
              </p>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? `Sign in as ${isOwner ? "owner" : "user"}`
              : "Create account"}
        </button>
      </form>

      <p className="auth-card__foot small muted">
        <Link to="/">← Back to welcome page</Link>
      </p>
      <p className="auth-card__foot small muted">
        {isOwner ? "Looking to park instead?" : "Own a parking lot?"}{" "}
        <Link to={isOwner ? "/user/login" : "/owner/login"}>
          {isOwner ? "Sign in as a user" : "Sign in as an owner"}
        </Link>
      </p>
    </div>
  );
}
