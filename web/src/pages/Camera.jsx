import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { clock } from "../lib/format.js";
import Verifying from "./Verifying.jsx";

/**
 * Съёмка только через getUserMedia: файлового инпута в интерфейсе нет,
 * а сервер не примет кадр без токена сессии камеры.
 * Требуется HTTPS или localhost — иначе браузер не даст доступ к камере.
 */
export default function Camera() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const openedAtRef = useRef(Date.now());

  const [assignment, setAssignment] = useState(null);
  const [captureToken, setCaptureToken] = useState(null);
  const [shot, setShot] = useState(null); // { blob, url }
  const [state, setState] = useState("init"); // init | ready | preview | sending | denied | error
  const [error, setError] = useState(null);
  const [left, setLeft] = useState(null);
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Запрашиваем камеру СРАЗУ, не дожидаясь сетевых запросов — iOS Safari
        // привязывает разрешение на камеру к жесту пользователя и может молча
        // отказать (чёрный экран, без ошибки), если между открытием экрана и
        // getUserMedia прошло слишком много времени (например, бесплатный
        // сервер после сна просыпается 30-60 сек).
        const streamPromise = navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

        const { assignment: a } = await api.activeAssignment();
        if (!a || a.id !== assignmentId) throw new Error("Задание неактивно");
        if (cancelled) return;
        setAssignment(a);

        const session = await api.captureSession(a.id);
        if (cancelled) return;
        setCaptureToken(session.captureToken);

        // На iOS Safari getUserMedia иногда не резолвится и не реджектится
        // вовсе (зависает) — без этого таймаута экран остался бы чёрным
        // навсегда вместо явной ошибки с кнопкой "попробовать снова".
        const stream = await Promise.race([
          streamPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 12000)),
        ]);
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        openedAtRef.current = Date.now();
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "NotAllowedError" || err?.name === "NotFoundError") {
          setState("denied");
        } else if (err?.message === "TIMEOUT") {
          setState("error");
          setError("Камера не откликнулась. Проверьте разрешение камеры для сайта и попробуйте снова.");
        } else {
          setState("error");
          setError(err.message || "Не удалось открыть камеру");
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [assignmentId, stop]);

  useEffect(() => {
    if (!assignment) return;
    const t = setInterval(() => setLeft((new Date(assignment.expiresAt) - Date.now()) / 1000), 500);
    return () => clearInterval(t);
  }, [assignment]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        setShot({ blob, url: URL.createObjectURL(blob) });
        setState("preview");
      },
      "image/jpeg",
      0.92
    );
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setState("ready");
  };

  const send = async () => {
    setState("sending");
    setError(null);

    const form = new FormData();
    form.append("photo", shot.blob, "capture.jpg");
    form.append("assignmentId", assignment.id);
    form.append("nonce", assignment.nonce);
    form.append("captureToken", captureToken);
    form.append(
      "clientMeta",
      JSON.stringify({
        elapsedMs: Date.now() - openedAtRef.current,
        deviceRatio: window.devicePixelRatio,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      })
    );

    try {
      const result = await api.submit(form);
      stop();
      refreshUser().catch(() => {});
      navigate(`/result/${result.submissionId}`, { state: { result }, replace: true });
    } catch (err) {
      setError(err.message);
      setState("preview");
    }
  };

  if (state === "sending") return <Verifying />;

  if (state === "denied" || state === "error") {
    return (
      <div className="screen" style={{ paddingTop: 40 }}>
        <h2 className="title-lg">Камера недоступна</h2>
        {error && <div className="error">{error}</div>}
        <p className="muted">
          Приложение принимает только кадры, снятые прямо сейчас — загрузка из галереи не предусмотрена.
        </p>
        <div className="card">
          <p className="eyebrow">Как включить</p>
          <p style={{ margin: "8px 0 0" }}>
            <b>iOS Safari:</b> Настройки → Safari → Камера → Разрешить.<br />
            <b>Android Chrome:</b> значок замка в адресной строке → Разрешения → Камера.<br />
            <b>Компьютер:</b> значок камеры справа в адресной строке.
          </p>
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Камера работает только по HTTPS или на localhost — это ограничение браузера.
          </p>
        </div>
        <button className="btn" onClick={() => window.location.reload()}>Попробовать снова</button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => navigate("/")}>
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="camera-screen">
      <div className="camera-view">
        {state === "preview" && shot ? (
          <img src={shot.url} alt="Снятый кадр" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}

        <div className="camera-hint">
          <p className="eyebrow" style={{ margin: 0 }}>Задание</p>
          <p style={{ margin: "2px 0 0", fontWeight: 600 }}>{assignment?.task.title}</p>
          <p className="mono" style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.8 }}>
            {assignment?.task.description}
          </p>
          {assignment?.attemptsLeft != null && (
            <p className="mono" style={{ margin: "4px 0 0", fontSize: 12, color: assignment.attemptsLeft <= 2 ? "var(--alarm)" : "var(--paper)" }}>
              Осталось попыток: {assignment.attemptsLeft}
            </p>
          )}
          {left != null && (
            <p className="mono" style={{ margin: "6px 0 0", color: left < 120 ? "var(--alarm)" : "var(--signal)" }}>
              {clock(left)}
            </p>
          )}
        </div>

        {state === "ready" && (
          <div className="reticle frame">
            <span className="frame-b" />
          </div>
        )}

        {flash && <div className="camera-flash" />}
      </div>

      {error && <div className="error" style={{ margin: 12 }}>{error}</div>}

      <div className="camera-bar">
        {state === "preview" ? (
          <>
            <button className="btn ghost sm" onClick={retake}>Переснять</button>
            <button className="btn go sm" onClick={send}>Отправить на проверку</button>
          </>
        ) : (
          <>
            <button className="btn ghost sm" onClick={() => { stop(); navigate("/"); }}>Выйти</button>
            <button className="shutter" onClick={capture} aria-label="Снять" disabled={state !== "ready"} />
            <span style={{ width: 72 }} />
          </>
        )}
      </div>
    </div>
  );
}
