// Federal Board (FBISE) — portal.fbise.edu.pk ka public result.php endpoint
const { fetchHtml, cleanHtml, extractTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://portal.fbise.edu.pk/fbise-conduct/result/result.php';

// Fallback list — getExams() scrapes the live options from fbise.edu.pk so new
// sessions appear automatically; this is only used if that scrape fails.
const exams = [
  { id: 'SSC-I', label: 'SSC-I (9th) — 1st Annual 2025' },
  { id: 'SSC-II', label: 'SSC-II (Matric) — 1st Annual 2025' },
  { id: 'SSC-I-2nd', label: 'SSC-I — 2nd Annual 2025' },
  { id: 'SSC-II-2nd', label: 'SSC-II (Matric) — 2nd Annual 2025' },
  { id: 'HSSC-I', label: 'HSSC-I (1st Year) — 1st Annual 2025' },
  { id: 'HSSC-II', label: 'HSSC-II (Inter) — 1st Annual 2025' },
  { id: 'HSSC-I-2nd', label: 'HSSC-I — 2nd Annual 2025' },
  { id: 'HSSC-II-2nd', label: 'HSSC-II (Inter) — 2nd Annual 2025' },
  { id: 'SSC-I-TECH', label: 'SSC-I (Matric-Tech) 2025' },
  { id: 'SSC-II-TECH', label: 'SSC-II (Matric-Tech) 2025' },
  { id: 'HSSC-I-TECH', label: 'HSSC-I (Inter-Tech) 2025' },
  { id: 'HSSC-II-TECH', label: 'HSSC-II (Inter-Tech) 2025' },
];

let examCache = { at: 0, list: null };

async function getExams() {
  if (examCache.list && Date.now() - examCache.at < 10 * 60 * 1000) return examCache.list;
  try {
    const cheerio = require('cheerio');
    const html = await fetchHtml('https://result.fbise.edu.pk/');
    const $ = cheerio.load(html);
    const seen = new Set();
    const list = [];
    $('select[name=class] option').each((_, o) => {
      const id = ($(o).attr('value') || '').trim();
      const label = $(o).text().replace(/\s+/g, ' ').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({ id, label });
    });
    if (list.length) {
      examCache = { at: Date.now(), list };
      return list;
    }
  } catch {
    // fall back to the static list below
  }
  examCache = { at: Date.now(), list: exams };
  return exams;
}

async function lookup({ exam, rollNo }) {
  if (!exam) throw new Error('FBISE requires selecting an exam/class');
  const url = `${BASE}?class=${encodeURIComponent(exam)}&rollNo=${encodeURIComponent(rollNo)}&name=&reg_no=`;
  const html = await fetchHtml(url);

  const text = htmlToText(html);
  const tables = extractTables(html);
  const pairs = extractPairs(tables, text);
  const student = pickStudentFields(pairs);

  // Khaali card = sirf "RESULT CARD - <roll>" heading, koi aur data nahi
  const meaningful = text.replace(/RESULT CARD\s*-?\s*\d*/i, '').trim();
  if (!meaningful || /no record|not found|invalid/i.test(text)) {
    return { status: 'notfound', board: 'fbise', exam, rollNo };
  }

  return {
    status: 'found',
    board: 'fbise',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
