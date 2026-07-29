import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { CATEGORIES } from "../lib/format.js";
import { Frame, Avatar, Loader } from "../components/ui.jsx";

function AvatarPicker({ user, onChange }) {
  const { setUser } = useAuth();
  const fileRef = useRef(null);
  const [presets, setPresets] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && presets.length === 0) {
      api.avatarPresets().then((d) => setPresets(d.presets)).catch(() => {});
    }
  }, [open, presets.length]);

  const apply = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await fn();
      setUser(updated);
      onChange?.(updated);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const formData = new FormData();
    formData.append("avatar", file);
    apply(() => api.uploadAvatar(formData));
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
        Сменить аватарку
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {error && <div className="error">{error}</div>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onFile}
          />
          <button type="button" className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            Загрузить своё фото
          </button>
          {presets.length > 0 && (
            <div
              style={{
                display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 10,
              }}
            >
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => apply(() => api.setAvatarPreset(p.url))}
                  style={{
                    padding: 0, border: "none", borderRadius: "50%", overflow: "hidden",
                    width: 40, height: 40, background: "#000",
                  }}
                >
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
          <Avatar name={user.username} color={user.avatarColor} url={user.avatarUrl} />
          <div style={{ flex: 1 }}>
            <h2 className="title-md" style={{ margin: 0 }}>{user.username}</h2>
            <p className="mono muted" style={{ margin: 0, fontSize: 12 }}>
              Уровень {progress.level} · место #{stats.rank}
            </p>
          </div>
          <span className="mono" style={{ color: "var(--signal)", fontSize: 20 }}>{user.points}</span>
        </div>
        <AvatarPicker user={user} />

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
