// Хранилище клубов и событий доступа.
//
// Два драйвера за одним и тем же набором функций:
//   * PostgreSQL -- рабочий сайт (Render не даёт постоянного диска, файл
//     SQLite там не переживает перезапуск; тот же приём, что у основного
//     сайта -- см. render.yaml, DATABASE_URL);
//   * node:sqlite -- локальная проверка без всякой установки (встроен в
//     Node 22+, отдельной зависимости не нужно).
//
// Драйвер выбирается по DATABASE_URL: postgres://... -- Postgres, иначе
// файл рядом с приложением. Поэтому НИКОГДА не приходится править схему
// перед выкладкой (на основном сайте строку provider в schema.prisma
// меняли руками -- так один раз и уехало в прод не то).
//
// Запросы пишутся на общем подмножестве SQL, параметры -- всегда
// подстановкой, не склейкой строк.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL || "";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

let query; // (sql, params) -> { rows }
let driverName = "none";

if (isPostgres) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 4,
  });
  query = async (sql, params = []) => pool.query(sql, params);
  driverName = "postgres";
} else {
  // node:sqlite -- драйвер ТОЛЬКО для местной проверки. В Node 22 он ещё
  // под флагом (`--experimental-sqlite`), и на Render сайт из-за этого
  // падал при запуске. Рабочему сайту он не нужен вовсе: там Postgres,
  // поэтому его отсутствие -- не беда, а повод честно сказать, что
  // постоянной базы нет.
  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    DatabaseSync = null;
  }
  if (DatabaseSync) {
    const file = url || path.join(__dirname, "..", "access.db");
    const db = new DatabaseSync(file);
    // $1, $2 ... -> ?, ? ... : переписываем на лету, чтобы запросы в коде
    // оставались одни и те же для обоих драйверов.
    query = async (sql, params = []) => {
      const text = sql.replace(/\$(\d+)/g, "?");
      const statement = db.prepare(text);
      if (/^\s*(select|with)/i.test(text)) return { rows: statement.all(...params) };
      if (/returning/i.test(text)) return { rows: statement.all(...params) };
      statement.run(...params);
      return { rows: [] };
    };
    driverName = "sqlite";
  } else {
    query = async () => {
      throw new Error("нет хранилища: задайте DATABASE_URL (Postgres)");
    };
  }
}

export const driver = driverName;

// Время держим строкой ISO в обоих драйверах: SQLite своего типа даты не
// имеет, а сравнение строк ISO совпадает со сравнением самих дат.
export async function init() {
  await query(`CREATE TABLE IF NOT EXISTS access_clubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    login TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    login_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL
  )`);
  await query(`CREATE TABLE IF NOT EXISTS access_events (
    id TEXT PRIMARY KEY,
    club_id TEXT,
    kind TEXT NOT NULL,
    detail TEXT,
    at TEXT NOT NULL
  )`);
  await query(`CREATE INDEX IF NOT EXISTS access_events_club_at ON access_events (club_id, at)`);
}

const rowToClub = (row) => row && ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  login: row.login,
  passwordHash: row.password_hash,
  plan: row.plan,
  startsAt: row.starts_at,
  expiresAt: row.expires_at,
  blocked: Boolean(Number(row.blocked)),
  lastLoginAt: row.last_login_at,
  loginCount: Number(row.login_count),
  downloadCount: Number(row.download_count),
  note: row.note,
  createdAt: row.created_at,
});

export async function listClubs() {
  const { rows } = await query(`SELECT * FROM access_clubs ORDER BY created_at DESC`);
  return rows.map(rowToClub);
}

export async function clubById(id) {
  const { rows } = await query(`SELECT * FROM access_clubs WHERE id = $1`, [id]);
  return rowToClub(rows[0]);
}

export async function clubByLogin(login) {
  const { rows } = await query(`SELECT * FROM access_clubs WHERE login = $1`, [login]);
  return rowToClub(rows[0]);
}

export async function createClub(club) {
  await query(
    `INSERT INTO access_clubs (id, name, contact, login, password_hash, plan, starts_at,
                        expires_at, blocked, login_count, download_count, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,$9,$10)`,
    [club.id, club.name, club.contact || null, club.login, club.passwordHash, club.plan,
     club.startsAt, club.expiresAt, club.note || null, club.createdAt]);
  return clubById(club.id);
}

export async function updateClub(id, fields) {
  const columns = {
    name: "name", contact: "contact", passwordHash: "password_hash", plan: "plan",
    startsAt: "starts_at", expiresAt: "expires_at", blocked: "blocked",
    lastLoginAt: "last_login_at", loginCount: "login_count",
    downloadCount: "download_count", note: "note",
  };
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(fields)) {
    const column = columns[key];
    if (!column) continue;
    params.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return clubById(id);
  params.push(id);
  await query(`UPDATE access_clubs SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  return clubById(id);
}

export async function deleteClub(id) {
  await query(`DELETE FROM access_events WHERE club_id = $1`, [id]);
  await query(`DELETE FROM access_clubs WHERE id = $1`, [id]);
}

export async function addEvent(clubId, kind, detail) {
  await query(`INSERT INTO access_events (id, club_id, kind, detail, at) VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), clubId, kind, detail || null, new Date().toISOString()]);
}

export async function countEvents(kind) {
  const { rows } = await query(`SELECT COUNT(*) AS n FROM access_events WHERE kind = $1`, [kind]);
  // Postgres отдаёт COUNT строкой (bigint), SQLite -- числом.
  return Number(rows[0]?.n || 0);
}

export async function clubEvents(clubId, limit = 50) {
  const { rows } = await query(
    `SELECT kind, detail, at FROM access_events WHERE club_id = $1 ORDER BY at DESC LIMIT $2`,
    [clubId, limit]);
  return rows;
}
