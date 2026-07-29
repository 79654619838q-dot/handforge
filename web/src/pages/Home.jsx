import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { CATEGORIES } from "../lib/format.js";
import { Frame, Difficulty, Countdown, Empty, Loader } from "../components/ui.jsx";

export default function Home() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [game, setGame] = useState(null);
  const [tasksTotal, setTasksTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.activeAssignment(), api.gameStatus(), api.profile()])
      .then(([a, g, p]) => {
        setAssignment(a.assignment);
        setGame(g);
        setTasksTotal(p.stats.tasksTotal);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    refreshUser().catch(() => {});
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, refreshUser]);

  if (loading) return <Loader />;

  const gameOff = game && !game.active;

  return (
    <div className="screen">
      {error && <div className="error">{error}</div>}

      {gameOff && (
        <div className="alert">
          <p className="eyebrow" style={{ margin: 0 }}>Игра остановлена</p>
          <p style={{ margin: "6px 0 0" }}>
            Админ пока не запустил игру — новые задания брать нельзя. Загляните чуть позже.
          </p>
        </div>
      )}

      {assignment ? (
        <>
          <p className="eyebrow">Активное задание</p>
          <Frame className="card" style={{ marginTop: 8 }}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div>
                <span className="chip signal">{CATEGORIES[assignment.task.category] || assignment.task.category}</span>
                <h2 className="title-lg">{assignment.task.title}</h2>
              </div>
              <span className="mono" style={{ color: "var(--signal)", fontSize: 20 }}>
                +{assignment.task.points}
              </span>
            </div>

            <p>{assignment.task.description}</p>

            <div className="row between" style={{ marginTop: 16 }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: 4 }}>Осталось</p>
                <Countdown
                  expiresAt={assignment.expiresAt}
                  issuedAt={assignment.issuedAt}
                  onExpire={load}
                />
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="eyebrow" style={{ marginBottom: 6 }}>Сложность</p>
                <Difficulty value={assignment.task.difficulty} />
                <p className="mono muted" style={{ fontSize: 11, marginTop: 8 }}>
                  попыток: {assignment.attemptsLeft}
                </p>
              </div>
            </div>
          </Frame>

          <button className="btn" onClick={() => navigate(`/camera/${assignment.id}`)} disabled={gameOff}>
            Открыть камеру
          </button>
        </>
      ) : gameOff ? null : (
        <Empty
          title="Активного задания нет"
          text="Выберите задание из списка."
          action={
            <div className="stack" style={{ maxWidth: 280, margin: "18px auto 0" }}>
              <Link className="btn" to="/tasks">Выбрать задание</Link>
            </div>
          }
        />
      )}

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="stat">
          <b>{user?.points ?? 0}</b>
          <span>Очки</span>
        </div>
        <div className="stat">
          <b>{user?.submissionsApproved ?? 0}/{tasksTotal ?? "—"}</b>
          <span>Задания</span>
        </div>
      </div>
    </div>
  );
}
