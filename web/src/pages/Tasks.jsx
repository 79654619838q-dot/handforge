import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { CATEGORIES } from "../lib/format.js";
import { Frame, Difficulty, Loader, Empty } from "../components/ui.jsx";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [gameActive, setGameActive] = useState(true);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .tasks(category ? `?category=${category}` : "")
      .then((d) => {
        setTasks(d.tasks);
        setGameActive(d.gameActive !== false);
      })
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="screen">
      <p className="eyebrow">Доступные задания</p>

      <div className="field" style={{ margin: "10px 0 16px" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Категория">
          <option value="">Все категории</option>
          {Object.entries(CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loader />
      ) : !gameActive ? (
        <Empty title="Игра остановлена" text="Список заданий откроется, как только админ запустит игру." />
      ) : tasks.length === 0 ? (
        <Empty title="Пусто" text="В этой категории пока нет заданий." />
      ) : (
        tasks.map((t, i) => (
          <Link key={t.id} to={`/tasks/${t.id}`} style={{ color: "inherit" }}>
            <Frame className="card tight stagger" style={{ "--i": i }}>
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <span className="chip">{CATEGORIES[t.category] || t.category}</span>
                  <h3 className="title-md" style={{ marginTop: 8 }}>{t.title}</h3>
                  <Difficulty value={t.difficulty} />
                </div>
                <span className="mono" style={{ color: "var(--signal)", fontSize: 18 }}>+{t.points}</span>
              </div>
            </Frame>
          </Link>
        ))
      )}
    </div>
  );
}
