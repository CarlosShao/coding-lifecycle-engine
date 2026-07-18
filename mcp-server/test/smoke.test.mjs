import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { closeDb } from '../src/db.js';

const tmp = path.join(os.tmpdir(), `lifecycle-test-${Date.now()}.db`);
process.env.AI_LIFECYCLE_DB = tmp;

const mods = [
  (await import('../src/tools/project.js')).default,
  (await import('../src/tools/dag.js')).default,
  (await import('../src/tools/execution.js')).default,
  (await import('../src/tools/increment.js')).default,
  (await import('../src/tools/conventions.js')).default,
  (await import('../src/tools/memory.js')).default,
  (await import('../src/tools/bug.js')).default,
  (await import('../src/tools/approval.js')).default,
  (await import('../src/tools/parallel.js')).default,
  (await import('../src/tools/cost.js')).default,
  (await import('../src/tools/nfr.js')).default,
  (await import('../src/tools/misc.js')).default,
];
const TOOLS = mods.flat();
const byName = new Map(TOOLS.map((t) => [t.name, t]));

function call(name, args) {
  const t = byName.get(name);
  if (!t) throw new Error('no tool ' + name);
  // mimic server wrapper: req() throws are caught and returned as isError
  try {
    return t.handler(args || {});
  } catch (e) {
    return { content: [{ text: 'ERROR: ' + e.message }], isError: true };
  }
}
function j(res) {
  return JSON.parse(res.content[0].text);
}
const R = () => '/tmp/r-' + Math.random().toString(36).slice(2, 9);

// node:test runs top-level code (incl. cleanup) BEFORE test bodies, so defer close/cleanup to exit.
process.once('exit', () => {
  closeDb();
  try {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(tmp + '-wal', { force: true });
    fs.rmSync(tmp + '-shm', { force: true });
  } catch {}
});

test('full lifecycle closure: init -> decompose -> claim -> dep-gate -> complete', () => {
  const init = j(call('init_project', { name: 'demo', root_path: R(), project_type: 'greenfield', session: 'S1' }));
  assert.ok(init.project_id, 'project created');
  const pid = init.project_id;

  const dec = j(call('decompose', {
    project_id: pid,
    nodes: [
      { key: 'a', title: 'task A', type: 'atomic_task', language: 'rust', module: 'auth', dod: '["tests pass"]', acceptance_criteria: 'A works' },
      { key: 'b', title: 'task B', type: 'atomic_task', language: 'rust', module: 'api', depends_on: ['a'], dod: '["tests pass"]', acceptance_criteria: 'B works' },
    ],
    session: 'S1',
  }));
  assert.equal(dec.created.length, 2);
  const aId = dec.created[0].id;
  const bId = dec.created[1].id;

  const cd = j(call('check_dependencies', { task_id: bId, session: 'S1' }));
  assert.equal(cd.blocked, true, 'B blocked by A');

  const earlyDone = call('complete_task', { task_id: bId, evidence: 'x', session: 'S1' });
  assert.equal(earlyDone.isError, true, 'cannot complete B before A');

  j(call('claim_task', { task_id: aId, session: 'S1' }));
  j(call('start_task', { task_id: aId, session: 'S1' }));
  const doneA = j(call('complete_task', { task_id: aId, evidence: 'cargo test green', session: 'S1' }));
  assert.equal(doneA.status, 'done');

  const cd2 = j(call('check_dependencies', { task_id: bId, session: 'S1' }));
  assert.equal(cd2.blocked, false, 'B unblocked after A');
  j(call('claim_task', { task_id: bId, session: 'S1' }));
  const doneB = j(call('complete_task', { task_id: bId, evidence: 'cargo test green', session: 'S1' }));
  assert.equal(doneB.status, 'done');

  const st = j(call('get_state', { project_id: pid }));
  assert.equal(st.task_counts.find((c) => c.status === 'done').c, 2);
});

