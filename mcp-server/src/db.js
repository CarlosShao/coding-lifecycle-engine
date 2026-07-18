// db.js — SQLite connection, migration runner, and shared helpers.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function resolveDbPath() {
  if (process.env.AI_LIFECYCLE_DB) return process.env.AI_LIFECYCLE_DB;
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  const dir = path.join(home, '.workbuddy', 'ai-coding');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'lifecycle.db');
}

export const DB_PATH = resolveDbPath();
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Migration runner ----
function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
  );`);
  const applied = new Set(
    db.prepare('SELECT version FROM migrations').all().map((r) => r.version)
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const version = parseInt(f.split('_')[0], 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO migrations (version, applied_at) VALUES (?, ?)'
      ).run(version, new Date().toISOString());
    });
    tx();
  }
}
runMigrations();

// ---- Helpers ----
export function now() {
  return new Date().toISOString();
}
export function uuid() {
  return randomUUID();
}

export function getDb() {
  return db;
}

export function closeDb() {
  try {
    db.close();
  } catch {
    // ignore
  }
}

// Resolve a project identifier (id or root_path) to its row.
export function resolveProject(p) {
  if (!p) return null;
  let row = db.prepare('SELECT * FROM projects WHERE id = ?').get(p);
  if (row) return row;
  row = db.prepare('SELECT * FROM projects WHERE root_path = ?').get(p);
  return row || null;
}

// Audit log — every tool call recorded.
export function audit(projectId, session, tool, payload) {
  try {
    db.prepare(
      `INSERT INTO events (project_id, session, tool, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(projectId ?? null, session ?? null, tool, JSON.stringify(payload ?? {}), now());
  } catch {
    // never let audit failure break a tool
  }
}

// Touch project.updated_at
export function touchProject(projectId) {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId);
}

// Cycle detection for DAG add: would adding dep target->task create a cycle?
export function wouldCreateCycle(taskId, dependsOnId) {
  // If dependsOnId can reach taskId via depends_on edges, adding taskId->dependsOnId cycles.
  // Normalize all ids to String (DB returns INTEGER; callers pass STRING).
  const adj = db
    .prepare('SELECT task_id, depends_on_task_id FROM task_dependencies')
    .all();
  const graph = new Map();
  for (const e of adj) {
    const from = String(e.task_id);
    const to = String(e.depends_on_task_id);
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  }
  const tId = String(taskId);
  const dId = String(dependsOnId);
  const stack = [dId];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (n === tId) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of graph.get(n) || []) stack.push(m);
  }
  return false;
}

export default db;
