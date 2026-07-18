#!/usr/bin/env node
// extract-conventions.mjs
//
// 文档 → conventions-index.json 抽取脚本（无外部依赖，仅 node:fs / node:path / node:url）。
//
// 用途：
//   1. （默认）从内置 DEFAULTS 重新生成 references/conventions-index.json，保证与
//      mcp-server/src/tools/conventions.js 的 QUALITY_RULES / CORE_KEYS 同源、可复现。
//   2. （--in <md>）解析一份「架构文档」的逐语言段落，抽取格式化/ lint / 测试框架 /
//      上限 / 质量规则，覆盖到 DEFAULTS 之上，再写出。
//
// 运行：
//   node scripts/extract-conventions.mjs
//   node scripts/extract-conventions.mjs --in ../docs/project-architecture.zh.md
//   node scripts/extract-conventions.mjs --in arch.md --out references/conventions-index.json
//
// 架构文档输入格式（解析器 tolerant，缺字段回退内置默认）：
//   ## Rust                       (或 ### Rust / ## rust)
//   - formatter: rustfmt
//   - linter: clippy
//   - test_framework: cargo test
//   - coverage_threshold: 80
//   - naming: snake_case
//   - max_file_lines: 300
//   - max_function_lines: 40
//   - max_params: 4
//   - max_nesting: 4
//   - lint_rules:
//     - unwrap_used: deny
//     - expect_used: deny
//   - quality_rules:
//     - R1: 单文件 ≤ 300 行 (limit: 300, enforce: ci_max_lines)
//     - R3: 禁裸 unwrap/expect(测试除外) (enforce: clippy::unwrap_used=deny)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = join(ROOT, 'references', 'conventions-index.json');

