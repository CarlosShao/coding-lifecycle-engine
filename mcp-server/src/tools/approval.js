// tools/approval.js — human sign-off gates
import { getDb, resolveProject, audit, now } from '../db.js';
import { ok, fail, req } from './util.js';

export default [
  {
    name: 'request_approval',
    description: '请求人类签核门控: stack_approval(栈选型) | architecture_approval(架构/契约) | release_signoff(可发布) | ticket_review(单票完成)。写入 approvals, 状态 pending。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        gate: { type: 'string', enum: ['stack_approval', 'architecture_approval', 'release_signoff', 'ticket_review'] },
        target_id: { type: 'string', description: 'task_id 或 project_id' },
        session: { type: 'string' },
      },
      required: ['project_id', 'gate'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const info = db.prepare('INSERT INTO approvals (project_id, gate, target_id, state) VALUES (?, ?, ?, ?)').run(proj.id, a.gate, a.target_id || null, 'pending');
      audit(proj.id, a.session, 'request_approval', { gate: a.gate });
      return ok({ approval_id: info.lastInsertRowid, state: 'pending', message: `已请求 ${a.gate} 签核，等待人类批准。` });
    },
  },

  {
    name: 'record_approval',
    description: '记录签核结果: approved | rejected。未 approved 时对应 advance/handoff 应被拒(SKILL 负责检查)。',
    inputSchema: {
      type: 'object',
      properties: {
        approval_id: { type: 'integer' },
        gate: { type: 'string', enum: ['stack_approval', 'architecture_approval', 'release_signoff', 'ticket_review'] },
        target_id: { type: 'string' },
        state: { type: 'string', enum: ['approved', 'rejected'] },
        approver: { type: 'string' },
        note: { type: 'string' },
        session: { type: 'string' },
      },
      required: ['state'],
    },
    handler: (a) => {
      const db = getDb();
      let row = null;
      if (a.approval_id) {
        row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(a.approval_id);
      } else if (a.gate) {
        row = db.prepare('SELECT * FROM approvals WHERE gate = ? AND (target_id = ? OR (target_id IS NULL)) ORDER BY id DESC LIMIT 1').get(a.gate, a.target_id || null);
      }
      if (!row) return fail('未找到对应 approval 记录');
      db.prepare('UPDATE approvals SET state = ?, approver = ?, decided_at = ?, note = ? WHERE id = ?').run(a.state, a.approver || null, now(), a.note || null, row.id);
      audit(row.project_id, a.session, 'record_approval', { gate: row.gate, state: a.state });
      return ok({ approval_id: row.id, gate: row.gate, state: a.state });
    },
  },
];
