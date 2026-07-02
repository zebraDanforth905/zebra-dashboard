import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('camp page gets LMS checklist state from the server data function', () => {
  const page = read('../app/dashboard/camp/[startDate]/[endDate]/page.tsx');
  assert.match(page, /fetchCampLmsChecklist\(startDate,\s*endDate\)/);
  assert.match(page, /<CampLmsChecklist[\s\S]*checklist=\{lmsChecklist\}/);
});

test('LMS checklist mutations go through server actions', () => {
  const component = read('../app/ui/camp/camp-lms-checklist.tsx');
  assert.match(component, /updateCampLmsStatus/);
  assert.match(component, /syncCampLmsCanvasWeek/);
  assert.match(component, /runCampLmsCanvasTestAction/);
  assert.match(component, /refreshCampLmsWeek/);
});

test('LMS status update requires an authenticated server session', () => {
  const actions = read('../app/lib/actions.ts');
  assert.match(actions, /export async function updateCampLmsStatus/);
  assert.match(actions, /const session = await auth\(\)/);
  assert.match(actions, /if \(!userId\)/);
  assert.match(actions, /CampLmsStatusUpdateSchema\.safeParse/);
});

test('LMS checklist summary is computed server-side from persisted rows', () => {
  const data = read('../app/lib/data.ts');
  assert.match(data, /function summarizeCampLmsRows/);
  assert.match(data, /summary\.total \+= 1/);
  assert.match(data, /summary\.verified \+= 1/);
  assert.match(data, /summary\.canvas_ok \+= 1/);
  assert.match(data, /summary: summarizeCampLmsRows\(rows\)/);
});

test('Canvas write actions are audited and constrained to latest snapshot', () => {
  const actions = read('../app/lib/actions.ts');
  assert.match(actions, /camp_lms_canvas_action_audit/);
  assert.match(actions, /before_state/);
  assert.match(actions, /after_state/);
  assert.match(actions, /Sync LMS first and confirm the Canvas user match/);
  assert.match(actions, /latest active Canvas snapshot/);
});