// ---------------------------------------------------------------------------
// 内置默认（与 conventions.js QUALITY_RULES / CORE_KEYS + 已发布 index 同源）
// 这是「机器可消费」的真相源基线；项目运行时可用 set_convention 覆盖。
// ---------------------------------------------------------------------------
const DEFAULTS = {
  _meta: {
    description:
      "Machine-consumable language→convention map. Source of truth for get_conventions/set_convention seeding. is_default_heuristic=true everywhere: project may override via set_convention.",
    generated_by: "scripts/extract-conventions.mjs (defaults)",
    enforcement_layers: ["inject_before_write", "lint_precommit", "ci_full", "verify_at_review"],
  },
  rust: {
    formatter: "rustfmt", linter: "clippy",
    lint_rules: { unwrap_used: "deny", expect_used: "deny", undocumented_unsafe_blocks: "deny", cognitive_complexity: "warn" },
    test_framework: "cargo test", coverage_threshold: 80, naming: "snake_case",
    max_file_lines: 300, max_function_lines: 40, max_params: 4, max_nesting: 4,
    quality_rules: {
      R1: { rule: "单文件 ≤ 300 行", limit: 300, enforce: "ci_max_lines" },
      R2: { rule: "单函数 ≤ 40 行(soft)/60 硬", limit: 40, hard: 60, enforce: "clippy_cognitive_complexity" },
      R3: { rule: "禁裸 unwrap/expect(测试除外)", enforce: "clippy::unwrap_used=deny" },
      R4: { rule: "错误用 thiserror/anyhow 定义类型", enforce: "review+clippy" },
      R5: { rule: "pub 项必须 doc comment", enforce: "missing_docs=warn" },
      R6: { rule: "模块清晰分层 src/auth/ src/db/", enforce: "structure_check" },
      R7: { rule: "禁 unsafe(除非注释论证)", enforce: "clippy::undocumented_unsafe_blocks=deny" },
      R8: { rule: "优先借用而非 clone", enforce: "review" },
    },
  },
  typescript: {
    formatter: "prettier", linter: "eslint (@typescript-eslint)",
    lint_rules: { "max-lines-per-file": 250, "max-params": 4, "max-depth": 4, complexity: 10, "no-explicit-any": "error", "no-floating-promises": "error", "no-console": { prod: "error" } },
    test_framework: "vitest/jest", coverage_threshold: 80, naming: "camelCase",
    max_file_lines: 250, max_function_lines: 40, max_params: 4, max_nesting: 4,
    quality_rules: {
      T1: { rule: "单文件 ≤ 250 行", limit: 250, enforce: "eslint_max-lines-per-file" },
      T2: { rule: "禁 any", enforce: "@typescript-eslint/no-explicit-any=error" },
      T3: { rule: "函数参数 ≤ 4", limit: 4, enforce: "eslint_max-params" },
      T4: { rule: "嵌套 ≤ 4 层", limit: 4, enforce: "eslint_max-depth/complexity" },
      T5: { rule: "async 必须 try-catch 或 .catch", enforce: "no-floating-promises" },
      T6: { rule: "组件单一职责", enforce: "review" },
      T7: { rule: "禁 as 强转(除非 unknown 收窄)", enforce: "review" },
      T8: { rule: "strict 模式全开", enforce: "tsconfig_strict" },
      T9: { rule: "禁 console.log 进生产", enforce: "no-console(prod)" },
    },
  },
  python: {
    formatter: "black", linter: "ruff",
    lint_rules: { E722: "error", B006: "error", C901: "warn", D: "warn" },
    test_framework: "pytest", coverage_threshold: 80, naming: "snake_case",
    max_file_lines: 400, max_function_lines: 50, max_params: 4, max_nesting: 4,
    quality_rules: {
      P1: { rule: "单文件 ≤ 400 行", limit: 400, enforce: "ruff/ci" },
      P2: { rule: "全量 type hints", enforce: "mypy_strict" },
      P3: { rule: "禁裸 except:", enforce: "ruff_E722" },
      P4: { rule: "函数 ≤ 50 行", limit: 50, enforce: "ruff_C901" },
      P5: { rule: "用 dataclass/pydantic 而非裸 dict", enforce: "review" },
      P6: { rule: "禁可变默认参数", enforce: "ruff_B006" },
      P7: { rule: "docstring 公共函数/类", enforce: "ruff_D" },
    },
  },
  go: {
    formatter: "gofmt", linter: "golangci-lint",
    lint_rules: { errcheck: "error", revive: "warn", govet: "error" },
    test_framework: "go test", coverage_threshold: 80, naming: "CamelCase(exported)/camelCase(local)",
    max_file_lines: 500, max_function_lines: 60, max_params: 4, max_nesting: 4,
    quality_rules: {
      Go1: { rule: "单文件 ≤ 500 行", limit: 500, enforce: "golangci-lint" },
      Go2: { rule: "错误必须处理, 禁 _ = 吞错", enforce: "errcheck" },
      Go3: { rule: "错误包装用 %w", enforce: "review" },
      Go4: { rule: "禁 panic 于库代码", enforce: "review" },
      Go5: { rule: "导出标识符必须注释", enforce: "revive" },
      Go6: { rule: "context 作首参传递", enforce: "review" },
    },
  },
  vue: {
    framework: "vue3", formatter: "prettier", linter: "eslint + @vue/eslint-config",
    test_framework: "vitest", coverage_threshold: 80, naming: "PascalCase(component)/camelCase",
    max_file_lines: 200, max_function_lines: 40, max_params: 4, max_nesting: 4,
    quality_rules: {
      F1: { rule: "组件 ≤ 200 行, 超了拆子组件", limit: 200, enforce: "eslint_max-lines" },
      F2: { rule: "逻辑抽 composable, 不堆组件里", enforce: "review" },
      F3: { rule: "props 必须类型定义+校验", enforce: "lint" },
      F4: { rule: "禁在模板里写复杂逻辑", enforce: "review" },
      F5: { rule: "副作用集中管理(onMounted/watch)", enforce: "review" },
    },
  },
  react: {
    framework: "react", formatter: "prettier", linter: "eslint + react-hooks",
    test_framework: "vitest/react-testing-library", coverage_threshold: 80, naming: "PascalCase(component)/camelCase",
    max_file_lines: 200, max_function_lines: 40, max_params: 4, max_nesting: 4,
    quality_rules: {
      F1: { rule: "组件 ≤ 200 行, 超了拆子组件", limit: 200, enforce: "eslint_max-lines" },
      F2: { rule: "逻辑抽 hook/custom, 不堆组件里", enforce: "review" },
      F3: { rule: "props 必须类型定义(TS/PropTypes)+校验", enforce: "lint" },
      F4: { rule: "禁在 JSX 里写复杂逻辑", enforce: "review" },
      F5: { rule: "副作用集中管理(useEffect)", enforce: "review" },
    },
  },
};

const LANG_ALIASES = {
  rust: "rust", rs: "rust",
  typescript: "typescript", ts: "typescript", javascript: "typescript", js: "typescript",
  python: "python", py: "python",
  go: "go", golang: "go",
  vue: "vue",
  react: "react",
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v) && base && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseKv(line) {
  const m = line.match(/^[-*]\s*(.+?)\s*:\s*(.+?)\s*$/);
  if (!m) return null;
  return [m[1].trim(), m[2].trim()];
}