test('cycle dependency is rejected', () => {
  const init = j(call('init_project', { name: 'cyc', root_path: R(), session: 'S1' }));
  const pid = init.project_id;
  const r = call('decompose', {
    project_id: pid,
    nodes: [
      { key: 'x', title: 'X', depends_on: ['y'] },
      { key: 'y', title: 'Y', depends_on: ['x'] },
    ],
  });
  assert.equal(r.isError, true, 'cycle rejected');
});

test('grilling gate blocks advance to phase_0_5 (two-step commit)', () => {
  const init = j(call('init_project', { name: 'g', root_path: R(), session: 'S1' }));
  const pid = init.project_id;
  const adv = call('advance_phase', { project_id: pid, target_phase: 'phase_0_5' });
  assert.equal(adv.isError, true, 'cannot advance without gate');
  j(call('pass_gate', { project_id: pid, phase_key: 'phase_0', evidence: 'user locked plan', session: 'S1' }));
  // step 1: no confirm → stopped, NOT advanced
  const step1 = j(call('advance_phase', { project_id: pid, target_phase: 'phase_0_5' }));
  assert.equal(step1.stopped, true, 'first call must stop, not advance');
  assert.equal(step1.advanced, false);
  const stMid = j(call('get_state', { project_id: pid }));
  assert.equal(stMid.current_phase, 'phase_0', 'still phase_0 after step1');
  // step 2 without prior pending mismatch guard: confirm advances
  const step2 = j(call('advance_phase', { project_id: pid, target_phase: 'phase_0_5', confirmed_by_user: true, user_ack: '继续' }));
  assert.equal(step2.advanced, true);
  assert.equal(step2.current_phase, 'phase_0_5');
});

test('identity hard gate: cannot enter phase_1 until identity confirmed', () => {
  const init = j(call('init_project', { name: 'idg', root_path: R(), session: 'S1' }));
  const pid = init.project_id;
  // 0 -> 0.5
  j(call('pass_gate', { project_id: pid, phase_key: 'phase_0', evidence: 'lock', session: 'S1' }));
  j(call('advance_phase', { project_id: pid, target_phase: 'phase_0_5' }));
  j(call('advance_phase', { project_id: pid, target_phase: 'phase_0_5', confirmed_by_user: true, user_ack: 'go' }));
  // pass grilling gate on 0.5
  j(call('pass_gate', { project_id: pid, phase_key: 'phase_0_5', evidence: 'plan locked', session: 'S1' }));
  // step1 to phase_1 should FAIL: identity not confirmed
  const blocked = call('advance_phase', { project_id: pid, target_phase: 'phase_1' });
  assert.equal(blocked.isError, true, 'phase_1 blocked without identity_confirmed');
  // confirm identity (name unchanged branch)
  const ci = j(call('confirm_identity', { project_id: pid, session: 'S1' }));
  assert.equal(ci.identity_confirmed, true);
  // now step1 (stop) then step2 (advance) works
  const s1 = j(call('advance_phase', { project_id: pid, target_phase: 'phase_1' }));
  assert.equal(s1.stopped, true);
  const s2 = j(call('advance_phase', { project_id: pid, target_phase: 'phase_1', confirmed_by_user: true, user_ack: '进 phase1' }));
  assert.equal(s2.current_phase, 'phase_1');
});

test('rename_project also confirms identity', () => {
  const init = j(call('init_project', { name: 'untitled-x', root_path: R(), session: 'S1' }));
  const pid = init.project_id;
  j(call('pass_gate', { project_id: pid, phase_key: 'phase_0', evidence: 'l', session: 'S1' }));
  j(call('advance_phase', { project_id: pid, target_phase: 'phase_0_5' }));
  j(call('advance_phase', { project_id: pid, target_phase: 'phase_0_5', confirmed_by_user: true, user_ack: 'go' }));
  j(call('pass_gate', { project_id: pid, phase_key: 'phase_0_5', evidence: 'locked', session: 'S1' }));
  // rename should set identity_confirmed=1
  j(call('rename_project', { project_id: pid, new_name: 'my-app', session: 'S1' }));
  const st = j(call('get_state', { project_id: pid }));
  assert.equal(st.identity_confirmed, 1, 'rename confirms identity');
  const s1 = j(call('advance_phase', { project_id: pid, target_phase: 'phase_1' }));
  assert.equal(s1.stopped, true);
  const s2 = j(call('advance_phase', { project_id: pid, target_phase: 'phase_1', confirmed_by_user: true, user_ack: 'ok' }));
  assert.equal(s2.current_phase, 'phase_1');
});

