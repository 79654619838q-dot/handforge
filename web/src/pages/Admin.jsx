import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { REASONS, CATEGORIES, date, dateSec, isOnline } from "../lib/format.js";
import { AuthImage, ZoomableAuthImage, Loader } from "../components/ui.jsx";

const TABS = [
  ["game", "Игра"],
  ["stats", "Сводка"],
  ["submissions", "Отправки"],
  ["tasks", "Задания"],
  ["fraud", "Антифрод"],
  ["users", "Игроки"],
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("game");

  if (!["ADMIN", "MODERATOR"].includes(user.role)) {
    return <div className="screen"><div className="error">Доступ только для модераторов</div></div>;
  }

  return (
    <div className="screen admin-shell">
      <p className="eyebrow">Панель управления</p>
      <div className="tabs" style={{ marginTop: 10, flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "game" && <GameControl />}
      {tab === "stats" && <Stats />}
      {tab === "submissions" && <Submissions />}
      {tab === "tasks" && <TasksTab />}
      {tab === "fraud" && <Fraud />}
      {tab === "users" && <Users />}
    </div>
  );
}

function GameControl() {
  const [status, setStatus] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [hours, setHours] = useState(3);
  const [unlimited, setUnlimited] = useState(false);
  const [taskMode, setTaskMode] = useState("SHARED");
  const [verifMode, setVerifMode] = useState(null);
  const [verifBusy, setVerifBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = () => {
    setLoadErr(null);
    api.admin.gameStatus().then((d) => { setStatus(d); setVerifMode((v) => v ?? d.verificationMode); }).catch((e) => setLoadErr(e.message));
  };
  useEffect(load, []);

  const applyVerifMode = async (mode) => {
    setVerifMode(mode);
    setVerifBusy(true);
    try {
      await api.admin.setVerificationMode(mode);
      load();
    } finally {
      setVerifBusy(false);
    }
  };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      await api.admin.startGame(unlimited ? null : Math.round(hours * 60), taskMode);
      load();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!confirm("Остановить игру? Игроки не смогут брать новые задания и снимать, пока не запустишь заново.")) return;
    setBusy(true);
    try {
      await api.admin.stopGame();
      load();
    } finally {
      setBusy(false);
    }
  };

  if (loadErr) return <div className="error">{loadErr}</div>;
  if (!status) return <Loader />;

  const left = status.endsAt ? Math.max(0, new Date(status.endsAt).getTime() - now) : null;
  const leftText = left != null
    ? `${Math.floor(left / 3600000)}ч ${Math.floor((left % 3600000) / 60000)}м ${Math.floor((left % 60000) / 1000)}с`
    : null;

  return (
    <>
    <div className="card">
      <div className="row between" style={{ alignItems: "center" }}>
        <p className="eyebrow" style={{ margin: 0 }}>Статус</p>
        <span className={`chip ${status.active ? "go" : "alarm"}`}>
          {status.active ? "Игра идёт" : "Остановлена"}
        </span>
      </div>

      {status.active && leftText && (
        <p className="mono" style={{ fontSize: 22, margin: "10px 0 0", color: "var(--signal)" }}>{leftText}</p>
      )}
      {status.active && !status.endsAt && (
        <p className="muted" style={{ marginTop: 10 }}>Без ограничения по времени</p>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <label className="row" style={{ gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
            Без ограничения времени
          </label>
        </div>
        {!unlimited && (
          <div className="field" style={{ marginTop: 10, maxWidth: 200 }}>
            <label>Длительность, часов</label>
            <input
              type="number"
              min="0.25"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>
        )}

        <div className="field" style={{ marginTop: 10, maxWidth: 280 }}>
          <label>Режим заданий на этот запуск</label>
          <select value={taskMode} onChange={(e) => setTaskMode(e.target.value)}>
            <option value="SHARED">Для всех — задание видят и могут выполнить все игроки</option>
            <option value="EXCLUSIVE">Кто первый — исчезает у всех после первого зачёта</option>
          </select>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Применится сразу ко всем текущим заданиям при запуске. Отдельное задание всегда можно
            переключить точечно во вкладке «Задания».
          </p>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        <button className="btn go" onClick={start} disabled={busy}>
          {status.active ? "Перезапустить с новым временем" : "Запустить игру"}
        </button>
        {status.active && (
          <button className="btn alarm" onClick={stop} disabled={busy}>
            Остановить игру
          </button>
        )}
      </div>
    </div>

    <div className="card">
      <p className="eyebrow" style={{ margin: 0 }}>Кто проверяет фото</p>
      <div className="stack" style={{ marginTop: 10 }}>
        {[
          ["MANUAL_ONLY", "Только я", "Каждое фото жду вручную в «Отправках» — как сейчас."],
          ["AI_PLUS_ADMIN", "ИИ + я при сомнениях", "ИИ сам решает очевидные случаи, спорные присылает мне на подтверждение."],
          ["AI_ONLY", "Только ИИ", "ИИ сам одобряет и отклоняет, без меня."],
        ].map(([value, title, desc]) => (
          <label
            key={value}
            className="row"
            style={{
              gap: 10, alignItems: "flex-start", cursor: "pointer",
              padding: 10, borderRadius: "var(--r-sm)",
              background: verifMode === value ? "rgba(212,175,55,0.1)" : "transparent",
              border: `1px solid ${verifMode === value ? "rgba(212,175,55,0.5)" : "var(--line)"}`,
            }}
          >
            <input
              type="radio"
              name="verifMode"
              checked={verifMode === value}
              disabled={verifBusy}
              onChange={() => applyVerifMode(value)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontWeight: 600 }}>{title}</span>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>{desc}</p>
            </span>
          </label>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        ИИ подключён через OpenRouter (Gemini 2.5 Flash) — режимы «Только ИИ» и «ИИ + я» реально
        смотрят содержимое кадра, а не только резкость/яркость.
      </p>
    </div>
    </>
  );
}

function Stats() {
  const [s, setS] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => { api.admin.stats().then(setS).catch((e) => setLoadErr(e.message)); }, []);
  if (loadErr) return <div className="error">{loadErr}</div>;
  if (!s) return <Loader />;

  const cells = [
    [s.users, "Всего игроков"],
    [s.onlineNow, "Онлайн сейчас"],
    [s.activeToday, "Активны за сутки"],
    [s.tasksActive, "Активных заданий"],
    [s.pending, "Ждут проверки"],
    [s.fraudToday, "Подозрительных случаев"],
  ];

  return (
    <div className="grid-2">
      {cells.map(([value, label]) => (
        <div className="stat" key={label}><b>{value}</b><span>{label}</span></div>
      ))}
    </div>
  );
}

function Submissions() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("");
  const [loadErr, setLoadErr] = useState(null);
  const [openPhoto, setOpenPhoto] = useState(null);

  const load = () => {
    setLoadErr(null);
    api.admin.submissions(filter).then((d) => setItems(d.items)).catch((e) => setLoadErr(e.message));
  };
  useEffect(() => { setItems(null); load(); }, [filter]);

  const override = async (id, status) => {
    await api.admin.override(id, status, "Ручной пересмотр из админки").catch((e) => setLoadErr(e.message));
    load();
  };

  const remove = async (id) => {
    if (!confirm("Удалить это фото из отправок? Действие необратимо, на очки игрока не влияет.")) return;
    await api.admin.deleteSubmission(id).catch((e) => setLoadErr(e.message));
    load();
  };

  return (
    <>
      <div className="field" style={{ marginBottom: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="APPROVED">Принятые</option>
          <option value="REJECTED">Отклонённые</option>
          <option value="PENDING">В ожидании</option>
        </select>
      </div>

      {loadErr && <div className="error">{loadErr}</div>}
      {!items ? (loadErr ? null : <Loader />) : items.map((s) => (
        <div className="card" key={s.id}>
          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            <div
              style={{ width: 160, flex: "none", aspectRatio: "3/4", background: "#000", borderRadius: 2, overflow: "hidden", cursor: "zoom-in" }}
              onClick={() => setOpenPhoto(s.photoUrl)}
              title="Открыть на весь экран"
            >
              <AuthImage url={s.photoUrl} alt="" fit="contain" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row between">
                <span style={{ fontWeight: 600 }}>{s.task?.title}</span>
                <span className={`chip ${s.status === "APPROVED" ? "go" : s.status === "REJECTED" ? "alarm" : ""}`}>
                  {s.status}
                </span>
              </div>
              <p className="mono muted" style={{ fontSize: 12, margin: "4px 0" }}>
                {s.user?.username} · {dateSec(s.createdAt)}
              </p>
              {s.reasonCode && <span className="chip alarm">{REASONS[s.reasonCode] || s.reasonCode}</span>}
              {s.status === "PENDING" ? (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn go sm" onClick={() => override(s.id, "APPROVED")}>Засчитать</button>
                  <button className="btn alarm sm" onClick={() => override(s.id, "REJECTED")}>Отклонить</button>
                </div>
              ) : (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn ghost sm" onClick={() => remove(s.id)}>Удалить</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {openPhoto && (
        <div className="lightbox" onClick={() => setOpenPhoto(null)}>
          <button className="lightbox-close" onClick={() => setOpenPhoto(null)} aria-label="Закрыть">✕</button>
          <div style={{ width: "100%", height: "100%" }} onClick={(e) => e.stopPropagation()}>
            <ZoomableAuthImage url={openPhoto} alt="" />
          </div>
        </div>
      )}
    </>
  );
}

const EMPTY_TASK = { title: "", description: "", category: "STREET_OBJECTS", difficulty: 2, mode: "SHARED" };

function TasksTab() {
  const [tasks, setTasks] = useState(null);
  const [count, setCount] = useState(12);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(EMPTY_TASK);
  const [addErr, setAddErr] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  const load = () => {
    setLoadErr(null);
    api.admin.tasks().then((d) => setTasks(d.tasks)).catch((e) => setLoadErr(e.message));
  };
  useEffect(load, []);

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api.admin.generate(Number(count), city || null);
      setMsg(`Сгенерировано заданий: ${d.created}`);
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addTask = async () => {
    setAddErr(null);
    try {
      await api.admin.createTask({
        ...draft,
        difficulty: Number(draft.difficulty),
        criteria: { object: draft.description },
      });
      setDraft(EMPTY_TASK);
      setShowAdd(false);
      load();
    } catch (e) {
      setAddErr(e.message);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEdit({ title: t.title, description: t.description, category: t.category, difficulty: t.difficulty });
  };

  const saveEdit = async (id) => {
    await api.admin.updateTask(id, { ...edit, difficulty: Number(edit.difficulty) }).catch(() => {});
    setEditingId(null);
    load();
  };

  return (
    <>
      <div className="card">
        <p className="eyebrow">Генерация заданий ИИ</p>
        <div className="row" style={{ marginTop: 10, gap: 10 }}>
          <input type="number" min="1" max="24" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 90 }} />
          <input placeholder="Город (необязательно)" value={city} onChange={(e) => setCity(e.target.value)} />
          <button className="btn sm" onClick={generate} disabled={busy}>
            {busy ? "Генерируем" : "Создать"}
          </button>
        </div>
        {msg && <p className="mono" style={{ color: "var(--signal)" }}>{msg}</p>}
      </div>

      <div className="card">
        <div className="row between">
          <p className="eyebrow" style={{ margin: 0 }}>Добавить задание вручную</p>
          <button className="btn ghost sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Свернуть" : "+ Добавить"}
          </button>
        </div>

        {showAdd && (
          <div style={{ marginTop: 12 }}>
            {addErr && <div className="error">{addErr}</div>}
            <div className="field">
              <label>Название</label>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Описание (что сфотографировать)</label>
              <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Категория</label>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field" style={{ width: 90 }}>
                <label>Сложн.</label>
                <select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field" style={{ width: 140 }}>
                <label>Режим</label>
                <select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value })}>
                  <option value="SHARED">Для всех</option>
                  <option value="EXCLUSIVE">Кто первый</option>
                </select>
              </div>
            </div>
            <button
              className="btn go sm"
              style={{ marginTop: 10 }}
              onClick={addTask}
              disabled={!draft.title.trim() || !draft.description.trim()}
            >
              Создать задание
            </button>
          </div>
        )}
      </div>

      {loadErr && <div className="error">Не удалось загрузить задания: {loadErr}</div>}

      {!tasks ? (loadErr ? null : <Loader />) : (
        <table className="admin-table">
          <thead>
            <tr><th>Задание</th><th>Кат.</th><th>Сл.</th><th>Очки</th><th>Выдач</th><th>Режим</th><th /></tr>
          </thead>
          <tbody>
            {tasks.map((t) =>
              editingId === t.id ? (
                <tr key={t.id}>
                  <td colSpan={7}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", padding: "6px 0" }}>
                      <input style={{ minWidth: 160 }} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                      <input style={{ flex: 1, minWidth: 200 }} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                      <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                        {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select value={edit.difficulty} onChange={(e) => setEdit({ ...edit, difficulty: e.target.value })}>
                        {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <button className="btn go sm" onClick={() => saveEdit(t.id)}>Сохранить</button>
                      <button className="btn ghost sm" onClick={() => setEditingId(null)}>Отмена</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={t.id} style={{ opacity: t.active ? 1 : 0.45 }}>
                  <td onClick={() => startEdit(t)} style={{ cursor: "pointer" }} title="Нажмите, чтобы изменить">
                    {t.title}<div className="muted" style={{ fontSize: 12 }}>{t.description}</div>
                  </td>
                  <td className="mono">{t.category}</td>
                  <td className="mono">{t.difficulty}</td>
                  <td className="mono">{t.points}</td>
                  <td className="mono">{t.usedCount}</td>
                  <td>
                    <select
                      value={t.mode}
                      onChange={(e) => api.admin.setTaskMode(t.id, e.target.value).then(load)}
                    >
                      <option value="SHARED">Для всех</option>
                      <option value="EXCLUSIVE">Кто первый</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => api.admin.toggleTask(t.id, !t.active).then(load)}>
                      {t.active ? "✕" : "Вернуть"}
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </>
  );
}

function Fraud() {
  const [events, setEvents] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => { api.admin.fraud().then((d) => setEvents(d.events)).catch((e) => setLoadErr(e.message)); }, []);
  if (loadErr) return <div className="error">{loadErr}</div>;
  if (!events) return <Loader />;
  if (!events.length) return <p className="muted">Событий нет.</p>;

  return (
    <table className="admin-table">
      <thead><tr><th>Когда</th><th>Игрок</th><th>Тип</th><th>Вес</th><th>Детали</th></tr></thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td className="mono">{date(e.createdAt)}</td>
            <td>{e.user?.username}{e.user?.banned ? " (бан)" : ""}</td>
            <td><span className="chip alarm">{e.type}</span></td>
            <td className="mono">{e.severity}</td>
            <td className="mono" style={{ fontSize: 11 }}>{JSON.stringify(e.details)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Users() {
  const [users, setUsers] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const load = () => {
    setLoadErr(null);
    api.admin.users().then((d) => setUsers(d.users)).catch((e) => setLoadErr(e.message));
  };
  useEffect(load, []);
  if (loadErr) return <div className="error">{loadErr}</div>;
  if (!users) return <Loader />;

  return (
    <table className="admin-table">
      <thead><tr><th>Игрок</th><th>Ур.</th><th>Очки</th><th>Принято</th><th>Риск</th><th /></tr></thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>
              <span
                title={isOnline(u.lastActiveAt) ? "Онлайн" : "Не в сети"}
                style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6,
                  background: isOnline(u.lastActiveAt) ? "var(--go)" : "var(--muted, #666)",
                }}
              />
              {u.username}
              {u.email && <div className="muted" style={{ fontSize: 11 }}>{u.email}</div>}
              {u.banned && <span className="chip alarm">{u.banReason}</span>}
            </td>
            <td className="mono">{u.level}</td>
            <td className="mono">{u.points}</td>
            <td className="mono">{u.submissionsApproved}/{u.submissionsTotal}</td>
            <td className="mono" style={{ color: u.riskScore > 40 ? "var(--alarm)" : "inherit" }}>{u.riskScore}</td>
            <td>
              <div className="row" style={{ gap: 6 }}>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    const msg = u.banned
                      ? `Разбанить игрока ${u.username}?`
                      : `Забанить игрока ${u.username}? Он потеряет доступ к игре.`;
                    if (!confirm(msg)) return;
                    api.admin.ban(u.id, !u.banned, "Решение модератора").then(load);
                  }}
                >
                  {u.banned ? "Разбанить" : "Забанить"}
                </button>
                <button
                  className="btn alarm sm"
                  onClick={() => {
                    if (!confirm(`Обнулить весь прогресс игрока ${u.username}? Все его фото и отправки удалятся без возврата.`)) return;
                    api.admin.resetUser(u.id).then(load);
                  }}
                >
                  Обновить
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
