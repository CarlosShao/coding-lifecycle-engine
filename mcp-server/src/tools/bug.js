// tools/bug.js — bug handling track (sibling to feature lifecycle) + abandon
import { getDb, resolveProject, audit, now, uuid } from '../db.js';
import { ok, fail, req } from './util.js';

export default [
  {
    name: 'report_bug',
    description:
      '建 type=bug 节点(顽固 bug 轨道入口)。source: test_failure | review | production。填 symptom + severity。进入诊断循环: 稳定复现 → diagnosing-bugs(假设→验证→修复→复验) → 带回归测试 → anti-shortcut 核对 → complete_task。不重置项目阶段。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        title: { type: 'string' },
        symptom: { type: 'string' },
        severity: { type: 'string', enum: ['critical', 'high', 'med', 'low'], default: 'med' },
        source: { type: 'string', enum: ['test_failure', 'review', 'production'], default: 'test_failure' },
        module: { type: 'string' },
        language: { type: 'string' },
        session: { type: 'string' },
      },
      required: ['project_id', 'symptom'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const info = db.prepare(
        `INSERT INTO tasks (project_id, type, title, symptom, severity, status, module, language, hypothesis, created_at)
         VALUES (?, 'bug', ?, ?, ?, 'todo', ?, ?, '[]', ?)`
      ).run(proj.id, a.title || `bug: ${a.symptom.slice(0, 40)}`, a.symptom, a.severity || 'med', a.module || null, a.language || null, now());
      const id = String(info.lastInsertRowid);
      audit(proj.id, a.session, 'report_bug', { bug_id: id, source: a.source });
      return ok({ bug_id: id, message: 'Bug 已登记。先 reproduce 稳定复现，再走 diagnosing-bugs 循环。' });
    },
  },

  {
    name: 'abandon_work_item',
    description: '标记任务 abandoned/superseded 并清理依赖边(避免孤儿节点)。不影响其他已完成任务。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, reason: { type: 'string' }, status: { type: 'string', enum: ['abandoned', 'superseded'], default: 'abandoned' }, session: { type: 'string' } },
      required: ['task_id', 'reason'],
    },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(a.status || 'abandoned', a.task_id);
      // remove edges referencing this task so dependents are not orphan-blocked
      db.prepare('DELETE FROM task_dependencies WHERE depends_on_task_id = ? OR task_id = ?').run(a.task_id, a.task_id);
      audit(task.project_id, a.session, 'abandon_work_item', { task_id: a.task_id, reason: a.reason });
      return ok({ task_id: a.task_id, status: a.status || 'abandoned', message: '已标记并清理依赖边。' });
    },
  },
];
