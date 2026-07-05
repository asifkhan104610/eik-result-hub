// BSE Karachi (Matric) — roll number lookup from result gazette PDFs.
// bsek.edu.pk is a JavaScript app; the gazette PDF links live inside its
// JS bundle, so we fetch the bundle and extract every /pdf/*gazette*.pdf link.
// When the board publishes a new gazette it shows up here automatically.
const { fetchHtml, UA } = require('./utils');
const { getPdfText, searchGazette, prettyName, idFor, pathFor } = require('./gazette');

const BASE = 'https://bsek.edu.pk/';

const exams = []; // dynamic — getExams() extracts the live list from the site bundle

let listCache = { at: 0, list: null };

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;

  const home = await fetchHtml(BASE);
  const bundleMatch = home.match(/src="(\/assets\/[^"]+\.js)"/);
  if (!bundleMatch) throw new Error('Could not locate the BSEK site bundle (the site may have changed)');

  const res = await fetch(new URL(bundleMatch[1], BASE).href, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Could not download BSEK site bundle (HTTP ${res.status})`);
  const js = await res.text();

  const seen = new Set();
  const list = [];
  for (const m of js.matchAll(/"(\/pdf\/[^"]*gaz+et+e[^"]*\.pdf)"/gi)) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    list.push({ id: idFor(href), label: prettyName(href) });
  }
  if (!list.length) throw new Error('No gazette PDFs found on the BSEK site');
  listCache = { at: Date.now(), list };
  return list;
}

async function lookup({ exam, rollNo }) {
  if (!exam) throw new Error('BSEK requires selecting a gazette');
  if (!/^\d{4,8}$/.test(rollNo)) {
    return { status: 'notfound', board: 'bsek', exam, rollNo };
  }
  const relPath = pathFor(exam);
  const gazettes = await getExams().catch(() => null);
  const gz = gazettes && gazettes.find((g) => g.id === exam);
  const gazetteName = gz ? gz.label : prettyName(relPath);

  const text = await getPdfText(new URL(relPath, BASE).href);
  return searchGazette({ text, board: 'bsek', exam, rollNo, gazetteName });
}

module.exports = { exams, getExams, lookup };
