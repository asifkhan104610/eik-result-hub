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

// Every <table> as rows[cells[]]. Nested-table wrapper rows produce one huge
// merged cell, so those are dropped and duplicate tables collapsed.
function extractTables(html) {
  const $ = cheerio.load(html);
  const tables = [];
  const seen = new Set();
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
        // a cell holding a whole nested table is layout noise, not data
        if (cells.some((c) => c.length > 300)) return;
        if (cells.some((c) => c)) rows.push(cells);
      });
    if (!rows.length) return;
    const sig = JSON.stringify(rows);
    if (seen.has(sig)) return;
    seen.add(sig);
    tables.push(rows);
  });
  return tables;
}

function labelLike(s) {
  return Boolean(s) && s.length <= 40 && /[A-Za-z]/.test(s) && !/^[\d.,%\/-]+$/.test(s);
}

// A label/value row alternates label,value (2, 4 or 6 cells) with a real label
// in every even position. Data rows fail this because they put numbers there.
function isPairRow(cells) {
  if (!cells.length || cells.length % 2 !== 0 || cells.length > 6) return false;
  for (let i = 0; i < cells.length; i += 2) {
    if (!labelLike(cells[i])) return false;
  }
  return true;
}

// Many boards put the student's details and the subject marks in ONE table, so
// a table is split into its leading label/value rows and the data rows below.
// Two leading rows are required, otherwise a data table whose header happens to
// be two cells ("Subject | Marks Obtained") would be misread as student details.
function splitTableRows(rows) {
  let i = 0;
  while (i < rows.length && isPairRow(rows[i])) i++;
  if (i < 2) return { pairRows: [], dataRows: rows };
  // The last "pair" row is really the data table's header when it lines up with
  // the data rows below it (e.g. "S.# | Subject | Theory | Practical").
  if (i < rows.length && rows[i - 1].length === rows[i].length && rows[i - 1].length > 2) i--;
  return { pairRows: rows.slice(0, i), dataRows: rows.slice(i) };
}

function isPairTable(rows) {
  return splitTableRows(rows).pairRows.length > 0;
}

// Splits tables into label/value rows and real data tables (subject marks etc.)
function splitTables(tables) {
  const pairTables = [];
  const dataTables = [];
  for (const rows of tables) {
    const { pairRows, dataRows } = splitTableRows(rows);
    if (pairRows.length) pairTables.push(pairRows);
    if (dataRows.length) dataTables.push(dataRows);
  }
  return { pairTables, dataTables };
}

// Key/value pairs from label/value rows plus "Label: Value" text (best effort)
function extractPairs(tables, text) {
  const pairs = {};
  for (const rows of tables) {
    for (const cells of splitTableRows(rows).pairRows) {
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const k = cells[i].replace(/[:：]\s*$/, '').trim();
        const v = cells[i + 1].trim();
        if (k && v) pairs[k] = v;
      }
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

module.exports = {
  UA, fetchHtml, cleanHtml, extractTables, splitTables, isPairTable,
  extractPairs, htmlToText, pickStudentFields,
};
