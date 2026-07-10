// BSE Karachi (Matric) — roll number lookup from result gazette PDFs.
// bsek.edu.pk is a JavaScript app; the gazette PDF links live inside its
// JS bundle, so we fetch the bundle and extract every /pdf/*gazette*.pdf link.
// When the board publishes a new gazette it shows up here automatically.
const { fetchHtml, UA } = require('./utils');
const { getPdfText, searchGazette, prettyName, idFor, pathFor } = require('./gazette');

// The main domain intermittently blocks non-browser traffic with 403, while
// the origin host (stagging.) keeps working — so we try both.
const HOSTS = ['https://bsek.edu.pk/', 'https://stagging.bsek.edu.pk/'];
let workingHost = HOSTS[0];

const exams = []; // dynamic — getExams() extracts the live list from the site bundle

// Known gazettes — used when the main site blocks the discovery request
// (the PDFs themselves stay downloadable from the stagging host).
const FALLBACK_GAZETTES = ['/pdf/general_gazette_2026.pdf'];

let listCache = { at: 0, list: null };

async function fetchHome() {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const html = await fetchHtml(host);
      workingHost = host;
      return html;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;

  let list = [];
  try {
    const home = await fetchHome();
    const bundleMatch = home.match(/src="(\/assets\/[^"]+\.js)"/);
    if (bundleMatch) {
      const res = await fetch(new URL(bundleMatch[1], workingHost).href, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const js = await res.text();
        const seen = new Set();
        for (const m of js.matchAll(/"(\/pdf\/[^"]*gaz+et+e[^"]*\.pdf)"/gi)) {
          const href = m[1];
          if (seen.has(href)) continue;
          seen.add(href);
          list.push({ id: idFor(href), label: prettyName(href) });
        }
      }
    }
  } catch {
    // discovery blocked — fall through to the known list
  }
  if (!list.length) {
    list = FALLBACK_GAZETTES.map((href) => ({ id: idFor(href), label: prettyName(href) }));
  }
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

  let text;
  let lastErr;
  for (const host of [workingHost, ...HOSTS.filter((h) => h !== workingHost)]) {
    try {
      text = await getPdfText(new URL(relPath, host).href);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (text === undefined) throw lastErr;
  return searchGazette({ text, board: 'bsek', exam, rollNo, gazetteName });
}

module.exports = { exams, getExams, lookup };
