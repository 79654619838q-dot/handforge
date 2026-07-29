import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { REASONS } from "../lib/format.js";
import { Frame, AuthImage, Loader } from "../components/ui.jsx";

/** Считает очки от 0 до value за duration мс — момент награды должен ощущаться. */
function useCountUp(value, duration = 700) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    if (value == null) return;
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return display;
}

export default function Result() {
  const { submissionId } = useParams();
  const { state } = useLocation();
  const [result, setResult] = useState(state?.result || null);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    api.submission(submissionId).then((d) => setDetails(d.submission)).catch(() => {});
  }, [submissionId]);

  useEffect(() => {
    if (!result && details) {
      setResult({
        status: details.status,
        score: details.score,
        breakdown: details.breakdown,
        reasonCode: details.reasonCode,
        reasons: details.ai?.reasons || [],
        ai: details.ai,
      });
    }
  }, [details, result]);

  const displayScore = useCountUp(result?.status === "APPROVED" ? result.score : null);

  if (!result) return <Loader text="Загружаем вердикт" />;

  const approved = result.status === "APPROVED";
  const pending = result.status === "PENDING";
  const tone = approved ? "go" : pending ? "" : "alarm";

  return (
    <div className="screen">
      <p className="eyebrow">Результат проверки</p>

      <Frame tone={tone} className={`card ${approved ? "result-pop" : ""}`} style={{ marginTop: 8 }}>
        <h2 className="title-lg" style={{ color: approved ? "var(--go)" : pending ? "var(--paper)" : "var(--alarm)" }}>
          {approved ? "Задание принято" : pending ? "Проверка продолжается" : "Не засчитано"}
        </h2>

        {approved && (
          <>
            <p className="mono" style={{ fontSize: 34, color: "var(--signal)", margin: "4px 0" }}>
              +{displayScore}
            </p>
            {result.breakdown && (
              <div className="mono muted" style={{ fontSize: 13 }}>
                <div className="row between"><span>база</span><span>{result.breakdown.base}</span></div>
                <div className="row between"><span>скорость ×{result.breakdown.speedMultiplier}</span><span>+{result.breakdown.speed}</span></div>
                <div className="row between"><span>серия</span><span>+{result.breakdown.streak}</span></div>
              </div>
            )}
          </>
        )}

        {!approved && !pending && (
          <>
            <span className="chip alarm">{REASONS[result.reasonCode] || result.reasonCode}</span>
            <ul style={{ paddingLeft: 18, marginTop: 12 }}>
              {(result.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {result.attemptsLeft > 0 && (
              <p className="mono muted">Осталось попыток: {result.attemptsLeft}</p>
            )}
          </>
        )}

        {pending && <p>{result.message || "Мы допроверим кадр и пришлём уведомление. Попытка не потрачена."}</p>}
      </Frame>

      {details && (
        <Frame className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ aspectRatio: "4/3", background: "#000" }}>
            <AuthImage url={details.photoUrl} alt="Ваш кадр" fit="contain" />
          </div>
        </Frame>
      )}

      {result.ai?.detected?.length > 0 && (
        <div className="card">
          <p className="eyebrow">ИИ увидел в кадре</p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {result.ai.detected.map((d, i) => <span key={i} className="chip">{d}</span>)}
          </div>
          {result.ai.extractedText && (
            <p className="mono" style={{ marginTop: 10 }}>Текст: {result.ai.extractedText}</p>
          )}
          {result.ai.mock && (
            <p className="muted" style={{ fontSize: 12 }}>
              Ключ ИИ не задан — работает локальная заглушка проверки.
            </p>
          )}
        </div>
      )}

      {result.unlockedAchievements?.length > 0 && (
        <Frame className="card">
          <p className="eyebrow">Новые достижения</p>
          {result.unlockedAchievements.map((a, i) => (
            <p key={a.code} className="title-md stagger" style={{ color: "var(--signal)", "--i": i }}>{a.title}</p>
          ))}
        </Frame>
      )}

      {result.attemptsLeft > 0 && !approved ? (
        <Link className="btn" to="/">Вернуться и переснять</Link>
      ) : (
        <Link className="btn" to="/tasks">Выбрать следующее задание</Link>
      )}
    </div>
  );
}
