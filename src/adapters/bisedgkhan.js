// BISE D.G. Khan — bisedgkhan.edu.pk
// The homepage is the result search itself: it posts a CSRF token plus the roll
// number back to itself and renders the result card inline.
const cheerio = require('cheerio');
const { UA, retry, cleanHtml, extractTables, splitTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://bisedgkhan.edu.pk/';

const exams = []; // dynamic — the board serves one announced result at a time

let examCache = { at: 0, list: null };

async function fetchForm() {
  const res = await retry(async () => {
    const r = await fetch(BASE, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  });
  const cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const html = await res.text();
  const $ = cheerio.load(html);
  return { cookie, csrf: $('input[name=csrf]').attr('value') || '', html };
}

// The page names the exam it is serving, e.g.
// "SSC (Part-I/9th Class) First Annual Examination, 2026"
async function getExams() {
  if (examCache.list && Date.now() - examCache.at < 10 * 60 * 1000) return examCache.list;
  try {
    const { html } = await fetchForm();
    const text = htmlToText(html).replace(/\s+/g, ' ');
    const m = text.match(/((?:SSC|HSSC)[^,.]{0,40}(?:First|Second|1st|2nd|Annual)[^,.]{0,25}Examination),?\s*((?:19|20)\d{2})/i);
    if (m) {
      examCache = { at: Date.now(), list: [{ id: 'current', label: `${m[1].trim()} ${m[2]}` }] };
      return examCache.list;
    }
  } catch {
    // naming the exam is cosmetic — lookups still work without it
  }
  examCache = { at: Date.now(), list: [] };
  return examCache.list;
}

async function lookup({ exam, rollNo }) {
  const { cookie, csrf } = await fetchForm();
  const res = await retry(async () => fetch(BASE, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams({ csrf, rno: rollNo }).toString(),
  }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const text = htmlToText(html);
  if (/no record|not found|invalid roll|incorrect/i.test(text)) {
    return { status: 'notfound', board: 'bisedgkhan', exam, rollNo };
  }

  const allTables = extractTables(html);
  const { dataTables } = splitTables(allTables);
  const pairs = extractPairs(allTables, text, html);
  const student = pickStudentFields(pairs);

  if (!student.name) {
    return { status: 'notfound', board: 'bisedgkhan', exam, rollNo };
  }

  // The totals are not labelled — they sit in a closing "RESULT" row of the
  // subject table written as "<obtained>/<total>".
  for (const rows of dataTables) {
    const resultRow = rows.find((cells) => /^result/i.test(cells[0] || ''));
    const marks = resultRow && resultRow.slice(1).map((c) => c.match(/^(\d+)\s*\/\s*(\d+)$/)).find(Boolean);
    if (marks) {
      student.obtainedMarks = marks[1];
      student.totalMarks = marks[2];
      break;
    }
  }

  return {
    status: 'found',
    board: 'bisedgkhan',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables: dataTables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
