import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { CATEGORIES } from "../lib/format.js";
import { Frame, Avatar, Loader } from "../components/ui.jsx";

export default function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.profile().then(setData).catch(() => {});
  }, []);

  if (!data) return <Loader />;

  const { progress, stats } = data;

  return (
    <div className="screen">
      <Frame className="card">
        <div className="row">
          <Avatar name={user.username} color={user.avatarColor} />
          <div style={{ flex: 1 }}>
            <h2 className="title-md" style={{ margin: 0 }}>{user.username}</h2>
            <p className="mono muted" style={{ margin: 0, fontSize: 12 }}>
              Уровень {progress.level} · место #{stats.rank}
            </p>
          </div>
          <span className="mono" style={{ color: "var(--signal)", fontSize: 20 }}>{user.points}</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="row between mono muted" style={{ fontSize: 11 }}>
            <span>XP {progress.current} / {progress.needed}</span>
            <span>до уровня {progress.level + 1}</span>
          </div>
          <div className="bar" style={{ marginTop: 6 }}>
            <i style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </Frame>

      <div className="grid-2">
        <div className="stat"><b>{stats.accuracy}%</b><span>Точность</span></div>
        <div className="stat"><b>{user.streak}</b><span>Серия сейчас</span></div>
        <div className="stat"><b>{user.bestStreak}</b><span>Лучшая серия</span></div>
        <div className="stat"><b>{stats.weekSubmissions}</b><span>За неделю</span></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <p className="eyebrow">По категориям</p>
        {Object.keys(stats.categories).length === 0 ? (
          <p className="muted">Пока пусто — выполните первое задание.</p>
        ) : (
          Object.entries(stats.categories).map(([key, v]) => (
            <div key={key} className="list-row">
              <span style={{ flex: 1 }}>{CATEGORIES[key] || key}</span>
              <span className="mono muted">{v.count}</span>
              <span className="mono" style={{ color: "var(--signal)" }}>{v.score}</span>
            </div>
          ))
        )}
      </div>

      <div className="stack">
        <Link className="btn ghost" to="/achievements">Достижения ({stats.achievements})</Link>
        <Link className="btn ghost" to="/settings">Настройки</Link>
        {user.role === "ADMIN" || user.role === "MODERATOR" ? (
          <Link className="btn ghost" to="/admin">Админ-панель</Link>
        ) : null}
      </div>
    </div>
  );
}
