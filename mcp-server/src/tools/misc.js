// tools/misc.js — conformance, staleness, escalation, progress log
import { getDb, resolveProject, audit, now } from '../db.js';
import { ok, fail, req } from './util.js';

export default [
  {
    name: 'recheck_conformance',
    description: '规范漂移再校验: 找出未绑定规范的已分配语言任务(潜在漂移), 并列出仍标记为默认启发式的规范(需显式确认或覆盖)。真正的代码级比对由 agent 执行。',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, session: { type: 'string' } }, required: ['project_id'] },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const unbound = db
        .prepare("SELECT id, title, language, module FROM tasks WHERE project_id = ? AND language IS NOT NULL AND convention_id IS NULL AND type != 'bug'")
        .all(proj.id);
      const heuristic = db
        .prepare('SELECT id, language, module FROM conventions WHERE project_id = ? AND is_default_heuristic = 1')
        .all(proj.id);
      audit(proj.id, a.session, 'recheck_conformance', {});
      return ok({ unbound_tasks: unbound, still_heuristic: heuristic, drift_detected: unbound.length > 0, note: '请 agent 比对代码实际是否符合约定，漂移二选一: 改代码或显式 set_convention 覆盖。' });
    },
  },
  {
    name: 'detect_stale',
    description: '陈旧检测: 项目 updated_at 超龄(默认 7 天) → 标 stale, 续跑前需用户确认。防止基于过期状态乱继续。',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, threshold_days: { type: 'integer', default: 7 } }, required: ['project_id'] },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const ageMs = Date.now() - new Date(proj.updated_at).getTime();
      const ageDays = ageMs / 86400000;
      const stale = ageDays > (a.threshold_days || 7);
      return ok({ project_id: proj.id, last_updated: proj.updated_at, age_days: Math.round(ageDays * 10) / 10, stale, message: stale ? '项目状态已陈旧，续跑前请确认当前真实进度。' : '状态新鲜。' });
    },
  },
  {
    name: 'escalate_to_human',
    description: '诊断循环停滞或需人工决策时上交完整上下文(现象/已试假设/日志/最小复现)。标记 escalate_to=human, 任务转 blocked(waiting:user)。不胡乱改代码凑过。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, context_bundle: { type: 'string', description: '完整上下文 JSON 或文本' }, session: { type: 'string' } },
      required: ['task_id', 'context_bundle'],
    },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      db.prepare("UPDATE tasks SET escalate_to = 'human', status = 'blocked' WHERE id = ?").run(a.task_id);
      db.prepare('INSERT INTO blocks (task_id, reason, blocked_by, created_at) VALUES (?, ?, ?, ?)').run(a.task_id, '已上交人工', 'waiting:user', now());
      audit(task.project_id, a.session, 'escalate_to_human', { task_id: a.task_id });
      return ok({ task_id: a.task_id, escalated_to: 'human', message: '已上交人工，附完整上下文。等待人工决策。' });
    },
  },
  {
    name: 'add_progress_log',
    description: '追加任务叙事进度(落实文章"每完成一小项更新"的外部记忆纪律)。AI 动作先写日志再动手。',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, entry: { type: 'string' }, session: { type: 'string' } }, required: ['task_id', 'entry'] },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      const append = `\n[${now()}] (${a.session || '?'}) ${a.entry}`;
      db.prepare('UPDATE tasks SET progress_log = COALESCE(progress_log, "") || ? WHERE id = ?').run(append, a.task_id);
      audit(task.project_id, a.session, 'add_progress_log', { task_id: a.task_id });
      return ok({ task_id: a.task_id, logged: true });
    },
  },
  {
    name: 'get_progress_log',
    description: '读取任务叙事进度(外部记忆)。',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT progress_log FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      return ok({ task_id: a.task_id, progress_log: task.progress_log || '' });
    },
  },
];