test('confirmed_by_user without prior stop is rejected', () => {
  const init = j(call('init_project', { name: 'noskip', root_path: R(), session: 'S1' }));
  const pid = init.project_id;
  j(call('pass_gate', { project_id: pid, phase_key: 'phase_0', evidence: 'l', session: 'S1' }));
  // jump straight to confirm without step1 → pending mismatch → fail
  const bad = call('advance_phase', { project_id: pid, target_phase: 'phase_0_5', confirmed_by_user: true, user_ack: 'x' });
  assert.equal(bad.isError, true, 'must stop first before confirming');
});

test('bug track: report -> complete requires evidence', () => {
  const init = j(call('init_project', { name: 'b', root_path: R(), session: 'S1' }));
  const pid = init.project_id;
  const bug = j(call('report_bug', { project_id: pid, symptom: 'login 500', severity: 'high', source: 'test_failure', session: 'S1' }));
  assert.ok(bug.bug_id);
  const noEv = call('complete_task', { task_id: bug.bug_id, evidence: '' });
  assert.equal(noEv.isError, true);
});

test('quality rules + checklist retrievable', () => {
  const q = j(call('get_quality_rules', { language: 'rust', scope: 'core' }));
  assert.ok(q.rules.R1, 'rust core rule present');
  const qf = j(call('get_quality_rules', { language: 'typescript', scope: 'full' }));
  assert.ok(qf.rules.T9, 'ts full rule present');
  const chk = j(call('get_checklist', { kind: 'security' }));
  assert.ok(chk.file && chk.items.length > 0);
});

test('tool count >= 45', () => {
  assert.ok(TOOLS.length >= 45, `have ${TOOLS.length} tools`);
});

test('rename_project: change name + path, conflict detection', () => {
  // init two projects with distinct unique paths; capture paths we passed in
  const p1Path0 = R();
  const p2Path0 = R();
  const p1 = j(call('init_project', { name: 'alpha', root_path: p1Path0, session: 'S1' }));
  const p2 = j(call('init_project', { name: 'beta', root_path: p2Path0, session: 'S1' }));

  // rename p1 to a brand-new unique path + new name
  const newPath = R();
  const renamed = j(call('rename_project', {
    project_id: p1.project_id,
    new_name: 'alpha-v2',
    new_root_path: newPath,
    session: 'S1',
  }));
  assert.equal(renamed.name, 'alpha-v2');
  assert.equal(renamed.root_path, newPath);

  // get_state reflects new name/path via id and via new root_path
  const st = j(call('get_state', { project_id: p1.project_id }));
  assert.ok(st);
  const st2 = j(call('get_state', { project_id: newPath }));
  assert.ok(st2);

  // cannot rename p2 onto p1's (now taken) new path
  const conflict = call('rename_project', {
    project_id: p2.project_id,
    new_root_path: newPath,
    session: 'S1',
  });
  assert.equal(conflict.isError, true, 'root_path conflict must be rejected');

  // cannot rename p1 onto p2's still-lived original path
  const conflict2 = call('rename_project', {
    project_id: p1.project_id,
    new_root_path: p2Path0,
    session: 'S1',
  });
  assert.equal(conflict2.isError, true, 'renaming onto another live project path must be rejected');

  // non-existent project fails
  const nope = call('rename_project', { project_id: 'nonexistent-id', new_name: 'x', session: 'S1' });
  assert.equal(nope.isError, true, 'non-existent project rejected');
});

