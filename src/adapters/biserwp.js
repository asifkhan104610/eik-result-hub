// BISE Rawalpindi — biserwp.edu.pk
// The board publishes each result as a static page, <exam>/<rollNo>.html, and
// its homepage script holds both the current exam folder and the valid roll
// ranges. A missing roll number simply 404s.
const { UA, retry, fetchHtml, cleanHtml, extractTables, splitTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://biserwp.edu.pk/';

const exams = []; // dynamic

let examCache = { at: 0, list: null, folder: null, ranges: [] };

// The homepage script reads like:
//   if ((x > 500000 && x < 563981) || (x > 600000 && x < 660116)) {
//       var k = "SSC-I-A-2026/" + x + ".html";
async function loadConfig() {
  if (examCache.folder && Date.now() - examCache.at < 10 * 60 * 1000) return examCache;

  const html = await fetchHtml(BASE);
  const folder = (html.match(/var\s+k\s*=\s*"([^"]+?)\/"\s*\+/) || [])[1];
  if (!folder) throw new Error('BISE Rawalpindi result folder not found (the site may have changed)');

  const ranges = [];
  for (const m of html.matchAll(/x\s*>\s*(\d{4,7})\s*&&\s*x\s*<\s*(\d{4,7})/g)) {
    ranges.push([Number(m[1]), Number(m[2])]);
  }

  const text = htmlToText(html).replace(/\s+/g, ' ');
  const heading = (text.match(/RESULT OF ([A-Z0-9()\- ]+?EXAMINATION,?\s*(?:19|20)\d{2})/i) || [])[1];
  const label = heading
    ? heading.replace(/EXAMINATION,?/i, '').replace(/\s+/g, ' ').trim()
    : folder.replace(/[-_]/g, ' ');

  examCache = { at: Date.now(), list: [{ id: folder, label }], folder, ranges };
  return examCache;
}

async function getExams() {
  const cfg = await loadConfig();
  return cfg.list;
}

async function lookup({ exam, rollNo }) {
  const cfg = await loadConfig();
  const folder = exam || cfg.folder;

  // the board's own page refuses out-of-range roll numbers before requesting
  if (cfg.ranges.length && !cfg.ranges.some(([lo, hi]) => Number(rollNo) > lo && Number(rollNo) < hi)) {
    return { status: 'notfound', board: 'biserwp', exam: folder, rollNo };
  }

  const url = `${BASE}${folder}/${encodeURIComponent(rollNo)}.html`;
  const res = await retry(() =>
    fetch(url, { headers: { 'User-Agent': UA, Referer: BASE } })
  );
  if (res.status === 404) {
    return { status: 'notfound', board: 'biserwp', exam: folder, rollNo };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const text = htmlToText(html);
  const allTables = extractTables(html);
  const { dataTables } = splitTables(allTables);
  const pairs = extractPairs(allTables, text, html);
  const student = pickStudentFields(pairs);

  if (!student.name) {
    return { status: 'notfound', board: 'biserwp', exam: folder, rollNo };
  }

  return {
    status: 'found',
    board: 'biserwp',
    exam: folder,
    rollNo,
    student,
    fields: pairs,
    tables: dataTables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
