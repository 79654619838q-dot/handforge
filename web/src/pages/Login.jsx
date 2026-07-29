import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { Frame } from "../components/ui.jsx";
import { safeNext } from "../lib/redirect.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.username, form.password);
      const next = safeNext(location.search);
      if (next) {
        window.location.href = next; // ведёт вне /quest (например в /poker)
        return;
      }
      navigate(location.state?.from ?? "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <a
        href="/"
        style={{
          position: "fixed", top: 10, left: 10, color: "var(--signal)",
          border: "1px solid rgba(212,175,55,0.5)", borderRadius: 6,
          padding: "5px 10px", fontSize: 12,
        }}
      >
        ← Меню
      </a>
      <div className="auth-card">
        <img src="/logo-header.png" alt="HandForge" style={{ width: 64, height: 64, borderRadius: 10, marginBottom: 8 }} />
        <p className="brand">Photo<span>Quest</span></p>
        <p className="muted" style={{ marginTop: 0 }}>
          Найди объект в городе. Сними. Получи очки.
        </p>

        <Frame className="card" style={{ marginTop: 24 }}>
          <form onSubmit={submit}>
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label htmlFor="username">Логин</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button className="btn" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? "Входим" : "Войти"}
            </button>
          </form>
        </Frame>

        <p className="muted" style={{ textAlign: "center" }}>
          Нет аккаунта? <Link to={`/register${location.search}`}>Создать</Link>
        </p>
      </div>
    </div>
  );
}
