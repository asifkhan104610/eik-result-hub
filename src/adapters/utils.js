const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchHtml(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*',
        ...(options.headers || {}),
      },
      body: options.body,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Scripts/iframes hata kar display ke liye mehfooz HTML fragment banata hai
function cleanHtml(html) {
  const $ = cheerio.load(html);
  $('script, iframe, link, meta, noscript').remove();
  const body = $('body');
  return (body.length ? body.html() : $.html()) || '';
}

// Har <table> ko rows[cells[]] mein nikalta hai
function extractTables(html) {
  const $ = cheerio.load(html);
  const tables = [];
  $('table').each((_, t) => {
    const rows = [];
    $(t)
      .find('tr')
      .each((_, tr) => {
        const cells = [];
        $(tr)
          .find('th, td')
          .each((_, td) => {
            cells.push($(td).text().replace(/\s+/g, ' ').trim());
          });
        if (cells.some((c) => c)) rows.push(cells);
      });
    if (rows.length) tables.push(rows);
  });
  return tables;
}

// "Label: Value" ya 2-column table rows se key/value pairs (best effort)
function extractPairs(tables, text) {
  const pairs = {};
  for (const rows of tables) {
    for (const cells of rows) {
      // only true label/value rows — wider rows are data tables, and pairing
      // their header cells produces junk like "Sr.#: Subject"
      if (cells.length !== 2) continue;
      const k = cells[0].replace(/[:：]\s*$/, '').trim();
      const v = cells[1].trim();
      if (k && v && k.length <= 40 && !/^\d+$/.test(k)) pairs[k] = v;
    }
  }
  const re = /([A-Za-z][A-Za-z .\/()']{2,35})\s*[:：]\s*([^\n:：]{1,80})/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const k = m[1].trim();
    const v = m[2].trim();
    if (!(k in pairs) && v) pairs[k] = v;
  }
  return pairs;
}

function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// Common labels se student ke fields normalize karta hai
function pickStudentFields(pairs) {
  const find = (...keys) => {
    for (const key of keys) {
      const exact = Object.keys(pairs).find((k) => k.toLowerCase().trim() === key);
      if (exact && pairs[exact]) return pairs[exact];
    }
    for (const key of keys) {
      const hit = Object.keys(pairs).find((k) => {
        const lk = k.toLowerCase();
        if (!lk.includes(key)) return false;
        // "marks" ki generic search "Total Marks"/"Remarks" ko na pakre
        if (key === 'marks' && (lk.includes('total') || lk.includes('remark'))) return false;
        return true;
      });
      if (hit && pairs[hit]) return pairs[hit];
    }
    return null;
  };
  return {
    name: find('student name', 'candidate name', 'name of candidate', 'name'),
    fatherName: find("father's name", 'father name', 'father'),
    rollNo: find('roll no', 'roll number', 'roll'),
    group: find('group', 'subjects'),
    institute: find('institution', 'school', 'college', 'institute'),
    totalMarks: find('total marks', 'maximum marks'),
    obtainedMarks: find('marks obtained', 'obtained marks', 'total obtained', 'marks'),
    grade: find('grade'),
    status: find('result', 'status', 'remarks'),
  };
}

module.exports = { UA, fetchHtml, cleanHtml, extractTables, extractPairs, htmlToText, pickStudentFields };
