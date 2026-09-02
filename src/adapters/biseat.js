// BISE Abbottabad — biseatd.edu.pk/all_results.php
// The form is submitted over AJAX to get_results.php. Class and year come from
// the live dropdowns; the session dropdown is filled in by the page's own
// script, so the sessions below mirror what that script offers.
const cheerio = require('cheerio');
const { UA, retry, fetchHtml, cleanHtml, extractTables, splitTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://www.biseatd.edu.pk/';
const PAGE = BASE + 'all_results.php';
const ENDPOINT = BASE + 'get_results.php';

const SESSIONS = [
  { id: '1', label: 'Annual' },
  { id: '2', label: 'Supplementary' },
];

const exams = []; // dynamic

let examCache = { at: 0, list: null };

async function getExams() {
  if (examCache.list && Date.now() - examCache.at < 10 * 60 * 1000) return examCache.list;
  const html = await fetchHtml(PAGE);
  const $ = cheerio.load(html);

  const options = (name) => {
    const out = [];
    $(`select[name="${name}"] option`).each((_, o) => {
      const value = ($(o).attr('value') || '').trim();
      const label = $(o).text().trim();
      if (value && value !== '0' && !/please select/i.test(label)) out.push({ value, label });
    });
    return out;
  };

  const classes = options('class');
  const years = options('Year').slice(0, 3); // recent years only
  if (!classes.length || !years.length) {
    throw new Error('BISE Abbottabad result form not found (the site may have changed)');
  }

  const list = [];
  for (const c of classes) {
    for (const y of years) {
      for (const s of SESSIONS) {
        list.push({
          id: `${c.value}|${y.value}|${s.id}`,
          label: `${c.label} — ${s.label} ${y.value}`,
        });
      }
    }
  }
  examCache = { at: Date.now(), list };
  return list;
}

async function lookup({ exam, rollNo }) {
  if (!exam || !exam.includes('|')) throw new Error('BISE Abbottabad requires selecting an exam');
  const [cls, year, session] = exam.split('|');

  const res = await retry(() =>
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAGE,
      },
      body: new URLSearchParams({
        class: cls,
        Year: year,
        Session: session,
        RollNo: rollNo,
        submit: 'Search',
      }).toString(),
    })
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const text = htmlToText(html);
  if (/no results? found|no record|not found/i.test(text)) {
    return { status: 'notfound', board: 'biseat', exam, rollNo };
  }

  const allTables = extractTables(html);
  const { dataTables } = splitTables(allTables);
  const pairs = extractPairs(allTables, text, html);
  const student = pickStudentFields(pairs);

  if (!student.name) {
    return { status: 'notfound', board: 'biseat', exam, rollNo };
  }

  return {
    status: 'found',
    board: 'biseat',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables: dataTables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
