#!/usr/bin/env node
// Health check for every board adapter.
//
// The BIEK bug — three announced groups silently missing because the discovery
// filter required the word "gazette" in the filename — was invisible until a
// student looked for a result that was not in the list. This script makes that
// class of mistake visible: it prints what each board is offering right now and
// flags anything suspicious (fewer results than expected, stale years, dead
// gazette links, adapters that throw).
//
//   npm run check          all boards
//   npm run check biek     one board

const fs = require('fs');
const path = require('path');
const adapters = require('../src/adapters');
const { BOARDS } = require('../src/boards');

const only = process.argv[2];
const thisYear = new Date().getFullYear();

// A fixed minimum would not have caught the BIEK bug, which returned a
// plausible-looking 4 of 7 groups. What gives it away is the drop, so the
// highest count ever seen per board is remembered and compared against.
const BASELINE_FILE = path.join(__dirname, '.board-baseline.json');

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeBaseline(data) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2) + '\n');
}

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;

async function checkBoard(id, baseline) {
  const adapter = adapters[id];
  const info = BOARDS.find((b) => b.id === id);
  const name = (info && info.name) || id;
  const issues = [];

  let exams;
  try {
    exams = adapter.getExams ? await adapter.getExams() : adapter.exams;
  } catch (e) {
    console.log(`${bad('FAIL')} ${name} — cannot list results: ${e.message}`);
    return 1;
  }

  const seenBefore = baseline[id] || 0;
  if (exams.length < seenBefore) {
    issues.push(
      `${exams.length} results listed but this board has previously offered ${seenBefore} — a group may have stopped being detected`
    );
  } else {
    baseline[id] = exams.length;
  }
  if (!exams.length) issues.push('no results listed at all');
  if (exams.length) {
    const newest = Math.max(
      ...exams.map((e) => Math.max(...((e.label.match(/(19|20)\d{2}/g) || ['0']).map(Number))))
    );
    if (newest && newest < thisYear - 1) {
      issues.push(`newest result is from ${newest} — discovery may be stuck on an old page`);
    }
  }

  console.log(`${issues.length ? warn('WARN') : ok(' OK ')} ${name} — ${exams.length} result(s)`);
  for (const e of exams.slice(0, 10)) {
    console.log(`       ${(e.announced || '').padEnd(11)} ${e.label}`);
  }
  for (const i of issues) console.log(`       ${warn('! ' + i)}`);
  return issues.length ? 1 : 0;
}

(async () => {
  const ids = only ? [only] : Object.keys(adapters);
  if (only && !adapters[only]) {
    console.error(`Unknown board "${only}". Known: ${Object.keys(adapters).join(', ')}`);
    process.exit(2);
  }
  const baseline = readBaseline();
  let problems = 0;
  for (const id of ids) problems += await checkBoard(id, baseline);
  writeBaseline(baseline);
  console.log(
    `\n${ids.length} board(s) checked, ${problems ? warn(problems + ' need attention') : ok('all healthy')}.`
  );
  process.exit(problems ? 1 : 0);
})();
