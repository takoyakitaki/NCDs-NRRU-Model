// Guards the Firestore date bound in pages/food.html:loadCalorieHistory().
// That query is  date >= range[0]  AND  date <= range[last]  — if buildHistoryRange()
// ever stops returning an ascending contiguous run of days, the query silently
// returns nothing and the calorie chart goes blank with no error.
//   run: node test_history_range.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('./pages/food.html', import.meta.url), 'utf8');

const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `pages/food.html no longer defines ${name}()`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}()`);
};

const helpers = ['formatLocalDate', 'addDays', 'startOfWeek', 'buildHistoryRange'].map(grab).join('\n');

for (const historyMode of ['week', 'month']) {
  // eslint-disable-next-line no-new-func
  const range = new Function('historyMode', `${helpers}\nreturn buildHistoryRange();`)(historyMode);

  assert.ok(range.length >= 7, `${historyMode}: expected at least a week, got ${range.length}`);
  assert.deepEqual([...range].sort(), range, `${historyMode}: range must be ascending`);

  for (let i = 1; i < range.length; i++) {
    const prev = new Date(`${range[i - 1]}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() + 1);
    assert.equal(range[i], prev.toISOString().slice(0, 10),
      `${historyMode}: gap between ${range[i - 1]} and ${range[i]}`);
  }

  // the bound the query actually sends
  assert.equal(range[0], range.reduce((a, b) => (a < b ? a : b)), `${historyMode}: range[0] is not the min`);
  assert.equal(range[range.length - 1], range.reduce((a, b) => (a > b ? a : b)), `${historyMode}: last is not the max`);
}

console.log('ok — food.html history range is ascending, contiguous, and safe to use as a Firestore bound');
