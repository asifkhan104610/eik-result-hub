// Shared helpers for boards that publish results as gazette PDFs
// (BIEK, BSEK). Format in these PDFs: ROLLNO(MARKS) or ROLLNO(MARKS+ GRACE)
const pdfParse = require('pdf-parse');
const { UA } = require('./utils');

const pdfCache = new Map(); // url -> { at, text }
const PDF_TTL = 12 * 60 * 60 * 1000;

async function getPdfText(url) {
  const hit = pdfCache.get(url);
  if (hit && Date.now() - hit.at < PDF_TTL) return hit.text;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`Could not download gazette PDF (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const parsed = await pdfParse(buf);
    pdfCache.set(url, { at: Date.now(), text: parsed.text });
    return parsed.text;
  } finally {
    clearTimeout(timer);
  }
}

// Searches a gazette's text for a roll number; returns a normalized result
function searchGazette({ text, board, exam, rollNo, gazetteName }) {
  // ROLLNO(MARKS), ROLLNO(MARKS+ GRACE), ROLLNO(MARKS^ N)
  const re = new RegExp(rollNo + '\\s*\\(\\s*(\\d+)\\s*(?:([+^])\\s*(\\d+))?\\s*\\)');
  const m = re.exec(text);

  if (m) {
    const base = parseInt(m[1], 10);
    const extra = m[3] ? parseInt(m[3], 10) : 0;
    const total = m[2] === '+' ? base + extra : base;
    const marksLabel = m[2] === '+' ? `${base} + ${extra} (grace) = ${total}` : String(base);
    return {
      status: 'found',
      board,
      exam,
      rollNo,
      student: { rollNo, obtainedMarks: String(total), status: 'PASS (listed in gazette)' },
      fields: {
        'Roll No': rollNo,
        Marks: marksLabel,
        Result: 'PASS — listed in gazette',
        Gazette: gazetteName,
      },
      tables: [],
      rawHtml: null,
    };
  }

  // Roll number mentioned without marks (withheld/UFM lists etc.)
  if (new RegExp('\\b' + rollNo + '\\b').test(text)) {
    return {
      status: 'found',
      board,
      exam,
      rollNo,
      student: { rollNo, status: 'Mentioned in gazette without marks (possibly withheld/UFM)' },
      fields: {
        'Roll No': rollNo,
        Note: 'Mentioned in gazette but no marks listed — contact the board',
        Gazette: gazetteName,
      },
      tables: [],
      rawHtml: null,
    };
  }

  return {
    status: 'notfound',
    board,
    exam,
    rollNo,
    note: 'Roll number not found in this gazette — the group may be wrong, or the candidate is not in the pass list',
  };
}

// Known group-name abbreviations used in gazette filenames
const ABBREV = {
  HE: 'Home Economics',
  SG: 'Science General',
  HG: 'Humanities General',
};

const EXAM_WORDS = new Set([
  'HSC', 'HSSC', 'SSC', 'PART', 'I', 'II', 'IX', 'X', 'XI', 'XII',
  'ANNUAL', 'SUPPLEMENTARY', 'SUPPLY', 'SPECIAL', 'CLASS', 'EXAM', 'EXAMINATION',
]);

const KEEP_UPPER = new Set(['HSC', 'HSSC', 'SSC', 'I', 'II', 'IX', 'X', 'XI', 'XII']);

function titleToken(t) {
  if (KEEP_UPPER.has(t)) return t;
  return t.charAt(0) + t.slice(1).toLowerCase();
}

// Turns a gazette filename into a friendly label,
// e.g. "general_gazette_2026.pdf" -> "General Group Result 2026",
// "RESULT-GAZZETTE-PRE-ENGINEERING-HSC-PART-II-SUPPLEMENTARY-2025.pdf"
//   -> "Pre-Engineering — HSC Part-II Supplementary 2025"
function prettyName(relPath) {
  const raw = decodeURIComponent(relPath.split('/').pop() || relPath)
    .replace(/\.pdf$/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\b(result|gaz+z*et+e*s?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return relPath.toUpperCase();

  const tokens = raw.toUpperCase().split(' ');
  let year = null;
  const groupTokens = [];
  const examTokens = [];
  for (const t of tokens) {
    if (/^(19|20)\d{2}$/.test(t)) year = t;
    else if (EXAM_WORDS.has(t)) examTokens.push(t);
    else groupTokens.push(ABBREV[t] || titleToken(t));
  }

  // merge PART I / PART II into Part-I / Part-II
  const exam = examTokens
    .map(titleToken)
    .join(' ')
    .replace(/\bPart (I{1,2})\b/g, 'Part-$1');

  let group = groupTokens.join(' ').replace(/\bPre (Engineering|Medical)\b/gi, 'Pre-$1');

  if (!exam) {
    // plain "<group> <year>" gazette (e.g. BSEK) -> "<Group> Group Result <year>"
    const label = [group, group && !/group/i.test(group) ? 'Group' : '', 'Result', year]
      .filter(Boolean)
      .join(' ');
    return label.trim();
  }
  return [group, group ? '—' : '', exam, year].filter(Boolean).join(' ').replace(/\s+/g, ' ');
}

const idFor = (relPath) => Buffer.from(relPath).toString('base64url');
const pathFor = (id) => Buffer.from(id, 'base64url').toString();

module.exports = { getPdfText, searchGazette, prettyName, idFor, pathFor };
