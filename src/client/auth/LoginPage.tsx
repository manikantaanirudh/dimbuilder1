import { useState, type FormEvent } from "react";
import { useAuth } from "./useAuth";

export function LoginPage() {
  const { login, authStatus } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      try {
        const parsed = JSON.parse(message) as { error?: string };
        setError(parsed.error ?? message);
      } catch {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Sign In</h1>
        <p className="login-subtitle">Dimension Builder</p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {authStatus?.strategy === "oidc" && authStatus.oidcAuthorizeUrl && (
          <div className="login-sso">
            <span className="login-divider">or</span>
            <a href={authStatus.oidcAuthorizeUrl} className="login-sso-button">
              Sign in with SSO
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
