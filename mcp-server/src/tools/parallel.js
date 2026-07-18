// tools/parallel.js — file locking + integration coordination
import { getDb, resolveProject, audit, now } from '../db.js';
import { ok, fail, req } from './util.js';

export default [
  {
    name: 'acquire_file_lock',
    description: '获取共享文件锁(并行 agents 写同一文件时串行化)。已被其他会话持有 → 拒绝。',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' }, file_path: { type: 'string' }, session: { type: 'string' } },
      required: ['project_id', 'file_path', 'session'],
    },
    handler: (a) => {
      const db = getDb();
      req(a.session, 'session');
      const existing = db.prepare('SELECT owner_session FROM file_locks WHERE file_path = ?').get(a.file_path);
      if (existing && existing.owner_session !== a.session) {
        return fail(`文件 ${a.file_path} 已被会话 ${existing.owner_session} 锁定`);
      }
      db.prepare('INSERT OR REPLACE INTO file_locks (file_path, owner_session, acquired_at, project_id) VALUES (?, ?, ?, ?)').run(
        a.file_path, a.session, now(), resolveProject(a.project_id)?.id || null
      );
      return ok({ file_path: a.file_path, owner: a.session, locked: true });
    },
  },
  {
    name: 'release_file_lock',
    description: '释放文件锁(仅锁持有者可释放)。',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string' }, session: { type: 'string' } }, required: ['file_path', 'session'] },
    handler: (a) => {
      const db = getDb();
      const existing = db.prepare('SELECT owner_session FROM file_locks WHERE file_path = ?').get(a.file_path);
      if (!existing) return ok({ file_path: a.file_path, released: true, note: '原本无锁' });
      if (existing.owner_session !== a.session) return fail(`只有持有者 ${existing.owner_session} 可释放`);
      db.prepare('DELETE FROM file_locks WHERE file_path = ?').run(a.file_path);
      return ok({ file_path: a.file_path, released: true });
    },
  },
  {
    name: 'check_file_lock',
    description: '查询文件锁状态。写共享文件前必查。',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
    handler: (a) => {
      const db = getDb();
      const row = db.prepare('SELECT owner_session, acquired_at FROM file_locks WHERE file_path = ?').get(a.file_path);
      return ok({ file_path: a.file_path, locked: !!row, owner: row?.owner_session || null, acquired_at: row?.acquired_at || null });
    },
  },
  {
    name: 'integrate_changes',
    description: '并行开发后的集成步骤协调: 将给定 ticket 标记为 review(集成评审), 记录协议事件。冲突解决/冒烟测试由集成负责人(人或 agent)执行。',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' }, ticket_ids: { type: 'array', items: { type: 'string' } }, session: { type: 'string' } },
      required: ['project_id', 'ticket_ids'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const upd = db.prepare("UPDATE tasks SET status = 'review' WHERE id = ? AND project_id = ?");
      for (const id of a.ticket_ids) upd.run(id, proj.id);
      audit(proj.id, a.session, 'integrate_changes', { tickets: a.ticket_ids });
      return ok({ integrated: a.ticket_ids, message: '已进入集成评审。请执行冲突解决 + 冒烟测试(见 parallel-integration.md)。' });
    },
  },
];
