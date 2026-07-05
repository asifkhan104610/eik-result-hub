// BISE Lahore — result.biselahore.com (ASP.NET, captcha-protected).
// Captcha relay: the server fetches the board's captcha image and shows it to
// the user; the user types it and the lookup is submitted with their answer.
const cheerio = require('cheerio');
const { UA, cleanHtml, extractTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const BASE = 'http://result.biselahore.com/';

const needsCaptcha = true;
const exams = []; // dynamic

let listCache = { at: 0, list: null };

function parsePage(html) {
  const $ = cheerio.load(html);
  const hidden = {};
  $('input[type=hidden]').each((_, i) => {
    hidden[$(i).attr('name')] = $(i).attr('value') || '';
  });
  const captchaSrc = $('#imgCaptcha').attr('src') || null;
  return { $, hidden, captchaSrc };
}

async function fetchBase() {
  const res = await fetch(BASE, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { html: await res.text(), cookie };
}

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;
  const { html } = await fetchBase();
  const { $ } = parsePage(html);
  const types = [];
  $('#ddlExamType option').each((_, o) => types.push({ value: $(o).attr('value'), label: $(o).text().trim() }));
  const years = [];
  $('#ddlExamYear option').each((i, o) => {
    if (i < 3) years.push($(o).attr('value')); // latest 3 years
  });
  const list = [];
  for (const course of [{ v: 'SSC', l: 'Matric (SSC)' }, { v: 'HSSC', l: 'Inter (HSSC)' }]) {
    for (const year of years) {
      for (const t of types) {
        list.push({ id: `${course.v}|${t.value}|${year}`, label: `${course.l} — ${t.label} ${year}` });
      }
    }
  }
  if (!list.length) throw new Error('Could not load exam options from BISE Lahore');
  listCache = { at: Date.now(), list };
  return list;
}

// Creates a captcha session: fetches the form page + captcha image
async function startSession() {
  const { html, cookie } = await fetchBase();
  const { hidden, captchaSrc } = parsePage(html);
  if (!captchaSrc) throw new Error('Could not find the captcha image on the BISE Lahore page');

  const imgRes = await fetch(new URL(captchaSrc, BASE).href, {
    headers: { 'User-Agent': UA, Referer: BASE, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!imgRes.ok) throw new Error(`Could not download the captcha image (HTTP ${imgRes.status})`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get('content-type') || 'image/png';

  return {
    data: { cookie, hidden },
    image: `data:${mime};base64,${buf.toString('base64')}`,
  };
}

async function lookup({ exam, rollNo, captcha, session }) {
  if (!exam || !exam.includes('|')) throw new Error('BISE Lahore requires selecting an exam');
  if (!session || !captcha) {
    return { status: 'badcaptcha', board: 'biselahore', exam, rollNo, message: 'Please enter the captcha code shown in the image' };
  }
  const [course, examType, year] = exam.split('|');
  const { cookie, hidden } = session.data;

  const params = new URLSearchParams({
    __LASTFOCUS: '',
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    ...hidden,
    rdlistCourse: course,
    txtFormNo: rollNo,
    ddlExamType: examType,
    ddlExamYear: year,
    txtCaptcha: captcha,
    Button1: 'View Result',
  });
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // keep the session usable for the next lookup (bulk mode reuses the captcha)
  const { hidden: newHidden } = parsePage(html);
  if (newHidden.__VIEWSTATE) session.data.hidden = newHidden;

  const text = htmlToText(html);
  if (/invalid|incorrect|wrong/i.test(text) && /captcha|code/i.test(text)) {
    return { status: 'badcaptcha', board: 'biselahore', exam, rollNo, message: 'The board rejected the captcha code — please try the new image' };
  }
  if (/no record|not found|does not exist/i.test(text)) {
    return { status: 'notfound', board: 'biselahore', exam, rollNo };
  }

  const tables = extractTables(html);
  const pairs = extractPairs(tables, text);
  const student = pickStudentFields(pairs);

  // If the page still looks like the blank search form, the captcha was
  // probably rejected silently
  if (!student.name && tables.every((t) => t.length < 3)) {
    return {
      status: 'badcaptcha',
      board: 'biselahore',
      exam,
      rollNo,
      message: 'No result returned — the captcha code may be wrong, or there is no record for this roll number',
    };
  }

  return {
    status: 'found',
    board: 'biselahore',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, startSession, lookup, needsCaptcha };
