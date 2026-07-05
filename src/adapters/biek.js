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

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;
  const html = await fetchHtml(LIST_PAGE);
  const $ = cheerio.load(html);
  const seen = new Set();
  const list = [];
  $('a[href$=".pdf" i]').each((_, a) => {
    const href = ($(a).attr('href') || '').trim();
    if (!href || seen.has(href)) return;
    // only result gazettes — skip With-Held/UFM pages and forms
    if (!/gaz+et+e/i.test(href) && !/gaz+et+e/i.test($(a).text())) return;
    if (/with-?held|ufm/i.test(href)) return;
    seen.add(href);
    list.push({ id: idFor(href), label: prettyName(href) });
  });
  if (!list.length) throw new Error('No gazettes found on BIEK results.asp (the site may have changed)');
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
