// tools/dag.js — recursive WBS decomposition, contracts, DAG query
import { getDb, resolveProject, audit, now, uuid, wouldCreateCycle } from '../db.js';
import { ok, fail, req } from './util.js';

// In-memory cycle check (tx-safe): does depId reach childId via memEdges?
function memCycle(childId, depId, memEdges) {
  const c = String(childId);
  const d = String(depId);
  const graph = new Map();
  for (const [f, t] of memEdges) {
    const from = String(f);
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(String(t));
  }
  const stack = [d];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (n === c) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of graph.get(n) || []) stack.push(m);
  }
  return false;
}

export default [
  {
    name: 'decompose',
    description:
      '递归拆分任务，建 DAG 节点 + 依赖边。每个 node 可带 key(同批引用)、depends_on(同批key或已存在task id)、type/language/framework/module/dod/test_spec/acceptance_criteria/nfr/estimate。循环依赖会被拒绝(成环直接拒)。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        parent_id: { type: 'integer', description: '父任务 id(递归拆子节点);省略则建为项目根级' },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string', enum: ['module', 'atomic_task', 'bug', 'refactor', 'upgrade', 'docs', 'spike'] },
              description: { type: 'string' },
              language: { type: 'string' },
              framework: { type: 'string' },
              module: { type: 'string' },
              dod: { type: 'string' },
              test_spec: { type: 'string' },
              acceptance_criteria: { type: 'string' },
              nfr: { type: 'string' },
              estimate: { type: 'string' },
              depends_on: { type: 'array', items: { type: 'string' } },
            },
            required: ['title'],
          },
        },
        session: { type: 'string' },
      },
      required: ['project_id', 'nodes'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      if (!Array.isArray(a.nodes) || a.nodes.length === 0) return fail('nodes 不能为空');
      const t = now();
      const insertTask = db.prepare(
        `INSERT INTO tasks (project_id, work_item_id, parent_id, type, title, description, language, framework, module, dod, test_spec, acceptance_criteria, nfr, estimate, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insDep = db.prepare(
        `INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, edge_type) VALUES (?, ?, 'depends_on')`
      );
      const keyMap = new Map();
      const created = [];
      const memEdges = []; // in-memory edges (tx-safe cycle check)
      const tx = db.transaction(() => {
        for (const n of a.nodes) {
          const info = insertTask.run(
            proj.id,
            null,
            a.parent_id || null,
            n.type || 'atomic_task',
            n.title,
            n.description || null,
            n.language || null,
            n.framework || null,
            n.module || null,
            n.dod ? JSON.stringify(n.dod) : null,
            n.test_spec ? JSON.stringify(n.test_spec) : null,
            n.acceptance_criteria || null,
            n.nfr || null,
            n.estimate || null,
            t
          );
          const id = String(info.lastInsertRowid);
          keyMap.set(n.key || id, id);
          created.push({ key: n.key || id, id, title: n.title });
        }
        // resolve dependencies
        for (let i = 0; i < a.nodes.length; i++) {
          const n = a.nodes[i];
          const childId = keyMap.get(a.nodes[i].key || created[i].id);
          for (const dep of n.depends_on || []) {
            let depId = keyMap.get(dep);
            if (!depId) {
              // maybe a real existing task id
              const ex = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(dep, proj.id);
              depId = ex ? ex.id : null;
            }
            if (!depId) throw new Error(`depends_on 引用未知: ${dep}`);
            if (depId === childId) throw new Error('任务不能依赖自己');
            // cycle check: DB edges (prior calls) + in-memory edges (this call, tx-safe)
            if (wouldCreateCycle(childId, depId) || memCycle(childId, depId, memEdges)) {
              throw new Error(`依赖 ${dep} 会成环，已拒绝`);
            }
            insDep.run(childId, depId);
            memEdges.push([childId, depId]);
          }
        }
      });
      try {
        tx();
      } catch (e) {
        return fail(e.message);
      }
      audit(proj.id, a.session, 'decompose', { count: created.length });
      return ok({ created: created.map((c) => ({ id: c.id, title: c.title })), message: `已建 ${created.length} 个 DAG 节点` });
    },
  },

  {
    name: 'check_atomicity',
    description:
      '判断任务是否"原子可落地"。三条硬判据: ① 单会话可完成且无需再设计架构 ② 接口可对兄弟节点表达(有 acceptance_criteria 或 dod) ③ 有明确 DoD。有子节点则必然是 module/feature，需继续拆。',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, session: { type: 'string' } },
      required: ['task_id'],
    },
    handler: (a) => {
      const db = getDb();
      req(a.task_id, 'task_id');
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
      if (!task) return fail('任务不存在');
      const children = db.prepare('SELECT COUNT(*) c FROM tasks WHERE parent_id = ?').get(a.task_id).c;
      const reasons = [];
      if (children > 0) reasons.push('已有子节点，是 module/feature，需继续拆');
      if (!task.acceptance_criteria && !task.dod) reasons.push('缺少 acceptance_criteria / dod，验收标准不明');
      if (task.type === 'module' || task.type === 'feature') reasons.push('type 为 module/feature，非原子');
      const atomic = reasons.length === 0;
      return ok({ task_id: a.task_id, atomic, needs_split: !atomic, reasons });
    },
  },

  {
    name: 'freeze_contract',
    description:
      '冻结模块间接口契约(并行开发前必须先冻结)。spec 是接口定义(OpenAPI/TS types/proto 文本)。version 默认 1。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        provider_module: { type: 'string' },
        consumer_module: { type: 'string' },
        interface_spec: { type: 'string' },
        version: { type: 'integer', default: 1 },
        session: { type: 'string' },
      },
      required: ['project_id', 'provider_module', 'consumer_module', 'interface_spec'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const tx = db.transaction(() => {
        const t = now();
        // 检测同 (provider,consumer) 是否已有冻结契约 → 视为版本升级
        const prior = db
          .prepare('SELECT id, version FROM contracts WHERE project_id = ? AND provider_module = ? AND consumer_module = ? ORDER BY version DESC LIMIT 1')
          .get(proj.id, a.provider_module, a.consumer_module);
        const info = db
          .prepare(
            `INSERT INTO contracts (project_id, provider_module, consumer_module, interface_spec, version, status, frozen_at)
             VALUES (?, ?, ?, ?, ?, 'frozen', ?)`
          )
          .run(proj.id, a.provider_module, a.consumer_module, a.interface_spec, a.version || 1, t);
        const newId = info.lastInsertRowid;
        const blocked = [];
        if (prior) {
          // 升版 → 阻塞 provider 与 consumer 两侧仍在途(in_progress/review)的任务, 防止对着旧契约写
          const affected = db
            .prepare("SELECT id FROM tasks WHERE project_id = ? AND module IN (?, ?) AND status IN ('in_progress','review')")
            .all(proj.id, a.provider_module, a.consumer_module);
          const insBlock = db.prepare('INSERT INTO blocks (task_id, reason, blocked_by, workaround, created_at) VALUES (?, ?, ?, ?, ?)');
          for (const tk of affected) {
            insBlock.run(
              tk.id,
              `契约 ${a.provider_module}→${a.consumer_module} 升到 v${a.version || 1}（原 v${prior.version} 失效），请对齐新契约后调 unblock_task`,
              `contract:${newId}`,
              '重新读取 get_contracts 对齐新 spec',
              t
            );
            db.prepare("UPDATE tasks SET status = 'blocked' WHERE id = ?").run(tk.id);
            blocked.push(Number(tk.id));
          }
        }
        return { newId, prior, blocked };
      });
      let r;
      try {
        r = tx();
      } catch (e) {
        return fail(e.message);
      }
      audit(proj.id, a.session, 'freeze_contract', {
        provider: a.provider_module,
        consumer: a.consumer_module,
        version_bump: !!r.prior,
        blocked: r.blocked,
      });
      return ok({
        contract_id: r.newId,
        version_bump: !!r.prior,
        blocked_tasks: r.blocked,
        message: r.prior
          ? `契约已升版冻结 v${a.version || 1}，已阻塞 ${r.blocked.length} 个在途任务（provider+consumer 两侧）`
          : `契约已冻结: ${a.provider_module} → ${a.consumer_module}`,
      });
    },
  },

  {
    name: 'get_contracts',
    description:
      '只读查询冻结契约(跨会话真相源)。任意 session 可随时按 module 拉取其应遵守/应提供的全部 frozen 契约，完全不打扰任务状态。role=consumer 查"我依赖谁提供的接口"，role=provider 查"谁依赖我提供的接口"，省略 role 则返回两者。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        module: { type: 'string', description: '模块名(须与 decompose 的 module 字段一致)' },
        role: { type: 'string', enum: ['consumer', 'provider', 'both'] },
        session: { type: 'string' },
      },
      required: ['project_id', 'module'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const role = a.role || 'both';
      let rows;
      if (role === 'consumer') {
        rows = db
          .prepare(
            `SELECT id, provider_module, consumer_module, interface_spec, version, status, frozen_at
             FROM contracts WHERE project_id = ? AND consumer_module = ? AND status = 'frozen'
             ORDER BY provider_module, version`
          )
          .all(proj.id, a.module);
      } else if (role === 'provider') {
        rows = db
          .prepare(
            `SELECT id, provider_module, consumer_module, interface_spec, version, status, frozen_at
             FROM contracts WHERE project_id = ? AND provider_module = ? AND status = 'frozen'
             ORDER BY consumer_module, version`
          )
          .all(proj.id, a.module);
      } else {
        rows = db
          .prepare(
            `SELECT id, provider_module, consumer_module, interface_spec, version, status, frozen_at
             FROM contracts WHERE project_id = ? AND (provider_module = ? OR consumer_module = ?) AND status = 'frozen'
             ORDER BY provider_module, consumer_module, version`
          )
          .all(proj.id, a.module, a.module);
      }
      return ok({ module: a.module, role, count: rows.length, contracts: rows });
    },
  },

  {
    name: 'get_dag',
    description: '返回完整任务图(节点 + 依赖边)，用于可视化与依赖分析。',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' }, session: { type: 'string' } },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const nodes = db.prepare('SELECT id, parent_id, type, title, status, module, language, owner_session FROM tasks WHERE project_id = ?').all(proj.id);
      const edges = db
        .prepare('SELECT task_id, depends_on_task_id, edge_type FROM task_dependencies')
        .all()
        .filter((e) => nodes.some((n) => n.id === e.task_id));
      // 每个节点附带其所属/遵守的 frozen 契约摘要, 省得再单独调 get_contracts
      const frozen = db
        .prepare("SELECT id, provider_module, consumer_module, version FROM contracts WHERE project_id = ? AND status = 'frozen'")
        .all(proj.id);
      const nodesEnriched = nodes.map((n) => ({
        ...n,
        contracts: frozen
          .filter((c) => c.provider_module === n.module || c.consumer_module === n.module)
          .map((c) => ({ id: c.id, provider_module: c.provider_module, consumer_module: c.consumer_module, version: c.version })),
      }));
      return ok({ nodes: nodesEnriched, edges });
    },
  },
];
