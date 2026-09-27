// Guards pages/missions.html:getWeekRange(). Weekly missions and the single
// missionCompletions query both assume today falls inside this week's range;
// the old week-number math broke that on some weekends.
//   run: node test_week_range.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('./pages/missions.html', import.meta.url), 'utf8');

const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `pages/missions.html no longer defines ${name}()`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}()`);
};

// eslint-disable-next-line no-new-func
const getWeekRange = new Function(`${grab('formatLocalDate')}\n${grab('getWeekRange')}\nreturn getWeekRange;`)();

for (let d = new Date(2024, 0, 1, 12); d < new Date(2031, 0, 1); d.setDate(d.getDate() + 1)) {
  const { start, end } = getWeekRange(d);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.ok(start <= day && day <= end, `${day} is outside its week ${start}..${end}`);
  assert.equal(new Date(`${start}T12:00:00`).getDay(), 1, `${day}: week starts on ${start}, not a Monday`);
}

console.log('ok — missions.html getWeekRange always contains today and starts on Monday');
