import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const COLORS = ["#F2C43D", "#3ED598", "#FF6B4A", "#7AA2F7", "#C792EA"];

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState({});
  const [username, setUsername] = useState(user.username);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.profile().then((d) => setSettings(d.settings || {})).catch(() => {});
  }, []);

  const save = async (patch) => {
    setError(null);
    try {
      const d = await api.updateProfile(patch);
      setUser(d.user);
      setSettings(d.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = (key) => save({ settings: { ...settings, [key]: !settings[key] } });

  return (
    <div className="screen">
      <p className="eyebrow">Настройки</p>
      {error && <div className="error">{error}</div>}
      {saved && <p className="mono fade-in" style={{ color: "var(--go)" }}>Сохранено</p>}

      <div className="card">
        <div className="field">
          <label htmlFor="username">Ник</label>
          <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => save({ username })}>
          Сохранить ник
        </button>

        <div style={{ marginTop: 18 }}>
          <label>Цвет аватара</label>
          <div className="row">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => save({ avatarColor: c })}
                aria-label={`Цвет ${c}`}
                style={{
                  width: 34, height: 34, borderRadius: 2, background: c,
                  border: user.avatarColor === c ? "2px solid #fff" : "1px solid var(--line)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Уведомления</p>
        {[
          ["notifyVerdict", "Результаты проверки"],
          ["notifyAchievements", "Новые достижения"],
          ["notifyRank", "Изменения в рейтинге"],
        ].map(([key, label]) => (
          <div key={key} className="list-row">
            <span style={{ flex: 1 }}>{label}</span>
            <button className="btn ghost sm" onClick={() => toggle(key)}>
              {settings[key] === false ? "Выкл" : "Вкл"}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <p className="eyebrow">Приватность</p>
        <p className="muted" style={{ fontSize: 13 }}>
          Фотографии видите только вы и модераторы. Оригиналы хранятся 90 дней, затем остаются
          только уменьшенные копии. Координаты не сохраняются в исходном виде.
        </p>
        <div className="list-row">
          <span style={{ flex: 1 }}>Показывать меня в публичном рейтинге</span>
          <button className="btn ghost sm" onClick={() => toggle("hideFromLeaderboard")}>
            {settings.hideFromLeaderboard ? "Нет" : "Да"}
          </button>
        </div>
      </div>

      <button className="btn ghost" onClick={() => { logout(); navigate("/login"); }}>
        Выйти из аккаунта
      </button>
      <button
        className="btn alarm"
        style={{ marginTop: 10 }}
        onClick={() => alert("Удаление аккаунта появится на этапе 2 — см. docs/09-roadmap.md")}
      >
        Удалить аккаунт
      </button>
    </div>
  );
}
