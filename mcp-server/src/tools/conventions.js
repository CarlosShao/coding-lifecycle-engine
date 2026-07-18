// tools/conventions.js — conventions, quality rules, checklists (layered injection source)
import { getDb, resolveProject } from '../db.js';
import { ok, fail, req } from './util.js';

// Embedded defaults (mirror §9). DB overrides take precedence.
const QUALITY_RULES = {
  rust: {
    R1: '单文件 ≤ 300 行', R2: '单函数 ≤ 40 行(soft)/60 硬', R3: '禁裸 unwrap/expect(测试除外)',
    R4: '错误用 thiserror/anyhow 定义类型', R5: 'pub 项必须 doc comment', R6: '模块清晰分层 src/auth/ src/db/',
    R7: '禁 unsafe(除非注释论证)', R8: '优先借用而非 clone',
  },
  typescript: {
    T1: '单文件 ≤ 250 行', T2: '禁 any', T3: '函数参数 ≤ 4', T4: '嵌套 ≤ 4 层', T5: 'async 必须 try-catch 或 .catch',
    T6: '组件单一职责', T7: '禁 as 强转(除非 unknown 收窄)', T8: 'strict 模式全开', T9: '禁 console.log 进生产',
  },
  python: {
    P1: '单文件 ≤ 400 行', P2: '全量 type hints', P3: '禁裸 except:', P4: '函数 ≤ 50 行',
    P5: '用 dataclass/pydantic 而非裸 dict', P6: '禁可变默认参数', P7: 'docstring 公共函数/类',
  },
  go: {
    Go1: '单文件 ≤ 500 行', Go2: '错误必须处理, 禁 _ = 吞错', Go3: '错误包装用 %w', Go4: '禁 panic 于库代码',
    Go5: '导出标识符必须注释', Go6: 'context 作首参传递',
  },
  frontend: {
    F1: '组件 ≤ 200 行, 超了拆子组件', F2: '逻辑抽 composable/hook', F3: 'props 必须类型定义+校验',
    F4: '禁在模板里写复杂逻辑', F5: '副作用集中管理',
  },
};
const CORE_KEYS = {
  rust: ['R1', 'R2', 'R3', 'R4', 'R5'],
  typescript: ['T1', 'T2', 'T3', 'T4', 'T5'],
  python: ['P1', 'P2', 'P3', 'P4'],
  go: ['Go1', 'Go2', 'Go3'],
  frontend: ['F1', 'F2', 'F3'],
};

const CHECKLISTS = {
  testing: {
    file: 'references/testing-requirements.md',
    items: ['单测覆盖核心逻辑', '集成测试覆盖接口契约', 'e2e 覆盖主流程', '覆盖率达阈值', '无 flaky(偶发失败已 quarantine)', '测试数据可复现'],
  },
  security: {
    file: 'references/security-baseline.md',
    items: ['OWASP Top 10 基线核对', '依赖扫描无 critical', '输入边界校验', '鉴权/授权不可绕过', '密钥不进代码/不进日志', 'PII 过滤'],
  },
  deploy: {
    file: 'references/deploy-checklist.md',
    items: ['Docker 多阶段构建', 'CI 全绿', '迁移已跑且可回滚', '特性开关就位', '健康检查', '回滚预案'],
  },
  ops: {
    file: 'references/ops-checklist.md',
    items: ['结构化日志', '指标/追踪接入', '告警阈值', '备份+恢复演练', 'SLO 定义', 'oncall 预案'],
  },
  review: {
    file: 'references/pr-review-checklist.md',
    items: ['单一职责', '命名语义', '错误处理完整', '无魔数', '公共 API 有文档', '测试通过', 'lint 通过'],
  },
  bug: {
    file: 'references/bug-handling-track.md',
    items: ['已稳定复现', '根因已验证(非猜)', '修复带回归测试', 'anti-shortcut 核对真修根因', '未绕过 DoD'],
  },
};

function convFromDb(db, projectId, language, module) {
  if (module) {
    const c = db.prepare('SELECT * FROM conventions WHERE project_id = ? AND module = ? ORDER BY id DESC LIMIT 1').get(projectId, module);
    if (c) return c;
  }
  const c = db.prepare('SELECT * FROM conventions WHERE project_id = ? AND language = ? AND (module IS NULL) ORDER BY id DESC LIMIT 1').get(projectId, language);
  return c || null;
}

