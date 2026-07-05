// BISE Kohat — bisekt.edu.pk/current_result/ (PHP form, captcha-protected).
// Same captcha relay as BISE Lahore: user types the code from the board's image.
const cheerio = require('cheerio');
const { UA, cleanHtml, extractTables, extractPairs, htmlToText, pickStudentFields } = require('./utils');

const PAGE = 'https://bisekt.edu.pk/current_result/';

const needsCaptcha = true;

// The Kohat page does not name the exam it currently serves, so the most
// honest label is "Latest Announced Result"
const LEVEL_LABELS = {
  matric: 'Matric (SSC) — Latest Announced Result',
  ssc: 'Matric (SSC) — Latest Announced Result',
  hssc: 'Inter (HSSC) — Latest Announced Result',
};

const exams = []; // dynamic

let listCache = { at: 0, list: null };

async function fetchBase() {
  const res = await fetch(PAGE, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { html: await res.text(), cookie };
}

function parseForms(html) {
  const $ = cheerio.load(html);
  const forms = [];
  $('form').each((_, f) => {
    if (!$(f).find('input[name=captcha_input]').length) return;
    const hidden = {};
    $(f)
      .find('input[type=hidden]')
      .each((_, i) => {
        hidden[$(i).attr('name')] = $(i).attr('value') || '';
      });
    forms.push({ hidden });
  });
  const captchaSrc = $('img[src*="captchass"]').first().attr('src') || null;
  return { forms, captchaSrc };
}

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;
  const { html } = await fetchBase();
  const { forms } = parseForms(html);
  const list = [];
  const seen = new Set();
  for (const f of forms) {
    const level = (f.hidden.matric || 'result').toLowerCase();
    if (seen.has(level)) continue;
    seen.add(level);
    list.push({ id: level, label: LEVEL_LABELS[level] || `Latest Announced Result (${level.toUpperCase()})` });
  }
  if (!list.length) throw new Error('Could not find the result form on the BISE Kohat page');
  listCache = { at: Date.now(), list };
  return list;
}

async function startSession() {
  const { html, cookie } = await fetchBase();
  const { captchaSrc } = parseForms(html);
  if (!captchaSrc) throw new Error('Could not find the captcha image on the BISE Kohat page');

  const imgRes = await fetch(new URL(captchaSrc, PAGE).href, {
    headers: { 'User-Agent': UA, Referer: PAGE, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!imgRes.ok) throw new Error(`Could not download the captcha image (HTTP ${imgRes.status})`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get('content-type') || 'image/png';

  return {
    data: { cookie },
    image: `data:${mime};base64,${buf.toString('base64')}`,
  };
}

async function lookup({ exam, rollNo, captcha, session }) {
  if (!session || !captcha) {
    return { status: 'badcaptcha', board: 'bisekt', exam, rollNo, message: 'Please enter the captcha code shown in the image' };
  }
  const { cookie } = session.data;

  const params = new URLSearchParams({
    matric: exam || 'hssc',
    roll_no: rollNo,
    captcha_input: captcha,
  });
  const res = await fetch(PAGE, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: PAGE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const text = htmlToText(html);
  if (/captcha/i.test(text) && /invalid|incorrect|wrong|mismatch/i.test(text)) {
    return { status: 'badcaptcha', board: 'bisekt', exam, rollNo, message: 'The board rejected the captcha code — please try the new image' };
  }
  if (/no record|not found|invalid roll/i.test(text)) {
    return { status: 'notfound', board: 'bisekt', exam, rollNo };
  }

  const tables = extractTables(html);
  const pairs = extractPairs(tables, text);
  const student = pickStudentFields(pairs);

  if (!student.name && tables.every((t) => t.length < 3)) {
    return {
      status: 'badcaptcha',
      board: 'bisekt',
      exam,
      rollNo,
      message: 'No result returned — the captcha code may be wrong, or there is no record for this roll number',
    };
  }

  return {
    status: 'found',
    board: 'bisekt',
    exam,
    rollNo,
    student,
    fields: pairs,
    tables,
    rawHtml: cleanHtml(html),
  };
}

module.exports = { exams, getExams, startSession, lookup, needsCaptcha };
