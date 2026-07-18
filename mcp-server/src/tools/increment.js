// tools/increment.js — incremental (mid-project) change handling (compressed lifecycle)
import { getDb, resolveProject, audit, now, uuid } from '../db.js';
import { ok, fail, req } from './util.js';

export default [
  {
    name: 'classify_change',
    description:
      '判定新需求走 full 还是 compressed 生命周期。重度信号(新模块/schema变更/改鉴权/影响多模块) → full; 轻度(纯UI微调/加字段/小修复) → compressed。拿不准默认归 full。',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' }, description: { type: 'string', description: '变更需求的自然语言描述' } },
      required: ['project_id', 'description'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const d = (a.description || '').toLowerCase();
      const fullSignals = ['新模块', 'new module', 'schema', '数据库结构', '鉴权', '权限', 'auth', 'permission', '架构', 'architecture', '多个模块', 'multiple modules'];
      const compSignals = ['ui 微调', 'ui tweak', '加字段', 'add field', '小修复', 'small fix', 'bug', '文案', '文案修改', '样式'];
      let fullHit = fullSignals.filter((s) => d.includes(s));
      let compHit = compSignals.filter((s) => d.includes(s));
      let path, reason, affected = [];
      if (fullHit.length > 0 && compHit.length === 0) {
        path = 'full';
        reason = `命中重度信号: ${fullHit.join(', ')}`;
      } else if (compHit.length > 0 && fullHit.length === 0) {
        path = 'compressed';
        reason = `命中轻度信号: ${compHit.join(', ')}`;
      } else {
        path = 'full'; // conservative default
        reason = '信号不确定，保守归 full 生命周期';
      }
      return ok({ project_id: proj.id, path, reason, full_signals: fullHit, comp_signals: compHit });
    },
  },

  {
    name: 'add_work_item',
    description: '新建增量工作项(压缩生命周期入口)。记录需求片段, 不改全局 PRD。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        title: { type: 'string' },
        prd_fragment: { type: 'string' },
        change_class: { type: 'string', enum: ['full', 'compressed'] },
        session: { type: 'string' },
      },
      required: ['project_id', 'title'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const info = db
        .prepare('INSERT INTO work_items (project_id, title, kind, change_class, prd_fragment, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(proj.id, a.title, 'increment', a.change_class || null, a.prd_fragment || null, 'active', now());
      audit(proj.id, a.session, 'add_work_item', { wi: info.lastInsertRowid });
      return ok({ work_item_id: info.lastInsertRowid, message: '增量工作项已建。下一步: merge_tickets 并入 DAG。' });
    },
  },

  {
    name: 'merge_tickets',
    description:
      '将增量 ticket 并入现有 DAG, 自动分析对已有任务的影响: 若新任务 depends_on 指向未完成任务 → 自动 blocked; 已完成任务不受影响。',
    inputSchema: {
      type: 'object',
      properties: {
        work_item_id: { type: 'integer' },
        project_id: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string', enum: ['module', 'atomic_task', 'bug', 'refactor', 'upgrade', 'docs', 'spike'] },
              language: { type: 'string' },
              framework: { type: 'string' },
              module: { type: 'string' },
              dod: { type: 'string' },
              test_spec: { type: 'string' },
              acceptance_criteria: { type: 'string' },
              depends_on: { type: 'array', items: { type: 'string' } },
            },
            required: ['title'],
          },
        },
        session: { type: 'string' },
      },
      required: ['project_id', 'tasks'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const t = now();
      const insertTask = db.prepare(
        `INSERT INTO tasks (project_id, work_item_id, type, title, description, language, framework, module, dod, test_spec, acceptance_criteria, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insDep = db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, edge_type) VALUES (?, ?, 'depends_on')");
      const keyMap = new Map();
      const created = [];
      const autoBlocked = [];
      const tx = db.transaction(() => {
        for (const n of a.tasks) {
          const info = insertTask.run(proj.id, a.work_item_id || null, n.type || 'atomic_task', n.title, null, n.language || null, n.framework || null, n.module || null, n.dod ? JSON.stringify(n.dod) : null, n.test_spec ? JSON.stringify(n.test_spec) : null, n.acceptance_criteria || null, t);
          const id = String(info.lastInsertRowid);
          keyMap.set(n.key || id, id);
          created.push({ id, title: n.title });
        }
        for (let i = 0; i < a.tasks.length; i++) {
          const n = a.tasks[i];
          const childId = keyMap.get(a.tasks[i].key || created[i].id);
          for (const dep of n.depends_on || []) {
            let depId = keyMap.get(dep);
            if (!depId) {
              const ex = db.prepare('SELECT id, status FROM tasks WHERE id = ? AND project_id = ?').get(dep, proj.id);
              depId = ex ? ex.id : null;
              if (depId && ex.status !== 'done') {
                // auto-block this new task until dep done
                db.prepare('INSERT INTO blocks (task_id, reason, blocked_by, created_at) VALUES (?, ?, ?, ?)').run(
                  childId,
                  '依赖前置任务未完成',
                  `task:${depId}`,
                  t
                );
                db.prepare("UPDATE tasks SET status = 'blocked' WHERE id = ?").run(childId);
                autoBlocked.push({ task_id: childId, blocked_by: `task:${depId}` });
              }
            }
            if (depId) insDep.run(childId, depId);
          }
        }
      });
      try {
        tx();
      } catch (e) {
        return fail(e.message);
      }
      audit(proj.id, a.session, 'merge_tickets', { count: created.length });
      return ok({ created: created.map((c) => ({ id: c.id, title: c.title })), auto_blocked: autoBlocked, message: '已并入 DAG，受影响票已自动 blocked。' });
    },
  },
];
