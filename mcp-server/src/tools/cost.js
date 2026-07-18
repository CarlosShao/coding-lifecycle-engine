// tools/cost.js — cost ledger + model routing
import { getDb, resolveProject, audit, now } from '../db.js';
import { ok, fail, req } from './util.js';

const MODEL_MATRIX = {
  phase_0_5: 'strong', // grilling 推理重
  phase_3: 'strong',   // adversarial review
  phase_4: 'strong',   // pre-mortem
  grilling: 'strong',
  adversarial: 'strong',
  pre_mortem: 'strong',
  phase_2: 'cheap',    // implement/tdd 量大
  implement: 'cheap',
  tdd: 'cheap',
  default: 'cheap',
};

export default [
  {
    name: 'record_cost',
    description: '写入成本台账(token/费用)。超项目预算阈值触发告警(不阻断)。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        task_id: { type: 'string' },
        session: { type: 'string' },
        model: { type: 'string' },
        tokens_in: { type: 'integer' },
        tokens_out: { type: 'integer' },
        cost_usd: { type: 'number' },
        budget_usd: { type: 'number', description: '本项目预算阈值, 默认 50' },
      },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      db.prepare('INSERT INTO cost_ledger (project_id, task_id, session, model, tokens_in, tokens_out, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        proj.id, a.task_id || null, a.session || null, a.model || null, a.tokens_in || 0, a.tokens_out || 0, a.cost_usd || 0, now()
      );
      const total = db.prepare('SELECT COALESCE(SUM(cost_usd),0) t FROM cost_ledger WHERE project_id = ?').get(proj.id).t;
      const budget = a.budget_usd ?? 50;
      audit(proj.id, a.session, 'record_cost', { cost: a.cost_usd || 0 });
      return ok({ total_usd: total, budget_usd: budget, over_budget: total > budget, message: total > budget ? '⚠️ 已超预算阈值' : '成本正常' });
    },
  },
  {
    name: 'get_cost',
    description: '查询项目成本台账(总计 + 按任务)。',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' } }, required: ['project_id'] },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const total = db.prepare('SELECT COALESCE(SUM(cost_usd),0) t, COALESCE(SUM(tokens_in),0) ti, COALESCE(SUM(tokens_out),0) to FROM cost_ledger WHERE project_id = ?').get(proj.id);
      const byTask = db.prepare('SELECT task_id, SUM(cost_usd) c, SUM(tokens_in) ti, SUM(tokens_out) to FROM cost_ledger WHERE project_id = ? GROUP BY task_id').all(proj.id);
      return ok({ total_usd: total.t, total_tokens_in: total.ti, total_tokens_out: total.to, by_task: byTask });
    },
  },
  {
    name: 'route_model',
    description: '返回推荐模型档位(strong/cheap)。grilling/adversarial/pre-mortem 用 strong; implement/tdd 用 cheap。避免全程最强模型烧钱。',
    inputSchema: {
      type: 'object',
      properties: { phase: { type: 'string', description: 'phase_0_5|phase_2|phase_3|phase_4 或 grilling/adversarial/pre_mortem/implement/tdd' } },
      required: ['phase'],
    },
    handler: (a) => {
      const tier = MODEL_MATRIX[a.phase] || MODEL_MATRIX.default;
      return ok({ phase: a.phase, recommended_tier: tier, note: tier === 'strong' ? '推理重/验收严，用强模型' : '量大，用便宜模型' });
    },
  },
];