function inferScalar(v) {
  if (/^\d+$/.test(v)) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

// 解析质量规则行：- R1: 单文件 ≤ 300 行 (limit: 300, enforce: ci_max_lines)
function parseQualityRule(text) {
  const m = text.match(/^[-*]\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/);
  if (!m) return null;
  const id = m[1];
  let body = m[2];
  const rule = { rule: body };
  const limit = body.match(/limit\s*[:=]\s*(\d+)/i);
  if (limit) rule.limit = Number(limit[1]);
  const hard = body.match(/hard\s*[:=]\s*(\d+)/i);
  if (hard) rule.hard = Number(hard[1]);
  const enforce = body.match(/enforce\s*[:=]\s*([A-Za-z0-9_./:-]+)/i);
  if (enforce) rule.enforce = enforce[1];
  // 清理 rule 文本里的括号注记
  rule.rule = body.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return [id, rule];
}

// 解析架构 markdown → 覆盖 DEFAULTS
function parseArchitecture(mdPath) {
  const text = readFileSync(mdPath, "utf8");
  const lines = text.split(/\r?\n/);
  const merged = structuredClone(DEFAULTS);
  let cur = null;        // 当前语言 key
  let section = null;    // 当前子段: lint_rules | quality_rules | null
  const blocks = { lint_rules: {}, quality_rules: {} };

  const closeSection = () => {
    if (cur && section === "lint_rules") {
      merged[cur].lint_rules = deepMerge(merged[cur].lint_rules || {}, blocks.lint_rules);
    }
    if (cur && section === "quality_rules") {
      merged[cur].quality_rules = deepMerge(merged[cur].quality_rules || {}, blocks.quality_rules);
    }
    blocks.lint_rules = {}; blocks.quality_rules = {};
    section = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 语言标题：## Rust / ### Rust
    const head = line.match(/^#{2,4}\s*(.+?)\s*$/);
    if (head) {
      const name = head[1].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const key = LANG_ALIASES[name];
      closeSection();
      cur = key || null;
      if (!cur) continue;
      if (!merged[cur]) merged[cur] = { quality_rules: {} };
      continue;
    }
    if (!cur) continue;

    // 子段标题
    const sub = line.match(/^#{3,5}\s*(lint_rules|quality_rules|测试框架|质量规则|lint 规则)\s*$/i)
      || line.match(/^[-*]\s*(lint_rules|quality_rules)\s*:\s*$/i);
    if (sub) {
      const s = (sub[1] || sub[2] || "").toLowerCase();
      section = s.includes("lint") ? "lint_rules" : "quality_rules";
      continue;
    }

    // 质量规则项
    if (section === "quality_rules") {
      const qr = parseQualityRule(line);
      if (qr) { blocks.quality_rules[qr[0]] = qr[1]; continue; }
    }
    // lint 规则项
    if (section === "lint_rules") {
      const kv = parseKv(line);
      if (kv) { blocks.lint_rules[kv[0]] = inferScalar(kv[1]); continue; }
    }

    // 顶层 kv 覆盖（formatter/linter/test_framework/coverage_threshold/naming/max_*）
    const kv = parseKv(line);
    if (kv) {
      const [k, v] = kv;
      const map = {
        formatter: "formatter", linter: "linter", test_framework: "test_framework",
        coverage_threshold: "coverage_threshold", naming: "naming",
        max_file_lines: "max_file_lines", max_function_lines: "max_function_lines",
        max_params: "max_params", max_nesting: "max_nesting", framework: "framework",
      };
      if (map[k]) merged[cur][map[k]] = inferScalar(v);
    }
  }
  closeSection();
  merged._meta.generated_by = `scripts/extract-conventions.mjs (parsed ${mdPath})`;
  return merged;
}

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { in: null, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") out.in = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.in) {
    if (!existsSync(args.in)) {
      process.stderr.write(`[extract-conventions] ERROR: --in 文件不存在: ${args.in}\n`);
      process.exit(1);
    }
    result = parseArchitecture(args.in);
    process.stderr.write(`[extract-conventions] 已从 ${args.in} 解析并合并到默认基线\n`);
  } else {
    result = structuredClone(DEFAULTS);
    result._meta.generated_by = "scripts/extract-conventions.mjs (defaults)";
    process.stderr.write(`[extract-conventions] 未指定 --in，使用内置默认基线\n`);
  }

  const outDir = dirname(args.out);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n", "utf8");

  const langs = Object.keys(result).filter((k) => k !== "_meta");
  const counts = langs.map((l) => `${l}:${Object.keys(result[l].quality_rules || {}).length}条`).join(", ");
  process.stderr.write(
    `[extract-conventions] 已写出 ${args.out}\n` +
    `[extract-conventions] 语言数=${langs.length} (${counts})\n`
  );
  // 额外：校验可被 JSON 解析（再读一次）
  JSON.parse(readFileSync(args.out, "utf8"));
  process.stderr.write(`[extract-conventions] JSON 校验通过\n`);
}

main();
