import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { Frame } from "../components/ui.jsx";
import { safeNext } from "../lib/redirect.js";

export default function Register() {
  const { register } = useAuth();
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
      await register(form);
      const next = safeNext(location.search);
      if (next) {
        window.location.href = next;
        return;
      }
      navigate("/");
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
        <p className="muted" style={{ marginTop: 0 }}>Первое задание выдадим сразу после регистрации.</p>

        <Frame className="card" style={{ marginTop: 24 }}>
          <form onSubmit={submit}>
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label htmlFor="username">Логин</label>
              <input id="username" minLength={3} maxLength={20} value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="password">Пароль (от 8 символов)</label>
              <input id="password" type="password" minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <button className="btn" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? "Создаём" : "Создать аккаунт"}
            </button>
          </form>
        </Frame>

        <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
          Играя, вы соглашаетесь снимать только в безопасных публичных местах и соблюдать ПДД.
        </p>
        <p className="muted" style={{ textAlign: "center" }}>
          Уже есть аккаунт? <Link to={`/login${location.search}`}>Войти</Link>
        </p>
      </div>
    </div>
  );
}
