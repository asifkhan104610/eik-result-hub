// BISE Sahiwal — result.bisesahiwal.edu.pk
// The form posts to a per-exam PHP page (index9A26Process.php = 9th Annual
// 2026); the exam page is discovered from the live form rather than hardcoded.
// Its "captcha" is generated and checked in the browser, so the server accepts
// the roll number on its own. Out-of-range roll numbers make the board's own
// script error, which is reported as "not found" rather than a failure.
const cheerio = require('cheerio');
const { UA, retry, fetchHtml, cleanHtml, extractTables, splitTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://result.bisesahiwal.edu.pk/';

const exams = []; // dynamic

let examCache = { at: 0, list: null, action: null };

// index9A26Process.php -> 9th class, Annual, 2026
function describeAction(action) {
  const m = action.match(/index(\d{1,2})([AS])(\d{2})/i);
  if (!m) return action.replace(/Process\.php$/i, '');
  const cls = { 9: 'Matric (SSC) Part-I — 9th Class', 10: 'Matric (SSC) Part-II — 10th Class', 11: 'Inter (HSSC) Part-I — 11th Class', 12: 'Inter (HSSC) Part-II — 12th Class' }[Number(m[1])] || `Class ${m[1]}`;
  const session = m[2].toUpperCase() === 'A' ? 'Annual' : 'Supplementary';
  return `${cls} — ${session} 20${m[3]}`;
}

async function loadConfig() {
  if (examCache.action && Date.now() - examCache.at < 10 * 60 * 1000) return examCache;
  const html = await fetchHtml(BASE);
  const $ = cheerio.load(html);
  const action = $('form[action*="Process.php" i]').attr('action');
  if (!action) throw new Error('BISE Sahiwal result form not found (the site may have changed)');
  examCache = { at: Date.now(), action, list: [{ id: action, label: describeAction(action) }] };
  return examCache;
}

async function getExams() {
  return (await loadConfig()).list;
}

async function lookup({ exam, rollNo }) {
  const cfg = await loadConfig();
  const action = exam || cfg.action;

  const res = await retry(() =>
    fetch(new URL(action, BASE).href, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: BASE,
      },
      body: new URLSearchParams({ rno: rollNo, CaptchaInput: '0000', commit: 'Search' }).toString(),
    })
  );

  // the board's page throws a 500 for roll numbers outside the exam's range
  if (res.status >= 500) {
    return { status: 'notfound', board: 'bisesahiwal', exam: action, rollNo };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html.trim()) {
    return { status: 'notfound', board: 'bisesahiwal', exam: action, rollNo };
  }

  const text = htmlToText(html);
  if (/no record|not found|invalid roll/i.test(text)) {
    return { status: 'notfound', board: 'bisesahiwal', exam: action, rollNo };
  }

  const allTables = extractTables(html);
  const { dataTables } = splitTables(allTables);
  const pairs = extractPairs(allTables, text, html);
  const student = pickStudentFields(pairs);

  if (!student.name) {
    return { status: 'notfound', board: 'bisesahiwal', exam: action, rollNo };
  }

  return {
    status: 'found',
    board: 'bisesahiwal',
    exam: action,
    rollNo,
    student,
    fields: pairs,
    tables: dataTables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