export default [
  {
    name: 'get_conventions',
    description: '返回某任务/语言/模块的规范 + 质量规则(分层注入用)。三种取径: ① task_id(优先) ② language(+可选 module) ③ 仅 module(自动从模块自身规范解析 language)。scope=core 返回 ≤15 条核心, scope=full 返回全部。DB 无则回退内置默认。跨会话只读拉模块约定无需先认领任务。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '按任务取(优先) ' },
        language: { type: 'string', enum: ['rust', 'typescript', 'python', 'go', 'frontend', 'vue', 'react'] },
        module: { type: 'string', description: '模块名; 仅传 module 也能拉到该模块约定(自动解析 language)' },
        scope: { type: 'string', enum: ['core', 'full'], default: 'core' },
        project_id: { type: 'string' },
      },
      required: [],
    },
    handler: (a) => {
      const db = getDb();
      let language = a.language;
      let module = a.module;
      let projectId = a.project_id;
      if (a.task_id) {
        const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(a.task_id);
        if (!t) return fail('任务不存在');
        language = t.language; module = t.module; projectId = t.project_id;
      }
      // 仅给 module 时也允许: 从模块自身规范行解析 language
      if (!language && module && projectId) {
        const mc = db.prepare('SELECT * FROM conventions WHERE project_id = ? AND module = ? ORDER BY id DESC LIMIT 1').get(projectId, module);
        if (mc) language = mc.language;
      }
      if (!language) return fail('需提供 task_id 或 language（或带 conventions 的 module）');
      let conv = projectId ? convFromDb(db, projectId, language, module) : null;
      const embedded = QUALITY_RULES[language] || QUALITY_RULES[module] || {};
      const coreKeys = CORE_KEYS[language] || Object.keys(embedded).slice(0, 15);
      const quality =
        conv && conv.quality_rules ? JSON.parse(conv.quality_rules) : embedded;
      const rules = a.scope === 'core' ? Object.fromEntries(Object.entries(quality).filter(([k]) => coreKeys.includes(k))) : quality;
      const out = {
        language,
        module: module || null,
        formatter: conv?.formatter || null,
        linter: conv?.linter || null,
        test_framework: conv?.test_framework || null,
        coverage_threshold: conv?.coverage_threshold ?? 80,
        max_file_lines: conv?.max_file_lines ?? (language === 'rust' ? 300 : language === 'typescript' ? 250 : language === 'python' ? 400 : 300),
        max_function_lines: conv?.max_function_lines ?? 40,
        quality_rules: rules,
      };
      return ok(out);
    },
  },

  {
    name: 'set_convention',
    description: '为项目设定/覆盖某语言(或模块级)规范。upsert: 同 project+language+module 已存在则更新。is_default_heuristic=1 表示可覆盖启发式。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        language: { type: 'string' },
        framework: { type: 'string' },
        module: { type: 'string' },
        formatter: { type: 'string' },
        linter: { type: 'string' },
        lint_rules: { type: 'string' },
        test_framework: { type: 'string' },
        coverage_threshold: { type: 'number' },
        quality_rules: { type: 'string', description: 'JSON 对象' },
        max_file_lines: { type: 'integer' },
        max_function_lines: { type: 'integer' },
        max_params: { type: 'integer' },
        max_nesting: { type: 'integer' },
        is_default_heuristic: { type: 'integer', enum: [0, 1], default: 1 },
        session: { type: 'string' },
      },
      required: ['project_id', 'language'],
    },
    handler: (a) => {
      const db = getDb();
      const proj = resolveProject(a.project_id);
      if (!proj) return fail('项目不存在');
      const existing = db
        .prepare('SELECT id FROM conventions WHERE project_id = ? AND language = ? AND (module IS ? OR module = ?)')
        .get(proj.id, a.language, a.module || null, a.module || null);
      if (existing) {
        db.prepare(
          `UPDATE conventions SET framework=?, formatter=?, linter=?, lint_rules=?, test_framework=?, coverage_threshold=?, quality_rules=?, max_file_lines=?, max_function_lines=?, max_params=?, max_nesting=?, is_default_heuristic=? WHERE id=?`
        ).run(
          a.framework || null, a.formatter || null, a.linter || null, a.lint_rules || null, a.test_framework || null,
          a.coverage_threshold ?? 80, a.quality_rules || null, a.max_file_lines ?? 300, a.max_function_lines ?? 40,
          a.max_params ?? 4, a.max_nesting ?? 4, a.is_default_heuristic ?? 1, existing.id
        );
        return ok({ convention_id: existing.id, updated: true });
      }
      const info = db
        .prepare(
          `INSERT INTO conventions (project_id, language, framework, module, formatter, linter, lint_rules, test_framework, coverage_threshold, quality_rules, max_file_lines, max_function_lines, max_params, max_nesting, is_default_heuristic, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          proj.id, a.language, a.framework || null, a.module || null, a.formatter || null, a.linter || null, a.lint_rules || null,
          a.test_framework || null, a.coverage_threshold ?? 80, a.quality_rules || null, a.max_file_lines ?? 300, a.max_function_lines ?? 40,
          a.max_params ?? 4, a.max_nesting ?? 4, a.is_default_heuristic ?? 1, new Date().toISOString()
        );
      return ok({ convention_id: info.lastInsertRowid, created: true });
    },
  },

  {
    name: 'get_quality_rules',
    description: '返回某语言的代码质量规则子集(core/full)。用于写码前注入与验收核对。',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['rust', 'typescript', 'python', 'go', 'frontend', 'vue', 'react'] },
        scope: { type: 'string', enum: ['core', 'full'], default: 'core' },
      },
      required: ['language'],
    },
    handler: (a) => {
      const all = QUALITY_RULES[a.language] || {};
      if (a.scope === 'full') return ok({ language: a.language, rules: all });
      const coreKeys = CORE_KEYS[a.language] || Object.keys(all).slice(0, 15);
      return ok({ language: a.language, scope: 'core', rules: Object.fromEntries(Object.entries(all).filter(([k]) => coreKeys.includes(k))) });
    },
  },

  {
    name: 'get_checklist',
    description: '返回指定 checklist(testing/security/deploy/ops/review/bug)。返回该清单条目 + 对应 reference 文件名(由 skill 注入完整文件)。',
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['testing', 'security', 'deploy', 'ops', 'review', 'bug'] } },
      required: ['kind'],
    },
    handler: (a) => {
      const c = CHECKLISTS[a.kind];
      if (!c) return fail('未知 checklist 类型');
      return ok(c);
    },
  },
];
