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

// BSEK names its gazettes <group>_gazette_<year>.pdf — probing these
// candidates finds new gazettes even while the homepage blocks us.
const GROUPS = ['science', 'general', 'commerce', 'humanities', 'technical'];

// Sample/"students week"/notice PDFs live in the same folder as the gazettes
const NOT_A_RESULT = /sample|studentsweek|students week|with-?held|ufm|notice|form|schedule|challan|syllabus|graph|line/i;

let listCache = { at: 0, list: null };

// The board links gazettes on its site before uploading the file, so every
// candidate is confirmed to be a real PDF before it reaches the dropdown.
async function isRealPdf(path) {
  for (const host of [workingHost, ...HOSTS.filter((h) => h !== workingHost)]) {
    try {
      const res = await fetch(new URL(path, host).href, {
        headers: { 'User-Agent': UA, Range: 'bytes=0-3' },
      });
      res.body && res.body.cancel && res.body.cancel().catch(() => {});
      // missing files come back as an HTML error page, so the content type —
      // not the status — decides whether a gazette is really there
      const type = res.headers.get('content-type') || '';
      if ((res.ok || res.status === 206) && /pdf/i.test(type)) return true;
    } catch {
      // host unreachable — try the next one
    }
  }
  return false;
}

function candidatePaths() {
  const year = new Date().getFullYear();
  const paths = [];
  for (const group of GROUPS) {
    for (const y of [year, year - 1]) paths.push(`/pdf/${group}_gazette_${y}.pdf`);
  }
  return paths;
}

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

  // Candidates come from the site's own bundle, from guessing the board's
  // <group>_gazette_<year>.pdf naming, and from the known-good fallback list.
  const candidates = new Set();
  try {
    const home = await fetchHome();
    const bundleMatch = home.match(/src="(\/assets\/[^"]+\.js)"/);
    if (bundleMatch) {
      const res = await fetch(new URL(bundleMatch[1], workingHost).href, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const js = await res.text();
        // Take every result PDF, not only ones named "gazette" — boards rename
        // these freely, and a keyword filter silently hides whole groups.
        for (const m of js.matchAll(/"(\/pdf\/[^"]+\.pdf)"/gi)) {
          const href = m[1];
          if (NOT_A_RESULT.test(href)) continue;
          if (/gaz+et+e|result|group|science|general|commerce|humanities/i.test(href)) candidates.add(href);
        }
      }
    }
  } catch {
    // discovery blocked — the probe and fallback list still apply
  }
  for (const p of candidatePaths()) candidates.add(p);
  for (const p of FALLBACK_GAZETTES) candidates.add(p);

  const checked = await Promise.all(
    [...candidates].map(async (href) => ((await isRealPdf(href)) ? href : null))
  );
  const list = checked
    .filter(Boolean)
    .map((href) => ({ id: idFor(href), label: prettyName(href) }));

  // newest year first so "Latest Released Results" and the default
  // selection pick up a newly announced gazette automatically
  const yearOf = (label) => Math.max(...(label.match(/(19|20)\d{2}/g) || ['0']).map(Number));
  list.sort((a, z) => yearOf(z.label) - yearOf(a.label));

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