test('reset_project: wipes progress, keeps identity, back to phase_0', () => {
  const path0 = R();
  const p = j(call('init_project', { name: 'rs', root_path: path0, session: 'S1' }));
  // create some progress: a work item + a task
  const wi = j(call('add_work_item', { project_id: p.project_id, title: 'WI1', kind: 'initial', prd_fragment: 'x', session: 'S1' }));
  j(call('decompose', {
    project_id: p.project_id,
    nodes: [{ key: 'a', title: 'task A', type: 'atomic_task', language: 'rust', module: 'm', dod: '["ok"]', acceptance_criteria: 'a' }],
  }));
  // advance to phase_1 (requires gate 0.5; instead just set via get_state to confirm reset)
  // reset
  const r = j(call('reset_project', { project_id: p.project_id, session: 'S1' }));
  assert.equal(r.current_phase, 'phase_0');
  // after reset: no tasks, no work items, phase_0 active
  const st = j(call('get_state', { project_id: p.project_id }));
  assert.equal(st.current_phase, 'phase_0');
  const taskCount = st.task_counts;
  const total = Object.values(taskCount).reduce((a, b) => a + b, 0);
  assert.equal(total, 0, 'tasks cleared after reset');
  // identity preserved
  assert.equal(st.name, 'rs');
  assert.equal(st.project_type, 'greenfield');
  void wi;
});

test('delete_project: removes project, frees root_path for re-init', () => {
  const path0 = R();
  const p = j(call('init_project', { name: 'del', root_path: path0, session: 'S1' }));
  const del = j(call('delete_project', { project_id: p.project_id, session: 'S1' }));
  assert.equal(del.deleted, true);
  // root_path now free → re-init succeeds
  const re = j(call('init_project', { name: 'del2', root_path: path0, session: 'S1' }));
  assert.ok(re.project_id, 'can re-init same root_path after delete');
  // get_state on deleted id fails
  const gone = call('get_state', { project_id: p.project_id });
  assert.equal(gone.isError, true, 'deleted project not found');
});

test('get_contracts: freeze then read-only query by role (no state mutation)', () => {
  const p = j(call('init_project', { name: 'contracts', root_path: R(), session: 'S1' }));
  const pid = p.project_id;
  // freeze two contracts touching frontend-web from different providers
  j(call('freeze_contract', {
    project_id: pid, provider_module: 'backend-billing', consumer_module: 'frontend-web',
    interface_spec: 'GET /api/billing {id} -> {total}', session: 'S1',
  }));
  j(call('freeze_contract', {
    project_id: pid, provider_module: 'backend-catalog', consumer_module: 'frontend-web',
    interface_spec: 'GET /api/catalog -> {items[]}', session: 'S1',
  }));
  // also a contract where frontend-web is the provider (e.g. emits events)
  j(call('freeze_contract', {
    project_id: pid, provider_module: 'frontend-web', consumer_module: 'analytics',
    interface_spec: 'emit(event)', session: 'S1',
  }));

  // role=consumer: should see only the 2 it consumes
  const asConsumer = j(call('get_contracts', { project_id: pid, module: 'frontend-web', role: 'consumer' }));
  assert.equal(asConsumer.count, 2, 'consumer sees 2 inbound contracts');
  assert.ok(asConsumer.contracts.every((c) => c.consumer_module === 'frontend-web'));

  // role=provider: should see only the 1 it provides
  const asProvider = j(call('get_contracts', { project_id: pid, module: 'frontend-web', role: 'provider' }));
  assert.equal(asProvider.count, 1, 'provider sees 1 outbound contract');

  // role omitted (both): all 3
  const both = j(call('get_contracts', { project_id: pid, module: 'frontend-web' }));
  assert.equal(both.count, 3, 'both roles returns 3 contracts');
  // read-only: task state untouched (no start_task called) — verify a fresh task can still start
  const dec = j(call('decompose', {
    project_id: pid,
    nodes: [{ key: 'fe', title: 'render page', type: 'atomic_task', module: 'frontend-web', dod: '["ok"]', acceptance_criteria: 'a' }],
  }));
  const taskId = dec.created[0].id;
  const started = j(call('start_task', { task_id: taskId, session: 'S2' }));
  assert.equal(started.contracts.length, 3, 'start_task still returns same frozen contracts (get_contracts is non-destructive)');
});

