// tools/project.js — project + phase management
import { getDb, resolveProject, audit, touchProject, now, uuid } from '../db.js';
import { ok, fail, req, PHASE_ORDER } from './util.js';
import { TIER_REQUIRED, DIMENSION_LABELS } from './nfr.js';

const phases = [
  'phase_0',
  'phase_0_5',
  'phase_1',
  'phase_2',
  'phase_3',
  'phase_4',
];

export default [
  {
    name: 'init_project',
    description:
      '新建一个被本系统管理的项目：建项目行 + 初始化 6 阶段(phase_0 为 active) + 写规范骨架占位。root_path 必须唯一。这是任何流程的起点。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        root_path: { type: 'string', description: '项目工作区绝对路径' },
        project_type: {
          type: 'string',
          enum: ['greenfield', 'existing_clean', 'existing_legacy', 'existing_active'],
          default: 'greenfield',
        },
        maturity: { type: 'string', enum: ['mvp', 'commercial', 'enterprise'], default: 'mvp' },
        session: { type: 'string' },
      },
      required: ['name', 'root_path'],
    },
    handler: (a) => {
      const db = getDb();
      req(a.name, 'name');
      req(a.root_path, 'root_path');
      const existing = db
        .prepare('SELECT id FROM projects WHERE root_path = ?')
        .get(a.root_path);
      if (existing) return fail(`项目已存在于该 root_path: ${existing.id}`);
      const id = uuid();
      const t = now();
      db.prepare(
        `INSERT INTO projects (id, name, root_path, project_type, maturity, current_phase, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'phase_0', ?, ?)`
      ).run(
        id,
        a.name,
        a.root_path,
        a.project_type || 'greenfield',
        a.maturity || 'mvp',
        t,
        t
      );
      const insPhase = db.prepare(
        `INSERT INTO phases (project_id, phase_key, status, started_at)
         VALUES (?, ?, ?, ?)`
      );
      insPhase.run(id, 'phase_0', 'active', t);
      for (const p of phases.slice(1)) {
        db.prepare(
          `INSERT INTO phases (project_id, phase_key, status) VALUES (?, ?, 'pending')`
        ).run(id, p);
      }
      audit(id, a.session, 'init_project', { name: a.name, type: a.project_type });
      return ok({ project_id: id, message: '项目已初始化，当前 phase_0 (需求与初始方案)。下一步: 调 to-spec + prd-prompt 生成 PRD。' });
    },
  },

  {
    name: 'get_state',
    description:
      '返回项目当前阶段、各阶段门控状态、任务按状态计数、进行中任务、阻塞项。续跑前先调它。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '项目 id 或 root_path' },
      },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const phs = db.prepare('SELECT phase_key, status, gate_passed FROM phases WHERE project_id = ? ORDER BY phase_key').all(proj.id);
      const counts = db
        .prepare(
          `SELECT status, COUNT(*) c FROM tasks WHERE project_id = ? GROUP BY status`
        )
        .all(proj.id);
      const inProgress = db
        .prepare(`SELECT id, title, module, language, owner_session FROM tasks WHERE project_id = ? AND status = 'in_progress'`)
        .all(proj.id);
      const blocks = db
        .prepare(`SELECT t.id, t.title, b.reason, b.blocked_by FROM blocks b JOIN tasks t ON t.id=b.task_id WHERE t.project_id = ? AND b.resolved_at IS NULL`)
        .all(proj.id);
      return ok({
        project_id: proj.id,
        name: proj.name,
        project_type: proj.project_type,
        maturity: proj.maturity,
        current_phase: proj.current_phase,
        identity_confirmed: proj.identity_confirmed,
        pending_advance_to: proj.pending_advance_to,
        phases: phs,
        task_counts: counts,
        in_progress: inProgress,
        blocks,
      });
    },
  },

  // ── list_projects ──
  {
    name: 'list_projects',
    description:
      '列出 lifecycle.db 中所有项目(只读)。返回 id/name/root_path/project_type/maturity/current_phase/identity_confirmed/updated_at。新会话说"继续"但存在多个并行项目时,先调它枚举,再用 AskUserQuestion 让用户选要续哪个,然后 get_state(project_id)。',
    inputSchema: {
      type: 'object',
      properties: {
        only_active: { type: 'boolean', description: 'true=只返回未删除且仍在进行中的项目(排除已到 phase_4 完成的);默认 false 返回全部' },
      },
    },
    handler: (a) => {
      const db = getDb();
      const where = a.only_active ? `WHERE current_phase <> 'phase_4'` : '';
      const rows = db
        .prepare(
          `SELECT id, name, root_path, project_type, maturity, current_phase, identity_confirmed, updated_at
           FROM projects ${where} ORDER BY updated_at DESC`
        )
        .all();
      return ok({ count: rows.length, projects: rows });
    },
  },

  {
    name: 'advance_phase',
    description:
      '推进阶段——【两步提交 + 硬门控】。① 目标必须是当前阶段的下一个；② 前一阶段 gate_passed=1（grilling 锁定）；③ 目标是 phase_1 时 identity_confirmed 必须=1（先 0.5.4 rename_project 或 confirm_identity）。'
      + '\n★强制停车★：默认(不带 confirmed_by_user)只做校验并置 pending，【不推进】，返回“停下等用户确认”指令。你必须结束本轮、向用户汇报本阶段成果、AskUserQuestion 问是否进入下一阶段；用户明确说继续后，才带 confirmed_by_user=true + user_ack=<用户原话> 再调一次真正推进。严禁在同一轮内自己 confirm 冲过去。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        target_phase: { type: 'string', enum: phases },
        confirmed_by_user: { type: 'boolean', description: '第二步：用户已明确说继续，方可置 true 真正推进。首轮禁止置 true。' },
        user_ack: { type: 'string', description: '第二步必填：用户明确同意进入下一阶段的原话（审计证据）。' },
        session: { type: 'string' },
      },
      required: ['project_id', 'target_phase'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const cur = PHASE_ORDER.indexOf(proj.current_phase);
      const tgt = PHASE_ORDER.indexOf(a.target_phase);
      if (tgt !== cur + 1) return fail(`只能推进到下一阶段 (当前 ${proj.current_phase}, 目标必须 ${PHASE_ORDER[cur + 1] || '无'})`);
      const prevPhase = db.prepare('SELECT gate_passed FROM phases WHERE project_id = ? AND phase_key = ?').get(proj.id, PHASE_ORDER[cur]);
      if (!prevPhase || prevPhase.gate_passed !== 1) {
        return fail(`阶段门控未通过(${PHASE_ORDER[cur]} gate_passed=0)。必须 pass_gate 后方可推进。对于 phase_0_5 即 grilling 锁定。`);
      }
      // ── Gate A: 身份硬卡（0.5 → 1）──
      if (a.target_phase === 'phase_1' && proj.identity_confirmed !== 1) {
        return fail('身份未确认(identity_confirmed=0)：进入 Phase 1 前必须完成 0.5.4——用 AskUserQuestion 让用户选定/确认项目名与目录，然后调 rename_project(改名) 或 confirm_identity(不改)。此卡在 server 端写死，绕不过去。');
      }
      // ── Gate B: 两步提交，强制停车（每个阶段完成后都必须停）──
      if (!a.confirmed_by_user) {
        db.prepare('UPDATE projects SET pending_advance_to = ?, updated_at = ? WHERE id = ?').run(a.target_phase, now(), proj.id);
        audit(proj.id, a.session, 'advance_phase_pending', { to: a.target_phase });
        return ok({
          stopped: true,
          advanced: false,
          pending_advance_to: a.target_phase,
          message: `✋ 停车：${PHASE_ORDER[cur]} 门控已过，但按纪律【不能自己往前冲】。请立刻结束本轮：①向用户汇报 ${PHASE_ORDER[cur]} 的成果 ②用 AskUserQuestion 问“是否进入 ${a.target_phase}”。用户明确说继续后，再调一次 advance_phase(target_phase='${a.target_phase}', confirmed_by_user=true, user_ack='<用户原话>')。`,
        });
      }
      // 第二步：必须先经历过第一步(pending 已置)，且带上用户原话
      req(a.user_ack, 'user_ack（用户明确同意的原话）');
      if (proj.pending_advance_to !== a.target_phase) {
        return fail(`未经停车确认：请先不带 confirmed_by_user 调一次 advance_phase 触发停车，向用户确认后再 confirm。当前 pending_advance_to=${proj.pending_advance_to || 'null'}。`);
      }
      db.prepare('UPDATE phases SET status = ?, completed_at = ? WHERE project_id = ? AND phase_key = ?').run('done', now(), proj.id, PHASE_ORDER[cur]);
      db.prepare('UPDATE phases SET status = ?, started_at = ? WHERE project_id = ? AND phase_key = ?').run('active', now(), proj.id, a.target_phase);
      db.prepare('UPDATE projects SET current_phase = ?, pending_advance_to = NULL, updated_at = ? WHERE id = ?').run(a.target_phase, now(), proj.id);
      audit(proj.id, a.session, 'advance_phase', { to: a.target_phase, user_ack: a.user_ack });
      return ok({ advanced: true, current_phase: a.target_phase, message: `已推进到 ${a.target_phase}（用户确认: ${a.user_ack}）` });
    },
  },

  {
    name: 'confirm_identity',
    description:
      '确认项目身份(name/root_path 不变即可用此工具，无需改名)，置 identity_confirmed=1，解锁 advance_phase→phase_1。对应 0.5.4 中“用户确认身份不变”的分支。若需改名请改用 rename_project(它也会置 1)。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '项目 id 或 root_path' },
        session: { type: 'string' },
      },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail(`项目不存在: ${a.project_id}`);
      db.prepare('UPDATE projects SET identity_confirmed = 1, updated_at = ? WHERE id = ?').run(now(), proj.id);
      audit(proj.id, a.session, 'confirm_identity', { name: proj.name, root_path: proj.root_path });
      return ok({ project_id: proj.id, identity_confirmed: true, message: `身份已确认(${proj.name} @ ${proj.root_path})，可推进到 Phase 1。` });
    },
  },

  {
    name: 'pass_gate',
    description:
      '标记某阶段门控通过(如 grilling 锁定)。需 evidence(用户明确锁定信号)。未通过前 advance_phase 会被拒。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        phase_key: { type: 'string', enum: phases },
        evidence: { type: 'string', description: '用户锁定方案的证据/信号' },
        session: { type: 'string' },
      },
      required: ['project_id', 'phase_key', 'evidence'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      req(a.evidence, 'evidence');
      // Enterprise-grade NFR completeness gate (only on the grilling gate).
      if (a.phase_key === 'phase_0_5') {
        const required = TIER_REQUIRED[proj.maturity] || TIER_REQUIRED.mvp;
        if (required.length > 0) {
          const rows = db
            .prepare('SELECT dimension, covered FROM nfr_coverage WHERE project_id = ?')
            .all(proj.id);
          const coveredSet = new Set(rows.filter((r) => r.covered === 1).map((r) => r.dimension));
          const missing = required.filter((d) => !coveredSet.has(d));
          if (missing.length > 0) {
            const names = missing
              .map((d) => `${d}(${(DIMENSION_LABELS[d] || { label: d }).label})`)
              .join(', ');
            return fail(
              `企业级 NFR 完整度未达标(${proj.maturity}): 缺失维度 [${names}]。请先用 get_nfr_checklist 看清单、set_nfr_coverage 逐项覆盖(在 PRD/技术方案中落实)后再 pass_gate。`
            );
          }
        }
      }
      db.prepare('UPDATE phases SET gate_passed = 1 WHERE project_id = ? AND phase_key = ?').run(proj.id, a.phase_key);
      audit(proj.id, a.session, 'pass_gate', { phase: a.phase_key });
      return ok({ phase_key: a.phase_key, gate_passed: true, message: '门控通过。可 advance_phase。' });
    },
  },

  {
    name: 'set_stack',
    description:
      '冻结技术栈选型(JSON)。仅 phase_0 / phase_0_5 可写。写入后进入 Phase 1 前不可随意改。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        stack_json: { type: 'string', description: 'JSON 字符串: 语言/框架/中间件/部署栈' },
        session: { type: 'string' },
      },
      required: ['project_id', 'stack_json'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      if (!['phase_0', 'phase_0_5'].includes(proj.current_phase)) {
        return fail(`set_stack 仅允许在 phase_0 / phase_0_5 写入 (当前 ${proj.current_phase})`);
      }
      db.prepare('UPDATE projects SET stack = ?, updated_at = ? WHERE id = ?').run(a.stack_json, now(), proj.id);
      audit(proj.id, a.session, 'set_stack', {});
      return ok({ message: '技术栈已冻结' });
    },
  },

  {
    name: 'bootstrap_existing',
    description:
      '为已有代码库项目初始化(子模式 existing_clean/legacy/active)。可选传入 seed_conventions(JSON 数组) 由现有配置(lint/format)抽取的初始规范。existing_legacy 模式请先决定"尊重 or 重构"并记入 decisions。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        root_path: { type: 'string' },
        project_type: { type: 'string', enum: ['existing_clean', 'existing_legacy', 'existing_active'], default: 'existing_active' },
        maturity: { type: 'string', enum: ['mvp', 'commercial', 'enterprise'], default: 'commercial' },
        respect_or_refactor: { type: 'string', enum: ['respect', 'refactor', 'pending'], description: 'existing_legacy 必填' },
        seed_conventions: { type: 'string', description: 'JSON 数组: 从现有配置抽取的 conventions 行' },
        session: { type: 'string' },
      },
      required: ['name', 'root_path'],
    },
    handler: (a) => {
      const db = getDb();
      req(a.name, 'name');
      req(a.root_path, 'root_path');
      if (a.project_type === 'existing_legacy' && !a.respect_or_refactor) {
        return fail('existing_legacy 必须明确 respect_or_refactor (respect|refactor|pending)');
      }
      const r = JSON.parse(
        JSON.stringify({
          id: uuid(),
          name: a.name,
          root_path: a.root_path,
          project_type: a.project_type,
          maturity: a.maturity,
        })
      );
      const t = now();
      db.prepare(
        `INSERT INTO projects (id, name, root_path, project_type, maturity, current_phase, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'phase_0', ?, ?)`
      ).run(r.id, r.name, r.root_path, r.project_type, r.maturity, t, t);
      const insPhase = db.prepare(`INSERT INTO phases (project_id, phase_key, status, started_at) VALUES (?, ?, ?, ?)`);
      insPhase.run(r.id, 'phase_0', 'active', t);
      for (const p of phases.slice(1)) {
        db.prepare(`INSERT INTO phases (project_id, phase_key, status) VALUES (?, ?, 'pending')`).run(r.id, p);
      }
      if (a.seed_conventions) {
        const seeds = JSON.parse(a.seed_conventions);
        const ins = db.prepare(
          `INSERT INTO conventions (project_id, language, framework, module, formatter, linter, test_framework, coverage_threshold, quality_rules, max_file_lines, max_function_lines, max_params, max_nesting, is_default_heuristic, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
        );
        for (const s of seeds) {
          ins.run(r.id, s.language, s.framework || null, s.module || null, s.formatter || null, s.linter || null, s.test_framework || null, s.coverage_threshold || 80, JSON.stringify(s.quality_rules || {}), s.max_file_lines || 300, s.max_function_lines || 40, s.max_params || 4, s.max_nesting || 4, t);
        }
      }
      audit(r.id, a.session, 'bootstrap_existing', { type: a.project_type });
      return ok({ project_id: r.id, message: '已有项目已初始化。建议先 codebase-design 读现状再走 Phase 0.5 grilling。' });
    },
  },

  // ── rename_project ──
  {
    name: 'rename_project',
    description:
      '修改项目名称和/或 root_path（户籍地址）。适用于：阶段0用临时名占位、方案定稿后改正式名。root_path 改后需确保物理目录已存在或后续手动创建。⚠️ 不改 WorkBuddy task 的 workspace 指针——改名后如需切换 workspace 需新开 task 并用 get_state(id) 续跑。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '项目 id 或当前 root_path' },
        new_name: { type: 'string', description: '新的项目名称（不传则不改）' },
        new_root_path: { type: 'string', description: '新的 root_path 绝对路径（不传则不改）' },
        session: { type: 'string' },
      },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail(`项目不存在: ${a.project_id}`);
      req(a.new_name || a.new_root_path, '至少提供 new_name 或 new_root_path 其中之一');
      const updates = [];
      const values = [];
      if (a.new_name) {
        updates.push('name = ?');
        values.push(a.new_name);
      }
      if (a.new_root_path) {
        const conflict = db.prepare('SELECT id FROM projects WHERE root_path = ? AND id != ?').get(a.new_root_path, proj.id);
        if (conflict) return fail(`root_path 已被其他项目占用: ${a.new_root_path} (项目 ${conflict.id})`);
        updates.push('root_path = ?');
        values.push(a.new_root_path);
      }
      // 改名/确认目录本身即视为“身份已确认”，解锁 advance_phase→phase_1
      updates.push('identity_confirmed = 1');
      db.prepare(`UPDATE projects SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now(), proj.id);
      audit(proj.id, a.session, 'rename_project', { old_name: proj.name, new_name: a.new_name || null, old_path: proj.root_path, new_path: a.new_root_path || null });
      return ok({ project_id: proj.id, name: a.new_name || proj.name, root_path: a.new_root_path || proj.root_path, message: '项目已重命名/迁移。若改了 root_path，请确保新目录已创建并更新 WorkBuddy workspace 指向（需新开 task + get_state 续跑）。' });
    },
  },

  {
    name: 'reset_project',
    description:
      '保留项目身份(name/root_path)，清空全部进度回到 Phase 0 重新开始：删除 work_items/tasks/依赖/契约/规范/决策/阻塞/记忆/事件/文件锁/审批/成本，重建 6 阶段(phase_0=active, 其余 pending)，清空 current_phase 与已冻结 stack。适用于「走歪了想重来，但保留身份」。⚠️ 破坏性，调用前应 AskUserQuestion 向用户确认。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '项目 id 或 root_path' },
        session: { type: 'string' },
      },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail(`项目不存在: ${a.project_id}`);
      const tx = db.transaction(() => {
        // 清空所有子表（projects 行保留）
        // 注: task_dependencies / blocks 无 project_id 列, 靠 tasks 的 ON DELETE CASCADE 自动清理, 不在此手动删
        for (const t of ['work_items', 'tasks', 'contracts', 'conventions', 'decisions', 'memory', 'events', 'file_locks', 'approvals', 'cost_ledger', 'nfr_coverage']) {
          db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).run(proj.id);
        }
        // 重建 6 阶段
        db.prepare(`DELETE FROM phases WHERE project_id = ?`).run(proj.id);
        const t = now();
        db.prepare(`INSERT INTO phases (project_id, phase_key, status, started_at) VALUES (?, 'phase_0', 'active', ?)`).run(proj.id, t);
        for (const p of phases.slice(1)) {
          db.prepare(`INSERT INTO phases (project_id, phase_key, status) VALUES (?, ?, 'pending')`).run(proj.id, p);
        }
        db.prepare(`UPDATE projects SET current_phase = 'phase_0', stack = NULL, identity_confirmed = 0, pending_advance_to = NULL, updated_at = ? WHERE id = ?`).run(t, proj.id);
      });
      tx();
      audit(proj.id, a.session, 'reset_project', { name: proj.name });
      return ok({ project_id: proj.id, name: proj.name, current_phase: 'phase_0', message: '项目已重置到 Phase 0，全部进度清空，身份(name/root_path)保留。可重新走 Phase 0 → 0.5 → 0.5.4(确认/改名) → 1。' });
    },
  },

  {
    name: 'delete_project',
    description:
      '彻底删除整个项目（含所有子表，靠 ON DELETE CASCADE）。释放 root_path 唯一约束，之后可用同 root_path 重新 init_project。适用于「彻底不要这个项目了 / 想连身份一起换」。⚠️ 不可恢复，调用前必须 AskUserQuestion 向用户确认。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '项目 id 或 root_path' },
        session: { type: 'string' },
      },
      required: ['project_id'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail(`项目不存在: ${a.project_id}`);
      const rootPath = proj.root_path;
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(proj.id); // cascade 清空子表
      return ok({ deleted: true, former_root_path: rootPath, message: '项目已彻底删除，root_path 已释放。如需重建可直接 init_project 同 root_path。' });
    },
  },
];
