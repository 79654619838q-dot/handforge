import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Loader } from "../components/ui.jsx";
import { date } from "../lib/format.js";

export default function Achievements() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.achievements().then(setData).catch(() => {});
  }, []);

  if (!data) return <Loader />;

  return (
    <div className="screen">
      <p className="eyebrow">Достижения · {data.unlockedCount} из {data.total}</p>

      <div className="card" style={{ marginTop: 12 }}>
        {data.achievements.map((a, i) => (
          <div key={a.code} className={`ach stagger ${a.unlockedAt ? "on" : ""}`} style={{ "--i": i }}>
            <span className="medal">{a.unlockedAt ? "✓" : "•"}</span>
            <div style={{ flex: 1 }}>
              <p className="title-md" style={{ margin: 0 }}>{a.title}</p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>{a.description}</p>
              {a.progress && !a.unlockedAt && (
                <div style={{ marginTop: 8 }}>
                  <div className="bar">
                    <i style={{ width: `${Math.min(100, (a.progress.current / a.progress.target) * 100)}%` }} />
                  </div>
                  <span className="mono muted" style={{ fontSize: 11 }}>
                    {a.progress.current} / {a.progress.target}
                  </span>
                </div>
              )}
              {a.unlockedAt && (
                <span className="mono muted" style={{ fontSize: 11 }}>получено {date(a.unlockedAt)}</span>
              )}
            </div>
            {a.points > 0 && <span className="mono" style={{ color: "var(--signal)" }}>+{a.points}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
