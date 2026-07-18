// tools/execution.js — task claim / dependency gating / completion
import { getDb, resolveProject, audit, now } from '../db.js';
import { ok, fail, req } from './util.js';

function unmetDeps(db, taskId) {
  const deps = db
    .prepare(
      `SELECT td.depends_on_task_id, t.title, t.status, t.owner_session
       FROM task_dependencies td JOIN tasks t ON t.id = td.depends_on_task_id
       WHERE td.task_id = ?`
    )
    .all(taskId);
  return deps.filter((d) => d.status !== 'done');
}

function conventionForTask(db, task) {
  if (task.convention_id) {
    return db.prepare('SELECT * FROM conventions WHERE id = ?').get(task.convention_id);
  }
  if (task.module) {
    const c = db
      .prepare('SELECT * FROM conventions WHERE project_id = ? AND module = ? ORDER BY id DESC LIMIT 1')
      .get(task.project_id, task.module);
    if (c) return c;
  }
  if (task.language) {
    const c = db
      .prepare('SELECT * FROM conventions WHERE project_id = ? AND language = ? AND (module IS NULL) ORDER BY id DESC LIMIT 1')
      .get(task.project_id, task.language);
    if (c) return c;
  }
  return null;
}

export default [
  {
    name: 'claim_task',
    description: '认领任务(加锁)。已被其他会话认领 → 拒绝。这是多会话安全协作的硬闸门。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, session: { type: 'string' } },
      required: ['task_id', 'session'],
    },
    handler: (a) => {
      const db = getDb();
      req(a.task_id, 'task_id');
      req(a.session, 'session');
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      if (task.owner_session && task.owner_session !== a.session) {
        return fail(`任务已被会话 ${task.owner_session} 认领，无法重复认领`);
      }
      db.prepare("UPDATE tasks SET owner_session = ?, claimed_at = ?, status = 'in_progress' WHERE id = ?").run(
        a.session,
        now(),
        a.task_id
      );
      audit(task.project_id, a.session, 'claim_task', { task_id: a.task_id });
      return ok({ task_id: a.task_id, owner: a.session, status: 'in_progress' });
    },
  },

  {
    name: 'check_dependencies',
    description: '返回未满足的前置依赖 + 跨会话提醒文案。开工前必调: 若前置属于另一会话且未完成，停下并提示用户先去完成。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, session: { type: 'string' } },
      required: ['task_id'],
    },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      const unmet = unmetDeps(db, a.task_id);
      let reminder = null;
      if (unmet.length > 0) {
        const cross = unmet.filter((d) => d.owner_session && d.owner_session !== a.session);
        if (cross.length > 0) {
          reminder = `任务 #${a.task_id} 依赖以下未完成任务(属其他会话): ${cross
            .map((d) => `#${d.depends_on_task_id}(${d.title})@${d.owner_session})`)
            .join(', ')}。请先去对应会话完成前置，再回来认领本任务。`;
        } else {
          reminder = `任务 #${a.task_id} 有 ${unmet.length} 个前置未完成，先完成它们。`;
        }
      }
      return ok({ task_id: a.task_id, unmet, blocked: unmet.length > 0, reminder });
    },
  },

  {
    name: 'start_task',
    description: '标记 in_progress 并返回该任务的规范+契约+DoD(分层注入用)。依赖全 done 才允许。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, session: { type: 'string' } },
      required: ['task_id'],
    },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      const unmet = unmetDeps(db, a.task_id);
      if (unmet.length > 0) return fail(`前置未完成: ${unmet.map((d) => `#${d.depends_on_task_id}`).join(',')}。先完成前置。`);
      db.prepare("UPDATE tasks SET status = 'in_progress', owner_session = COALESCE(owner_session, ?) WHERE id = ?").run(a.session || null, a.task_id);
      const conv = conventionForTask(db, task);
      const contracts = db
        .prepare(
          `SELECT provider_module, consumer_module, interface_spec, version FROM contracts
           WHERE project_id = ? AND (provider_module = ? OR consumer_module = ?) AND status = 'frozen'`
        )
        .all(task.project_id, task.module || '', task.module || '');
      audit(task.project_id, a.session, 'start_task', { task_id: a.task_id });
      return ok({
        task: { id: task.id, title: task.title, description: task.description, acceptance_criteria: task.acceptance_criteria, nfr: task.nfr, dod: task.dod ? JSON.parse(task.dod) : null, test_spec: task.test_spec ? JSON.parse(task.test_spec) : null },
        conventions: conv ? { language: conv.language, framework: conv.framework, formatter: conv.formatter, linter: conv.linter, test_framework: conv.test_framework, coverage_threshold: conv.coverage_threshold, quality_rules: conv.quality_rules ? JSON.parse(conv.quality_rules) : null, max_file_lines: conv.max_file_lines, max_function_lines: conv.max_function_lines } : null,
        contracts,
      });
    },
  },

  {
    name: 'complete_task',
    description: '标记完成。强制校验: 依赖全 done + 有 evidence(测试通过/DoD 证据)。否则拒绝。不假装通过。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        evidence: { type: 'string', description: '完成证据: 测试通过、覆盖率达标、lint 通过等' },
        session: { type: 'string' },
      },
      required: ['task_id', 'evidence'],
    },
    handler: (a) => {
      const db = getDb();
      req(a.evidence, 'evidence');
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      const unmet = unmetDeps(db, a.task_id);
      if (unmet.length > 0) return fail(`依赖未完成，不能标记完成: ${unmet.map((d) => `#${d.depends_on_task_id}`).join(',')}`);
      db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, progress_log = COALESCE(progress_log,'') || ? WHERE id = ?").run(
        now(),
        `\n[${now()}] COMPLETED: ${a.evidence}`,
        a.task_id
      );
      audit(task.project_id, a.session, 'complete_task', { task_id: a.task_id });
      return ok({ task_id: a.task_id, status: 'done' });
    },
  },

  {
    name: 'submit_review',
    description: '任务进入 review 状态(等待对抗性审查 / 人工 review)。',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, session: { type: 'string' } }, required: ['task_id'] },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      db.prepare("UPDATE tasks SET status = 'review' WHERE id = ?").run(a.task_id);
      audit(task.project_id, a.session, 'submit_review', { task_id: a.task_id });
      return ok({ task_id: a.task_id, status: 'review' });
    },
  },

  {
    name: 'block_task',
    description: '记录阻塞(外部依赖/等待用户/依赖其他任务)。记 workaround, 不假装通过。blocked 状态对所有会话可见。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        reason: { type: 'string' },
        blocked_by: { type: 'string', description: 'external:<dep> | task:<id> | waiting:user' },
        workaround: { type: 'string' },
        session: { type: 'string' },
      },
      required: ['task_id', 'reason', 'blocked_by'],
    },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      db.prepare('INSERT INTO blocks (task_id, reason, blocked_by, workaround, created_at) VALUES (?, ?, ?, ?, ?)').run(
        a.task_id,
        a.reason,
        a.blocked_by,
        a.workaround || null,
        now()
      );
      db.prepare("UPDATE tasks SET status = 'blocked' WHERE id = ?").run(a.task_id);
      audit(task.project_id, a.session, 'block_task', { task_id: a.task_id, blocked_by: a.blocked_by });
      return ok({ task_id: a.task_id, status: 'blocked', message: '已记阻塞。交付前须清零或显式豁免。' });
    },
  },

  {
    name: 'unblock_task',
    description: '解阻塞: 记录解决方式, 任务回到 in_progress。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, resolution: { type: 'string' }, session: { type: 'string' } },
      required: ['task_id', 'resolution'],
    },
    handler: (a) => {
      const db = getDb();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      db.prepare('UPDATE blocks SET resolved_at = ? WHERE task_id = ? AND resolved_at IS NULL').run(now(), a.task_id);
      db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(a.task_id);
      audit(task.project_id, a.session, 'unblock_task', { task_id: a.task_id });
      return ok({ task_id: a.task_id, status: 'in_progress' });
    },
  },

  {
    name: 'get_next',
    description: '推荐下一个可做的原子任务: 状态 todo、依赖全 done、未被其他会话认领。用于驱动并行开发。',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' }, session: { type: 'string' }, limit: { type: 'integer', default: 5 } },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const tasks = db
        .prepare(
          `SELECT id, title, type, module, language, status, owner_session FROM tasks
           WHERE project_id = ? AND type = 'atomic_task' AND (status = 'todo') ORDER BY created_at`
        )
        .all(proj.id);
      const out = [];
      for (const t of tasks) {
        if (out.length >= (a.limit || 5)) break;
        const unmet = unmetDeps(db, t.id);
        if (unmet.length > 0) continue;
        if (t.owner_session && t.owner_session !== a.session) continue;
        out.push({ id: t.id, title: t.title, module: t.module, language: t.language });
      }
      return ok({ recommended: out });
    },
  },
];
