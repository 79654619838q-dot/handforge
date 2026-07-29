import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Loader, Empty } from "../components/ui.jsx";

const PERIODS = [["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]];

export default function Leaderboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.leaderboard(period).then(setData).catch(() => {});
  }, [period]);

  return (
    <div className="screen">
      <p className="eyebrow">Рейтинг игроков</p>

      <div className="tabs" style={{ marginTop: 10 }}>
        {PERIODS.map(([key, label]) => (
          <button key={key} className={period === key ? "active" : ""} onClick={() => setPeriod(key)}>
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <Loader />
      ) : data.entries.length === 0 ? (
        <Empty title="Пока никого" text="Будьте первым в этом периоде." />
      ) : (
        <div className="card">
          {data.entries.map((e, i) => (
            <div key={e.id} className={`list-row stagger ${e.id === user.id ? "me" : ""}`} style={{ "--i": i }}>
              <span className={`rank ${e.rank <= 3 ? "top" : ""}`}>{e.rank}</span>
              <Avatar name={e.username} color={e.avatarColor} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{e.username}</div>
                <div className="mono muted" style={{ fontSize: 11 }}>ур. {e.level}</div>
              </div>
              <span className="mono" style={{ color: "var(--signal)" }}>{e.score}</span>
            </div>
          ))}
        </div>
      )}

      {data?.me && (
        <p className="mono muted" style={{ textAlign: "center" }}>
          Ваша позиция: {data.me.rank ? `#${data.me.rank}` : "вне топа"} · {data.me.score} очков
        </p>
      )}
    </div>
  );
}
