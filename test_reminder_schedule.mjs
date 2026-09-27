// Guards pages/reminders.html:getNextReminderSchedule(). It used toISOString()
// (UTC) with the Z cut off, so in Thailand a daily 08:00 reminder moved to 01:00,
// then 18:00, then 11:00 — seven hours earlier every time it was marked done.
//   run: node test_reminder_schedule.mjs
process.env.TZ = 'Asia/Bangkok';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('./pages/reminders.html', import.meta.url), 'utf8');

const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `pages/reminders.html no longer defines ${name}()`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}()`);
};

// eslint-disable-next-line no-new-func
const next = new Function(
  ['formatLocalDate', 'formatLocalDateTime', 'getNextReminderSchedule'].map(grab).join('\n') + '\nreturn getNextReminderSchedule;'
)();

// every day at 08:00: stays at 08:00, one day later each time
let at = '2026-09-27T08:00:00';
for (const expected of ['2026-09-28T08:00:00', '2026-09-29T08:00:00', '2026-09-30T08:00:00']) {
  at = next({ scheduledAt: at, repeatDays: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(at, expected);
}

// Mon/Wed/Fri at 20:30, marked done on a Friday (2026-10-02) -> next Monday
assert.equal(next({ scheduledAt: '2026-10-02T20:30:00', repeatDays: [1, 3, 5] }), '2026-10-05T20:30:00');

// across a month end, late evening (the hour most likely to cross midnight in UTC)
assert.equal(next({ scheduledAt: '2026-10-31T23:15:00', repeatDays: [0, 1, 2, 3, 4, 5, 6] }), '2026-11-01T23:15:00');

// one-off reminders are left alone
assert.equal(next({ scheduledAt: '2026-10-02T09:00:00', repeatDays: [] }), '2026-10-02T09:00:00');

console.log('ok — reminders.html repeat schedule keeps the same local time');
