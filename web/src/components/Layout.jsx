import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/api.js";

const TABS = [
  ["/", "Главная"],
  ["/tasks", "Задания"],
  ["/leaderboard", "Рейтинг"],
  ["/history", "История"],
  ["/profile", "Профиль"],
];

export default function Layout({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const isStaff = ["ADMIN", "MODERATOR"].includes(user?.role);
  const tabs = isStaff ? [...TABS, ["/admin", "Админка"]] : TABS;

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .notifications()
        .then((d) => alive && setUnread(d.unread))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="row" style={{ gap: 10 }}>
          <a
            href="/"
            title="В общее меню"
            style={{
              color: "var(--signal)", border: "1px solid rgba(212,175,55,0.5)",
              borderRadius: 6, padding: "4px 8px", fontSize: 12, lineHeight: 1,
            }}
          >
            ← Меню
          </a>
          <img src="/logo-header.png" alt="HandForge" style={{ width: 32, height: 32, borderRadius: 6 }} />
          <h1>Photo<span style={{ color: "var(--signal)" }}>Quest</span></h1>
        </div>
        <div className="row" style={{ gap: 14 }}>
          <button
            className="btn ghost sm"
            onClick={() => navigate("/notifications")}
            aria-label="Уведомления"
          >
            Сигналы
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <span className="points mono">{user?.points ?? 0}</span>
        </div>
      </header>

      <main>{children}</main>

      <nav className="nav">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {({ isActive }) => (
              <>
                <span className="dot" style={{ opacity: isActive ? 1 : 0.35 }} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
