const assert = require('node:assert/strict');
const test = require('node:test');
const schedule = require('../data/schedule.json');
const blockDurations = new Map([
  ['Piątek:1', 95],
  ['Piątek:3', 95],
  ['Piątek:5', 95],
  ['Sobota:1', 95],
  ['Sobota:3', 95],
  ['Sobota:5', 125],
  ['Sobota:7', 95],
  ['Sobota:9', 95],
  ['Niedziela:1', 95],
  ['Niedziela:3', 95],
  ['Niedziela:5', 125],
  ['Niedziela:7', 95],
  ['Niedziela:9', 95],
]);

function toMinutes(hours, minutes) {
  return Number(hours) * 60 + Number(minutes);
}

test('shows the full duration of each two-period lesson block from the timetable', () => {
  assert.equal(schedule.entries.length, blockDurations.size);

  for (const entry of schedule.entries) {
    const match = entry.time.match(/^(\d{1,2})\.(\d{2}) - (\d{1,2})\.(\d{2})$/);
    assert.ok(match, `Invalid timetable time range: ${entry.time}`);
    const [, startHours, startMinutes, endHours, endMinutes] = match;
    const duration = toMinutes(endHours, endMinutes) - toMinutes(startHours, startMinutes);
    const expectedDuration = blockDurations.get(`${entry.day}:${entry.period}`);
    assert.notEqual(expectedDuration, undefined, `${entry.day}, period ${entry.period} is absent from the source timetable`);
    assert.equal(duration, expectedDuration, `${entry.day}, period ${entry.period}: ${entry.time}`);
  }
});
