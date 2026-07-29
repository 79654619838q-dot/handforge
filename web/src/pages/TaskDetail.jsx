import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { CATEGORIES, clock } from "../lib/format.js";
import { Frame, Difficulty, Loader } from "../components/ui.jsx";

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.task(id).then((d) => setTask(d.task)).catch((e) => setError(e.message));
  }, [id]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.acceptTask(id);
      navigate(`/camera/${d.assignment.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (error && !task) return <div className="screen"><div className="error">{error}</div></div>;
  if (!task) return <Loader />;

  const criteria = task.criteria || {};

  return (
    <div className="screen">
      {error && <div className="error">{error}</div>}
      <span className="chip signal">{CATEGORIES[task.category] || task.category}</span>
      <h2 className="title-lg">{task.title}</h2>
      <p>{task.description}</p>

      <Frame className="card">
        <div className="row between">
          <div>
            <p className="eyebrow">Награда</p>
            <p className="mono" style={{ color: "var(--signal)", fontSize: 22, margin: 0 }}>+{task.points}</p>
          </div>
          <div>
            <p className="eyebrow">Время</p>
            <p className="mono" style={{ fontSize: 22, margin: 0 }}>{clock(task.timeLimitSec)}</p>
          </div>
          <div>
            <p className="eyebrow">Сложность</p>
            <Difficulty value={task.difficulty} />
          </div>
        </div>
      </Frame>

      <div className="card">
        <p className="eyebrow">Что нужно показать в кадре</p>
        <ul style={{ paddingLeft: 18, margin: "10px 0 0" }}>
          {criteria.object && <li>Объект: {criteria.object}</li>}
          {criteria.attributes &&
            Object.entries(criteria.attributes).map(([k, v]) => <li key={k}>{k}: {String(v)}</li>)}
          {(criteria.must_be_visible || []).map((m) => <li key={m}>Должно быть видно: {m}</li>)}
          {(criteria.reject_if || []).map((m) => (
            <li key={m} style={{ color: "var(--alarm)" }}>Не подойдёт: {m}</li>
          ))}
        </ul>
      </div>

      <button className="btn" onClick={accept} disabled={busy}>
        {busy ? "Принимаем" : "Взять и открыть камеру"}
      </button>
      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        Таймер запустится сразу после принятия.
      </p>
    </div>
  );
}
