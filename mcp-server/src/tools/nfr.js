// nfr.js — Enterprise-grade NFR dimension completeness.
// The plan must explicitly cover non-functional dimensions scaled by project maturity.
// mvp  : advisory-only (gate not enforced)
// commercial / enterprise : pass_gate(phase_0_5) hard-fails if any required dim uncovered.
import { getDb, resolveProject, now, audit } from '../db.js';
import { ok, fail, req } from './util.js';

// ---- Dimension catalogue (stable keys) ----
// label = human-readable CN name; ref = the reference file that defines the bar.
export const DIMENSION_LABELS = {
  // base — expected of every project that ships
  backup: { label: '备份策略', ref: 'backup-strategy.md' },
  logging: { label: '日志规范(密钥不打日志)', ref: 'logging-standards.md' },
  secrets: { label: '密钥管理(env-config 铁律)', ref: 'env-config.md' },
  error_handling: { label: '错误处理模式', ref: 'error-handling-patterns.md' },
  // commercial adds
  security_scan: { label: '安全扫描 SAST/DAST/WAF', ref: 'security-baseline.md' },
  cicd: { label: 'CI/CD 流水线', ref: 'ci-pipeline-template.md' },
  feature_flags: { label: '功能开关/金丝雀', ref: 'feature-flags.md' },
  testing_pyramid: { label: '测试金字塔(集成/E2E)', ref: 'testing-requirements.md' },
  observability_basic: { label: '可观测性 Prometheus/APM', ref: 'observability-minimal.md' },
  // enterprise adds
  compliance: { label: '合规范围(SOC2/GDPR)', ref: 'security-baseline.md' },
  data_residency: { label: '数据驻留', ref: 'data-modeling-guide.md' },
  multi_region_dr: { label: '多区域灾备(RTO/RPO/演练)', ref: 'backup-strategy.md' },
  audit_trail: { label: '审计追踪', ref: 'security-baseline.md' },
  incident_response: { label: '事件响应计划(IR)', ref: 'security-baseline.md' },
  cost_ceiling: { label: '成本上限', ref: 'cost-model.md' },
  sla_slo: { label: 'SLO/on-call/runbook', ref: 'observability-minimal.md' },
  multi_tenancy: { label: '多租户隔离', ref: 'data-modeling-guide.md' },
  accessibility: { label: '可访问性(WCAG)', ref: 'accessibility-i18n.md' },
  perf_budget: { label: '性能预算', ref: 'performance-budget.md' },
  strict_approval: { label: '严格发布门禁', ref: 'human-approval-model.md' },
};

const BASE = ['backup', 'logging', 'secrets', 'error_handling'];
const COMMERCIAL_ADDS = [
  'security_scan',
  'cicd',
  'feature_flags',
  'testing_pyramid',
  'observability_basic',
];
const ENTERPRISE_ADDS = [
  'compliance',
  'data_residency',
  'multi_region_dr',
  'audit_trail',
  'incident_response',
  'cost_ceiling',
  'sla_slo',
  'multi_tenancy',
  'accessibility',
  'perf_budget',
  'strict_approval',
];

// Required dimension keys per maturity tier. mvp = [] => gate not enforced.
export const TIER_REQUIRED = {
  mvp: [],
  commercial: [...BASE, ...COMMERCIAL_ADDS],
  enterprise: [...BASE, ...COMMERCIAL_ADDS, ...ENTERPRISE_ADDS],
};

function requiredFor(maturity) {
  return TIER_REQUIRED[maturity] || TIER_REQUIRED.mvp;
}

const nfrTool = {
  name: 'get_nfr_checklist',
  description:
    '按项目 maturity 返回规划期必须覆盖的 NFR 维度清单 + 当前已覆盖/缺失状态。mvp 仅建议展示；commercial/enterprise 会被 pass_gate(phase_0_5) 强制校验。每个维度附带对应 reference 文件指针，供 AI 注入规划对话。',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
    },
    required: ['project_id'],
  },
  handler: (a) => {
    const db = getDb();
    const proj = resolveProject(a.project_id);
    if (!proj) return fail('项目不存在');
    const required = requiredFor(proj.maturity);
    const rows = db
      .prepare('SELECT dimension, covered, notes FROM nfr_coverage WHERE project_id = ?')
      .all(proj.id);
    const coveredMap = new Map(rows.map((r) => [r.dimension, r]));
    const items = required.map((dim) => ({
      key: dim,
      label: (DIMENSION_LABELS[dim] || { label: dim }).label,
      ref: (DIMENSION_LABELS[dim] || {}).ref || null,
      covered: (coveredMap.get(dim)?.covered ?? 0) === 1,
      notes: coveredMap.get(dim)?.notes || null,
    }));
    const missing = items.filter((i) => !i.covered).map((i) => i.key);
    return ok({
      maturity: proj.maturity,
      enforced: required.length > 0,
      required_count: required.length,
      items,
      missing,
      all_covered: missing.length === 0,
    });
  },
};

const setNfrTool = {
  name: 'set_nfr_coverage',
  description:
    '标记某 NFR 维度是否已在 PRD/技术方案中覆盖(upsert)。用于 Phase 0 填企业级 NFR 清单；commercial/enterprise 必须全部 covered 才能 pass_gate(phase_0_5)。',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      dimension: { type: 'string', enum: Object.keys(DIMENSION_LABELS) },
      covered: { type: 'boolean', default: true },
      notes: { type: 'string', description: '该维度在方案中的落点(章节/决策)' },
      session: { type: 'string' },
    },
    required: ['project_id', 'dimension'],
  },
  handler: (a) => {
    const db = getDb();
    const proj = resolveProject(a.project_id);
    if (!proj) return fail('项目不存在');
    req(a.dimension, 'dimension');
    if (!DIMENSION_LABELS[a.dimension]) return fail(`未知维度: ${a.dimension}`);
    const covered = a.covered === false ? 0 : 1;
    db.prepare(
      `INSERT INTO nfr_coverage (project_id, dimension, covered, notes, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, dimension)
       DO UPDATE SET covered = excluded.covered, notes = excluded.notes, updated_at = excluded.updated_at`
    ).run(proj.id, a.dimension, covered, a.notes || null, now());
    audit(proj.id, a.session, 'set_nfr_coverage', { dimension: a.dimension, covered });
    return ok({ dimension: a.dimension, covered: !!covered, message: `NFR 维度 ${a.dimension} 已标记 covered=${!!covered}` });
  },
};

export default [nfrTool, setNfrTool];
