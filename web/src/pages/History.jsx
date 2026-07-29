import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { REASONS, date } from "../lib/format.js";
import { AuthImage, Loader, Empty } from "../components/ui.jsx";

export default function History() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.history(page).then(setData).catch(() => {});
  }, [page]);

  if (!data) return <Loader />;
  if (data.items.length === 0)
    return (
      <div className="screen">
        <Empty
          title="Здесь появятся ваши кадры"
          text="Каждая отправка сохраняется с вердиктом ИИ."
          action={<Link className="btn" style={{ maxWidth: 260, margin: "16px auto 0" }} to="/tasks">К заданиям</Link>}
        />
      </div>
    );

  return (
    <div className="screen">
      <p className="eyebrow">История · {data.total} отправок</p>

      <div className="contact-sheet" style={{ marginTop: 12 }}>
        {data.items.map((s, i) => (
          <Link key={s.id} to={`/result/${s.id}`} className="sheet-item stagger" style={{ "--i": i }}>
            <AuthImage url={s.thumbUrl} alt={s.task.title} />
            <span className={`tag ${s.status === "APPROVED" ? "go" : "alarm"}`}>
              {s.status === "APPROVED" ? `+${s.score}` : "✕"}
            </span>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {data.items.map((s, i) => (
          <Link key={s.id} to={`/result/${s.id}`} className="list-row stagger" style={{ color: "inherit", "--i": i }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{s.task.title}</div>
              <div className="mono muted" style={{ fontSize: 11 }}>
                {date(s.createdAt)}
                {s.status !== "APPROVED" && s.reasonCode ? ` · ${REASONS[s.reasonCode] || s.reasonCode}` : ""}
              </div>
            </div>
            <span className="mono" style={{ color: s.status === "APPROVED" ? "var(--go)" : "var(--alarm)" }}>
              {s.status === "APPROVED" ? `+${s.score}` : "0"}
            </span>
          </Link>
        ))}
      </div>

      {data.pages > 1 && (
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
          <span className="mono muted">{page} / {data.pages}</span>
          <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Вперёд</button>
        </div>
      )}
    </div>
  );
}
