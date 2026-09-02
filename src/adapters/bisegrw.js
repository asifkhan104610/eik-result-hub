// BISE Gujranwala — result.bisegrw.edu.pk
// The visible page posts its form to result-card.html over AJAX and returns a
// ready-made marks sheet. The session cookie must come from the result
// subdomain; a cookie from www. is rejected with UNAUTHORIZED.
const cheerio = require('cheerio');
const { UA, retry, cleanHtml, extractTables, splitTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://result.bisegrw.edu.pk/';
const LANDING = BASE + '?isannounce=2';
const CARD = BASE + 'result-card.html';

const exams = []; // dynamic

let sessionCookie = null;
let examCache = { at: 0, list: null, form: null };

const CLASS_LABELS = { 9: 'Matric (SSC) Part-I — 9th Class', 10: 'Matric (SSC) Part-II — 10th Class', 11: 'Inter (HSSC) Part-I — 11th Class', 12: 'Inter (HSSC) Part-II — 12th Class' };

async function fetchLanding() {
  const res = await retry(async () => {
    const r = await fetch(LANDING, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  });
  const cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  if (cookie) sessionCookie = cookie;
  return res.text();
}

// The announced exam is described by the form's own hidden class/year fields.
async function getExams() {
  if (examCache.list && Date.now() - examCache.at < 10 * 60 * 1000) return examCache.list;
  const html = await fetchLanding();
  const $ = cheerio.load(html);
  const form = {};
  $('#searchForm input[type=hidden]').each((_, i) => {
    const n = $(i).attr('name');
    if (n) form[n] = $(i).attr('value') || '';
  });
  if (!form.class || !form.year) throw new Error('BISE Gujranwala result form not found (the site may have changed)');

  const label = `${CLASS_LABELS[form.class] || 'Class ' + form.class} — Annual ${form.year}`;
  const list = [{ id: `${form.class}|${form.year}`, label }];
  examCache = { at: Date.now(), list, form };
  return list;
}

async function lookup({ exam, rollNo }) {
  const list = await getExams();
  const form = examCache.form || {};
  const [cls, year] = (exam || list[0].id).split('|');
  if (!sessionCookie) await fetchLanding();

  const body = new URLSearchParams({
    rno: rollNo,
    class: cls,
    resultpage: form.resultpage || '1',
    year,
    check: form.check || '2',
  });
  const res = await retry(async () => fetch(`${CARD}?_=${Date.now()}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: LANDING,
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: body.toString(),
  }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  if (/UNAUTHORIZED/i.test(html)) {
    // the session expired — take a fresh one and let the caller retry
    sessionCookie = null;
    throw new Error('BISE Gujranwala session expired, please try again');
  }

  const text = htmlToText(html);
  if (/invalid roll-?number|no record|not found/i.test(text)) {
    return { status: 'notfound', board: 'bisegrw', exam, rollNo };
  }

  const allTables = extractTables(html);
  const { dataTables } = splitTables(allTables);
  const pairs = extractPairs(allTables, text, html);
  const student = pickStudentFields(pairs);

  if (!student.name && !dataTables.length) {
    return { status: 'notfound', board: 'bisegrw', exam, rollNo };
  }

  // This board labels the totals "Total" (maximum) and "Notification"
  // (obtained), which no generic rule can guess. Its subject table ends with a
  // "Total:  <max>  <obtained>" row, so read the marks from there instead.
  for (const rows of dataTables) {
    const totalRow = rows.find((cells) => /^total/i.test(cells[0] || ''));
    if (!totalRow) continue;
    const numbers = totalRow.slice(1).filter((c) => /^\d+$/.test(c));
    if (numbers.length >= 2) {
      student.totalMarks = numbers[0];
      student.obtainedMarks = numbers[1];
      break;
    }
  }

  return {
    status: 'found',
    board: 'bisegrw',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables: dataTables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
