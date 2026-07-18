// tools/memory.js — cross-session decisions + memory
import { getDb, resolveProject, audit, now } from '../db.js';
import { ok, fail, req } from './util.js';

export default [
  {
    name: 'record_decision',
    description: '记录 ADR-lite 决策(跨会话可见)。context/decision/consequences。可绑定 task_id。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        context: { type: 'string' },
        decision: { type: 'string' },
        consequences: { type: 'string' },
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['proposed', 'accepted', 'superseded'], default: 'accepted' },
        session: { type: 'string' },
      },
      required: ['project_id', 'context', 'decision'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const info = db
        .prepare('INSERT INTO decisions (project_id, task_id, status, context, decision, consequences, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(proj.id, a.task_id || null, a.status || 'accepted', a.context, a.decision, a.consequences || null, now());
      audit(proj.id, a.session, 'record_decision', {});
      return ok({ decision_id: info.lastInsertRowid });
    },
  },

  {
    name: 'save_memory',
    description: '跨会话记忆(lesson/preference/env/observation)。upsert by project+category+key。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        category: { type: 'string', enum: ['lesson', 'preference', 'env', 'observation'] },
        key: { type: 'string' },
        value: { type: 'string' },
        session: { type: 'string' },
      },
      required: ['project_id', 'category', 'key', 'value'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const existing = db.prepare('SELECT id FROM memory WHERE project_id = ? AND category = ? AND key = ?').get(proj.id, a.category, a.key);
      if (existing) {
        db.prepare('UPDATE memory SET value = ?, created_at = ? WHERE id = ?').run(a.value, now(), existing.id);
      } else {
        db.prepare('INSERT INTO memory (project_id, category, key, value, created_at) VALUES (?, ?, ?, ?, ?)').run(proj.id, a.category, a.key, a.value, now());
      }
      audit(proj.id, a.session, 'save_memory', { key: a.key });
      return ok({ saved: true });
    },
  },

  {
    name: 'search_memory',
    description: '检索跨会话记忆(模糊匹配 key/value)。',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' }, query: { type: 'string' }, category: { type: 'string' } },
      required: ['project_id', 'query'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      let rows;
      if (a.category) {
        rows = db.prepare("SELECT category, key, value, created_at FROM memory WHERE project_id = ? AND category = ? AND (key LIKE ? OR value LIKE ?)").all(proj.id, a.category, `%${a.query}%`, `%${a.query}%`);
      } else {
        rows = db.prepare("SELECT category, key, value, created_at FROM memory WHERE project_id = ? AND (key LIKE ? OR value LIKE ?)").all(proj.id, `%${a.query}%`, `%${a.query}%`);
      }
      return ok({ results: rows });
    },
  },
];