test('freeze_contract version bump auto-blocks in-flight tasks on both sides', () => {
  const p = j(call('init_project', { name: 'bump', root_path: R(), session: 'S1' }));
  const pid = p.project_id;
  const dec = j(call('decompose', { project_id: pid, nodes: [
    { key: 'fe', title: 'fe task', type: 'atomic_task', module: 'frontend-web', language: 'typescript', dod: '["ok"]', acceptance_criteria: 'a' },
    { key: 'be', title: 'be task', type: 'atomic_task', module: 'backend-billing', language: 'typescript', dod: '["ok"]', acceptance_criteria: 'a' },
  ] }));
  const feId = dec.created.find((c) => c.title === 'fe task').id;
  const beId = dec.created.find((c) => c.title === 'be task').id;
  j(call('freeze_contract', { project_id: pid, provider_module: 'backend-billing', consumer_module: 'frontend-web', interface_spec: 'v1', session: 'S1' }));
  j(call('start_task', { task_id: feId, session: 'S2' }));
  j(call('start_task', { task_id: beId, session: 'S3' }));
  const bump = j(call('freeze_contract', { project_id: pid, provider_module: 'backend-billing', consumer_module: 'frontend-web', interface_spec: 'v2', version: 2, session: 'S1' }));
  assert.equal(bump.version_bump, true, 'detected prior version');
  assert.equal(bump.blocked_tasks.length, 2, 'both in-flight tasks (provider+consumer) blocked');
  const dag = j(call('get_dag', { project_id: pid }));
  assert.equal(dag.nodes.find((n) => String(n.id) === String(feId)).status, 'blocked');
  assert.equal(dag.nodes.find((n) => String(n.id) === String(beId)).status, 'blocked');
  // unblock consumer → back to in_progress; provider still blocked
  j(call('unblock_task', { task_id: feId, resolution: 'aligned to v2', session: 'S2' }));
  const dag2 = j(call('get_dag', { project_id: pid }));
  assert.equal(dag2.nodes.find((n) => String(n.id) === String(feId)).status, 'in_progress');
  assert.equal(dag2.nodes.find((n) => String(n.id) === String(beId)).status, 'blocked');
});

test('get_dag: each node carries its frozen contract summary', () => {
  const p = j(call('init_project', { name: 'dagc', root_path: R(), session: 'S1' }));
  const pid = p.project_id;
  j(call('decompose', { project_id: pid, nodes: [
    { key: 'fe', title: 'fe', type: 'atomic_task', module: 'frontend-web', language: 'typescript', dod: '["ok"]', acceptance_criteria: 'a' },
  ] }));
  j(call('freeze_contract', { project_id: pid, provider_module: 'backend-billing', consumer_module: 'frontend-web', interface_spec: 'GET /x', session: 'S1' }));
  const dag = j(call('get_dag', { project_id: pid }));
  const feNode = dag.nodes.find((n) => n.module === 'frontend-web');
  assert.equal(feNode.contracts.length, 1, 'node carries its contract');
  assert.equal(feNode.contracts[0].provider_module, 'backend-billing');
  assert.equal(feNode.contracts[0].consumer_module, 'frontend-web');
});

