// BISE Faisalabad — ASP.NET result pages, no captcha.
// MatricResults.aspx / InterResults.aspx: pick an exam session, POST the roll number.
const cheerio = require('cheerio');
const { UA, cleanHtml, extractTables } = require('./utils');

const PAGES = {
  matric: { url: 'https://bisefsd.edu.pk/MatricResults.aspx', label: 'Matric' },
  inter: { url: 'https://bisefsd.edu.pk/InterResults.aspx', label: 'Inter' },
};

const exams = []; // dynamic

let listCache = { at: 0, list: null };

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { html: await res.text(), cookies };
}

async function getExams() {
  if (listCache.list && Date.now() - listCache.at < 10 * 60 * 1000) return listCache.list;
  const list = [];
  for (const [level, page] of Object.entries(PAGES)) {
    try {
      const { html } = await fetchPage(page.url);
      const $ = cheerio.load(html);
      $('#ContentPlaceHolder1_ddlExam option').each((i, o) => {
        if (i >= 10) return; // recent sessions only
        list.push({
          id: `${level}:${$(o).attr('value')}`,
          label: `${page.label} — ${$(o).text().trim()}`,
        });
      });
    } catch {
      // if one level's page is down, still offer the other
    }
  }
  if (!list.length) throw new Error('Could not load exam sessions from BISE Faisalabad');
  listCache = { at: Date.now(), list };
  return list;
}

async function lookup({ exam, rollNo }) {
  if (!exam || !exam.includes(':')) throw new Error('BISE Faisalabad requires selecting an exam session');
  const [level, examValue] = exam.split(':');
  const page = PAGES[level];
  if (!page) throw new Error('Unknown exam level for BISE Faisalabad');

  const { html, cookies } = await fetchPage(page.url);
  const $ = cheerio.load(html);
  const hidden = {};
  $('input[type=hidden]').each((_, i) => {
    hidden[$(i).attr('name')] = $(i).attr('value') || '';
  });

  const params = new URLSearchParams({
    ...hidden,
    'ctl00$ContentPlaceHolder1$ddlExam': examValue,
    'ctl00$ContentPlaceHolder1$txtRollNo': rollNo,
    'ctl00$ContentPlaceHolder1$btnResult': ' Get Result',
  });
  const res = await fetch(page.url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: page.url,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html2 = await res.text();

  if (/strNoResult\s*=\s*'[12]'/.test(html2)) {
    return { status: 'notfound', board: 'bisefsd', exam, rollNo };
  }

  const $$ = cheerio.load(html2);
  const name = $$('#ContentPlaceHolder1_lblNameValue').text().trim();
  const father = $$('#ContentPlaceHolder1_lblFatherValue').text().trim();
  if (!name) {
    return { status: 'notfound', board: 'bisefsd', exam, rollNo };
  }

  const panel = $$('#ContentPlaceHolder1_Panel1');
  const panelHtml = panel.length ? $$.html(panel) : null;
  const tables = panelHtml ? extractTables(panelHtml) : [];
  const totalMatch = $$('#printSection').text().match(/Notification:\s*(\d+)/);

  return {
    status: 'found',
    board: 'bisefsd',
    exam,
    rollNo,
    student: {
      rollNo,
      name,
      fatherName: father,
      obtainedMarks: totalMatch ? totalMatch[1] : null,
    },
    fields: {},
    tables,
    rawHtml: panelHtml ? cleanHtml(panelHtml) : null,
  };
}

module.exports = { exams, getExams, lookup };
