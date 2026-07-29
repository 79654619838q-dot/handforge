import { useEffect, useState } from "react";

const STAGES = [
  "Загружаем кадр",
  "Проверяем подлинность",
  "ИИ анализирует изображение",
  "Считаем очки",
];

/** Экран проверки. Стадии условные — они объясняют ожидание, а не транслируют бэкенд. */
export default function Verifying() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="camera-screen" style={{ background: "var(--ink)", padding: 24, justifyContent: "center" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
        <p className="eyebrow">Проверка</p>
        <h2 className="title-lg">Смотрим, что вы сняли</h2>
        <ul className="stages">
          {STAGES.map((label, i) => (
            <li key={label} className={i < stage ? "done" : i === stage ? "active" : ""}>
              {i < stage ? <span>✓</span> : i === stage ? <span className="pulse" /> : <span>·</span>}
              {label}
            </li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          Обычно занимает 3–8 секунд. Не закрывайте страницу.
        </p>
      </div>
    </div>
  );
}
