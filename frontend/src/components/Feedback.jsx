export function LoadingState({ message = "Loading…" }) {
  return (
    <div className="feedback" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="feedback feedback--error" role="alert">
      <p className="feedback__title">Something went wrong</p>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="feedback feedback--empty">
      <p className="feedback__title">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Alert({ tone = "error", children }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