test('get_conventions: module-only lookup (no task_id, no language)', () => {
  const p = j(call('init_project', { name: 'conv', root_path: R(), session: 'S1' }));
  const pid = p.project_id;
  j(call('set_convention', { project_id: pid, language: 'typescript', module: 'frontend-web', formatter: 'prettier', linter: 'eslint', session: 'S1' }));
  // cross-session read by module name alone — must resolve language internally
  const c = j(call('get_conventions', { project_id: pid, module: 'frontend-web' }));
  assert.equal(c.language, 'typescript', 'language resolved from module convention');
  assert.equal(c.formatter, 'prettier');
  assert.equal(c.module, 'frontend-web');
});

test('NFR: mvp pass_gate(phase_0_5) not enforced', () => {
  const init = j(call('init_project', { name: 'mvp-nfr', root_path: R(), maturity: 'mvp', session: 'S1' }));
  const pid = init.project_id;
  const res = j(call('pass_gate', { project_id: pid, phase_key: 'phase_0_5', evidence: 'user locked' }));
  assert.equal(res.gate_passed, true, 'mvp should not require NFR coverage');
});

test('NFR: enterprise pass_gate fails when dims missing', () => {
  const init = j(call('init_project', { name: 'ent-nfr', root_path: R(), maturity: 'enterprise', session: 'S1' }));
  const pid = init.project_id;
  const res = call('pass_gate', { project_id: pid, phase_key: 'phase_0_5', evidence: 'user locked' });
  assert.equal(res.isError, true, 'enterprise must require NFR coverage before gate');
});

test('NFR: enterprise pass_gate ok after covering all', () => {
  const init = j(call('init_project', { name: 'ent-nfr2', root_path: R(), maturity: 'enterprise', session: 'S1' }));
  const pid = init.project_id;
  const chk = j(call('get_nfr_checklist', { project_id: pid }));
  assert.ok(chk.enforced, 'enterprise checklist enforced');
  assert.ok(chk.required_count >= 14, `enterprise requires many dims, got ${chk.required_count}`);
  for (const it of chk.items) {
    j(call('set_nfr_coverage', { project_id: pid, dimension: it.key, covered: true, notes: 'covered in plan' }));
  }
  const after = j(call('get_nfr_checklist', { project_id: pid }));
  assert.equal(after.all_covered, true, 'all covered now');
  const res = j(call('pass_gate', { project_id: pid, phase_key: 'phase_0_5', evidence: 'user locked' }));
  assert.equal(res.gate_passed, true, 'gate passes after full coverage');
});

test('NFR: commercial requires base+5 only', () => {
  const init = j(call('init_project', { name: 'com-nfr', root_path: R(), maturity: 'commercial', session: 'S1' }));
  const pid = init.project_id;
  const chk = j(call('get_nfr_checklist', { project_id: pid }));
  assert.equal(chk.required_count, 9, `commercial requires 9 (base4+5), got ${chk.required_count}`);
  assert.ok(!chk.items.some((i) => i.key === 'compliance'), 'compliance not required for commercial');
});

test('list_projects enumerates all projects (read-only)', () => {
  const before = j(call('list_projects', {})).projects.length;
  const a = j(call('init_project', { name: 'lp-a', root_path: R(), session: 'S1' }));
  const b = j(call('init_project', { name: 'lp-b', root_path: R(), session: 'S1' }));
  const list = j(call('list_projects', {}));
  assert.equal(list.projects.length, before + 2, 'two new projects appear');
  const ids = list.projects.map((p) => p.id);
  assert.ok(ids.includes(a.project_id), 'lp-a present');
  assert.ok(ids.includes(b.project_id), 'lp-b present');
  // 只读: list 不应改变任何项目状态
  const after = j(call('get_state', { project_id: a.project_id }));
  assert.equal(after.current_phase, 'phase_0', 'get_state still works, list_projects is non-mutating');
  // only_active 返回数组且包含新项目(两者都 phase_0, 均算 active)
  const active = j(call('list_projects', { only_active: true })).projects.map((p) => p.id);
  assert.ok(Array.isArray(active) && active.includes(a.project_id), 'only_active returns subset array');
});

test('tool count >= 52', () => {
  assert.ok(TOOLS.length >= 52, `have ${TOOLS.length} tools`);
});
