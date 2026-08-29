// BIE Karachi (Inter) — roll number lookup from result gazette PDFs.
// biek.edu.pk/results.asp lists one gazette PDF per group; we download it
// and search the text for the roll number.
const cheerio = require('cheerio');
const { fetchHtml } = require('./utils');
const { getPdfText, searchGazette, prettyName, idFor, pathFor } = require('./gazette');

const BASE = 'https://biek.edu.pk/';
const LIST_PAGE = BASE + 'results.asp';

const exams = []; // dynamic — getExams() reads the live list from results.asp

let listCache = { at: 0, list: null };

// Anything published under a Result-<year>/ path is a result gazette. The board
// names its files inconsistently — "SCIENCE PRE-MEDICAL.pdf" and "Humanities
// Private.pdf" carry no "gazette" in the name — so requiring that word silently
// hid whole groups. Everything is accepted except these known non-results.
const NOT_A_RESULT = /with-?held|ufm|unfair|notice|form|schedule|instruction|challan|syllabus|admission/i;

// The link text is the board's own description and carries the announcement
// date, e.g. "Science Pre-Medical Part-II (31-07-2026)".
function parseLinkText(raw) {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  const dateMatch = text.match(/\(\s*(\d{1,2})[-/](\d{1,2})[-/]((?:19|20)\d{2})\s*\)/);
  let announced = null;
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    // built in UTC so the printed date cannot slip a day behind the board's
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(dt.getTime())) announced = dt.toISOString().slice(0, 10);
  }
  const label = text.replace(/\(\s*\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\s*\)/, '').replace(/\s+/g, ' ').trim();
  return { label, announced };
}

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;
  const html = await fetchHtml(LIST_PAGE);
  const $ = cheerio.load(html);

  // the page heading names the exam these gazettes belong to, e.g.
  // "RESULTS OF ANNUAL EXAMINATIONS 2026 PART-II"
  const heading = (
    $('body').text().replace(/\s+/g, ' ')
      .match(/RESULTS? OF ([A-Za-z]+(?: EXAMINATIONS?)? (?:19|20)\d{2}(?: PART-I{1,2})?)/i) || [, '']
  )[1]
    .replace(/EXAMINATIONS?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const seen = new Set();
  const list = [];
  $('a[href$=".pdf" i]').each((_, a) => {
    const href = ($(a).attr('href') || '').trim();
    if (!href || seen.has(href)) return;
    const linkText = $(a).text();
    if (NOT_A_RESULT.test(href) || NOT_A_RESULT.test(linkText)) return;
    // accept result-folder PDFs and anything still calling itself a gazette
    if (!/(^|\/)result[-_]?\d{4}\//i.test(href) && !/gaz+et+e/i.test(href) && !/gaz+et+e/i.test(linkText)) return;
    seen.add(href);

    const { label, announced } = parseLinkText(linkText);
    const year = (href.match(/(?:^|\/)result[-_]?((?:19|20)\d{2})\//i) || [])[1];
    const name = label || prettyName(href);
    list.push({
      id: idFor(href),
      // the board's own wording, plus the exam year when the label lacks one
      label: year && !name.includes(year) ? `${name} ${year}` : name,
      announced,
      exam: heading || null,
    });
  });
  if (!list.length) throw new Error('No gazettes found on BIEK results.asp (the site may have changed)');

  // newest announcement first, undated entries last
  list.sort((a, z) => (z.announced || '').localeCompare(a.announced || ''));
  listCache = { at: Date.now(), list };
  return list;
}

async function lookup({ exam, rollNo }) {
  if (!exam) throw new Error('BIEK requires selecting a group/gazette');
  if (!/^\d{4,8}$/.test(rollNo)) {
    return { status: 'notfound', board: 'biek', exam, rollNo };
  }
  const relPath = pathFor(exam);
  const gazettes = await getExams().catch(() => null);
  const gz = gazettes && gazettes.find((g) => g.id === exam);
  const gazetteName = gz ? gz.label : prettyName(relPath);

  const text = await getPdfText(new URL(relPath, BASE).href);
  return searchGazette({ text, board: 'biek', exam, rollNo, gazetteName });
}

module.exports = { exams, getExams, lookup };
