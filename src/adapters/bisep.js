// BISE Peshawar — cloud.bisep.edu.pk ka AJAX endpoint (current/latest result)
const { fetchHtml, cleanHtml, extractTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://cloud.bisep.edu.pk/ShowResult.php';

// The board only takes a roll number and always serves the latest announced
// result; we scrape its homepage heading so the dropdown can show which exam
// that actually is (e.g. "HSSC Annual-II Examination 2025").
const exams = [];

let examCache = { at: 0, list: null };

async function getExams() {
  if (examCache.list && Date.now() - examCache.at < 10 * 60 * 1000) return examCache.list;
  try {
    const html = await fetchHtml('https://cloud.bisep.edu.pk/');
    const text = htmlToText(html);
    const m = text.match(/RESULT\s*[-–:]\s*([A-Z0-9 ,&/-]+?(?:EXAMINATION|EXAM)[ ,]*(?:19|20)\d{2})/i);
    if (m) {
      const label = m[1]
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        .replace(/\b(Hssc|Ssc|Hsc)\b/g, (s) => s.toUpperCase())
        .replace(/\bIi\b/g, 'II')
        .replace(/\s+/g, ' ')
        .trim();
      examCache = { at: Date.now(), list: [{ id: 'current', label }] };
      return examCache.list;
    }
  } catch {
    // heading scrape is cosmetic — lookups work without it
  }
  examCache = { at: Date.now(), list: [] };
  return examCache.list;
}

async function lookup({ rollNo }) {
  const url = `${BASE}?Search=RollNo&RollNo=${encodeURIComponent(rollNo)}`;
  const html = await fetchHtml(url, { headers: { Referer: 'https://cloud.bisep.edu.pk/' } });

  const text = htmlToText(html);
  if (/record not found|not found|invalid roll/i.test(text)) {
    return { status: 'notfound', board: 'bisep', rollNo };
  }

  const tables = extractTables(html);
  const pairs = extractPairs(tables, text);
  const student = pickStudentFields(pairs);

  return {
    status: 'found',
    board: 'bisep',
    rollNo,
    student,
    fields: pairs,
    tables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
