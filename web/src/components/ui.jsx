import { useEffect, useRef, useState } from "react";
import { fetchPhoto } from "../lib/api.js";
import { clock, initials } from "../lib/format.js";

/** Уголки видоискателя — фирменная рамка приложения. */
export const Frame = ({ tone = "", className = "", children, ...rest }) => (
  <div className={`frame ${tone} ${className}`} {...rest}>
    <span className="frame-b" />
    {children}
  </div>
);

export const Difficulty = ({ value }) => (
  <span className="diff" aria-label={`Сложность ${value} из 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <i key={i} className={i <= value ? "on" : ""} />
    ))}
  </span>
);

export const Avatar = ({ name, color = "#F2C43D" }) => (
  <span className="avatar" style={{ background: color }}>
    {initials(name)}
  </span>
);

/** Фото доступно только владельцу — грузим с токеном и отдаём blob. */
export function AuthImage({ url, alt = "", fit = "cover" }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    fetchPhoto(url)
      .then((u) => {
        if (cancelled) return URL.revokeObjectURL(u);
        objectUrl = u;
        setSrc(u);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) return <div className="muted mono" style={{ fontSize: 10, padding: 8 }}>нет файла</div>;
  if (!src) return <div style={{ width: "100%", height: "100%", background: "#1b2430" }} />;
  return <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} />;
}

/**
 * То же самое, но с ручным пинч-зумом и двойным тапом — нативный зум браузера
 * не работает в установленном PWA (display:standalone скрывает его на iOS и
 * Android независимо от viewport-meta), поэтому для полноэкранного просмотра
 * фото (лайтбокс) зум приходится реализовывать самим через Pointer Events.
 */
export function ZoomableAuthImage({ url, alt = "" }) {
  const wrapRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null); // { startDist, startScale, startMid, startTx, startTy }
  const lastTapRef = useRef(0);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });

  useEffect(() => setTransform({ scale: 1, tx: 0, ty: 0 }), [url]);

  const clampScale = (s) => Math.min(4, Math.max(1, s));

  const midOf = (pts) => {
    const [a, b] = pts;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const distOf = (pts) => {
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      gesture.current = {
        startDist: distOf(pts),
        startScale: transform.scale,
        startMid: midOf(pts),
        startTx: transform.tx,
        startTy: transform.ty,
      };
    } else if (pointers.current.size === 1) {
      if (transform.scale > 1) {
        gesture.current = { pan: true, startX: e.clientX, startY: e.clientY, startTx: transform.tx, startTy: transform.ty };
      }
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setTransform((t) => (t.scale > 1 ? { scale: 1, tx: 0, ty: 0 } : { scale: 2.5, tx: 0, ty: 0 }));
        gesture.current = null;
      }
      lastTapRef.current = now;
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && gesture.current?.startDist) {
      const pts = [...pointers.current.values()];
      const dist = distOf(pts);
      const scale = clampScale(gesture.current.startScale * (dist / gesture.current.startDist));
      setTransform((t) => ({ ...t, scale }));
    } else if (gesture.current?.pan) {
      const dx = e.clientX - gesture.current.startX;
      const dy = e.clientY - gesture.current.startY;
      setTransform((t) => ({ ...t, tx: gesture.current.startTx + dx, ty: gesture.current.startTy + dy }));
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    setTransform((t) => (t.scale <= 1 ? { scale: 1, tx: 0, ty: 0 } : t));
  };

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div
        style={{
          width: "100%", height: "100%",
          transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
          transformOrigin: "center center",
          transition: gesture.current ? "none" : "transform 0.15s ease-out",
        }}
      >
        <AuthImage url={url} alt={alt} fit="contain" />
      </div>
    </div>
  );
}

export function Countdown({ expiresAt, issuedAt, onExpire }) {
  const [left, setLeft] = useState(() => (new Date(expiresAt) - Date.now()) / 1000);

  useEffect(() => {
    const t = setInterval(() => {
      const value = (new Date(expiresAt) - Date.now()) / 1000;
      setLeft(value);
      if (value <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);

  const total = (new Date(expiresAt) - new Date(issuedAt)) / 1000;
  const percent = Math.max(0, Math.min(100, (left / total) * 100));
  const low = left < 120;

  return (
    <div>
      <div className={`timer ${low ? "low" : ""}`}>{clock(left)}</div>
      <div className="bar" style={{ marginTop: 6 }}>
        <i style={{ width: `${percent}%`, background: low ? "var(--alarm)" : "var(--signal)" }} />
      </div>
    </div>
  );
}

export const Empty = ({ title, text, action }) => (
  <div className="empty">
    <div className="title-md">{title}</div>
    <p>{text}</p>
    {action}
  </div>
);

export const Loader = ({ text = "Загрузка" }) => (
  <div className="empty">
    <div className="spinner" />
    <p className="mono muted" style={{ margin: 0 }}>{text}…</p>
  </div>
);
