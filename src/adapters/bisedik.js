// BISE D.I. Khan — bisedik.edu.pk "current result" form (CodeIgniter, CSRF token,
// no captcha). The board serves whichever result is currently announced.
const cheerio = require('cheerio');
const { UA, cleanHtml, extractTables, splitTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const PAGE = 'https://bisedik.edu.pk/results/current_result';

const exams = []; // dynamic — the board serves one current result

let examCache = { at: 0, list: null };

async function fetchForm() {
  const res = await fetch(PAGE, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const html = await res.text();
  const $ = cheerio.load(html);
  const form = $('#myform');
  return {
    cookie,
    action: form.attr('action') || 'https://bisedik.edu.pk/results/current_result_reponse',
    token: form.find('input[name=csrf_test_name]').attr('value') || '',
    html,
  };
}

// The page states which exam it is serving, e.g. "Result Announced SSC-A-I,2026"
async function getExams() {
  if (examCache.list && Date.now() - examCache.at < 10 * 60 * 1000) return examCache.list;
  try {
    const { html } = await fetchForm();
    const text = htmlToText(html).replace(/\s+/g, ' ');
    const m = text.match(/\b(SSC|HSSC)[-\s]*A[-\s]*(I{1,2})\s*,?\s*((?:19|20)\d{2})/i);
    if (m) {
      const level = m[1].toUpperCase() === 'HSSC' ? 'Inter (HSSC)' : 'Matric (SSC)';
      const label = `${level} — Annual-${m[2].toUpperCase()} ${m[3]}`;
      examCache = { at: Date.now(), list: [{ id: 'current', label }] };
      return examCache.list;
    }
  } catch {
    // heading scrape is cosmetic — lookups work without it
  }
  examCache = { at: Date.now(), list: [] };
  return examCache.list;
}

async function lookup({ exam, rollNo }) {
  const { cookie, action, token } = await fetchForm();
  const body = new URLSearchParams({ csrf_test_name: token, RollNo: rollNo });
  const res = await fetch(action, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: PAGE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const text = htmlToText(html);
  if (/record not found|no record|not found/i.test(text)) {
    return { status: 'notfound', board: 'bisedik', exam, rollNo };
  }

  const allTables = extractTables(html);
  const { dataTables } = splitTables(allTables);
  const pairs = extractPairs(allTables, text);
  const student = pickStudentFields(pairs);

  if (!student.name && !dataTables.length) {
    return { status: 'notfound', board: 'bisedik', exam, rollNo };
  }

  return {
    status: 'found',
    board: 'bisedik',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables: dataTables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
