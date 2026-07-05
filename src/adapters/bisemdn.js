// BISE Mardan — result.bisemdn.edu.pk (form-based POST, exam codes homepage se dynamically)
const cheerio = require('cheerio');
const { fetchHtml, cleanHtml, extractTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'https://result.bisemdn.edu.pk/';

const exams = [
  { id: 'ssc', label: 'Matric (SSC)' },
  { id: 'hssc', label: 'Inter (HSSC)' },
];

// Builds real exam names from the hidden Year/Session fields of the live
// forms, e.g. "Inter (HSSC) — Annual-II 2025"
async function getExams() {
  try {
    const forms = await getForms();
    const seen = new Set();
    const list = [];
    for (const f of forms) {
      if (seen.has(f.module)) continue;
      seen.add(f.module);
      const level = f.module.startsWith('hssc') ? 'Inter (HSSC)' : 'Matric (SSC)';
      const year = f.hidden.Year || '';
      const session =
        f.hidden.Session === '2' ? 'Annual-II' :
        f.hidden.Session === '1' ? 'Annual-I' :
        f.hidden.Session ? `Session ${f.hidden.Session}` : '';
      const detail = [session, year].filter(Boolean).join(' ');
      list.push({ id: f.module, label: detail ? `${level} — ${detail}` : level });
    }
    if (list.length) return list;
  } catch {
    // fall back to the static list if the site is unreachable
  }
  return exams;
}

let formCache = { at: 0, forms: null };

// Homepage pe har exam ka apna form hota hai (hidden ExamCode/Year/Session ke saath)
async function getForms() {
  if (formCache.forms && Date.now() - formCache.at < 10 * 60 * 1000) return formCache.forms;
  const html = await fetchHtml(BASE);
  const $ = cheerio.load(html);
  const forms = [];
  $('form').each((_, f) => {
    const action = $(f).attr('action') || '';
    const m = action.match(/module=(\w+)/i);
    if (!m) return;
    const hidden = {};
    $(f)
      .find('input[type=hidden]')
      .each((_, inp) => {
        const n = $(inp).attr('name');
        if (n) hidden[n] = $(inp).attr('value') || '';
      });
    forms.push({ module: m[1].toLowerCase(), action, hidden });
  });
  if (!forms.length) throw new Error('Could not find Mardan board result forms (the site may have changed)');
  formCache = { at: Date.now(), forms };
  return forms;
}

async function lookup({ exam, rollNo }) {
  const forms = await getForms();
  const wanted = (exam || 'ssc').toLowerCase();
  const form =
    forms.find((f) => f.module === wanted) ||
    forms.find((f) => f.module.startsWith(wanted)) ||
    forms[0];

  const params = new URLSearchParams({ ...form.hidden, RollNo: rollNo });
  const url = new URL(form.action, BASE).href;
  const html = await fetchHtml(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE },
    body: params.toString(),
  });

  const text = htmlToText(html);
  if (/no record|not found|invalid roll|record nahi/i.test(text)) {
    return { status: 'notfound', board: 'bisemdn', exam, rollNo };
  }

  const tables = extractTables(html);
  const pairs = extractPairs(tables, text);
  const student = pickStudentFields(pairs);

  // Agar koi table/pairs hi nahi mile to record nahi samjho
  if (!tables.length && !Object.keys(pairs).length) {
    return { status: 'notfound', board: 'bisemdn', exam, rollNo };
  }

  return {
    status: 'found',
    board: 'bisemdn',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, lookup };
