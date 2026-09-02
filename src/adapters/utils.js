const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// On result day the boards' own servers are overloaded and drop connections at
// random. Result lookups are read-only, so one quick retry turns a scary error
// into a normal answer for the student.
async function retry(fn, tries = 3, delayMs = 700) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // a real "not found" or rejected request should not be retried
      if (/HTTP 4\d\d/.test(e.message)) break;
      if (attempt < tries) await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

async function fetchOnce(url, options = {}) {
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

function fetchHtml(url, options = {}) {
  return retry(() => fetchOnce(url, options));
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
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// A nested table makes its wrapper cell repeat everything the inner cells hold.
// That duplicate is layout noise, so it is dropped when the rest of the row
// already says the same thing.
function dropWrapperCells(cells) {
  if (cells.length < 3) return cells;
  const joined = norm(cells.slice(1).join(' '));
  if (joined && norm(cells[0]) === joined) return cells.slice(1);
  return cells;
}

function extractTables(html) {
  const $ = cheerio.load(html);
  const tables = [];
  $('table').each((_, t) => {
    const rows = [];
    $(t)
      .find('tr')
      .each((_, tr) => {
        let cells = [];
        $(tr)
          .find('th, td')
          .each((_, td) => {
            cells.push(norm($(td).text()));
          });
        // a cell holding a whole nested table is layout noise, not data
        if (cells.some((c) => c.length > 300)) return;
        cells = dropWrapperCells(cells);
        if (cells.some((c) => c)) rows.push(cells);
      });
    // A lone single-cell row is a caption ("DETAIL OF MARKS OBTAINED..."), not
    // data. Left in place it would break the label/value scan below it.
    const body = rows.filter((cells) => cells.length > 1);
    if (body.length) tables.push(body);
    else if (rows.length) tables.push(rows);
  });

  // Outer tables repeat their inner tables' rows, so a table whose rows all
  // appear inside a bigger one is dropped rather than shown twice.
  const sigs = tables.map((rows) => rows.map((cells) => JSON.stringify(cells)));
  return tables.filter((rows, i) =>
    !sigs.some((other, j) => {
      if (j === i || other.length < sigs[i].length) return false;
      if (other.length === sigs[i].length && j > i) return false; // keep the first of equals
      return sigs[i].every((row) => other.includes(row));
    })
  );
}

function labelLike(s) {
  return Boolean(s) && s.length <= 40 && /[A-Za-z]/.test(s) && !/^[\d.,%\/-]+$/.test(s);
}

// A label/value row alternates label,value (2, 4 or 6 cells) with a real label
// in every even position. Data rows fail this because they put numbers there.
// Some boards lay a whole row of details out as one long label,value,label,value
// strip, so width is not capped tightly; requiring a real label in every even
// position is what keeps data rows out, since those put numbers there.
function isPairRow(cells) {
  if (!cells.length || cells.length % 2 !== 0 || cells.length > 16) return false;
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

// Not every board uses a table for the student's details — some mark them up as
// a definition list, where the labels never reach the table or text scans.
function extractDefinitions(html) {
  const pairs = {};
  if (!html) return pairs;
  const $ = cheerio.load(html);
  // Boards often wrap each dt/dd couple in its own <div> for grid layout, so
  // the pair is found by proximity rather than by being adjacent children.
  $('dt').each((_, el) => {
    const dt = $(el);
    let dd = dt.next('dd');
    if (!dd.length) dd = dt.parent().find('dd').first();
    if (!dd.length) return;
    const k = dt.text().replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
    const v = dd.text().replace(/\s+/g, ' ').trim();
    if (k && v && k.length <= 40) pairs[k] = v;
  });
  return pairs;
}

// Key/value pairs from label/value rows, definition lists, and "Label: Value"
// text — in that order of trust (best effort)
function extractPairs(tables, text, html) {
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
  for (const [k, v] of Object.entries(extractDefinitions(html))) {
    if (!(k in pairs)) pairs[k] = v;
  }
  const re = /([A-Za-z][A-Za-z .\/()']{2,35})\s*[:：]\s*([^\n:：]{1,80})/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const k = m[1].trim();
    const v = m[2].trim();
    // Running prose also contains colons, which yields sentence fragments as
    // keys ("didate has passed and obtained marks"). Real labels are short and
    // start on a word boundary, so anything longer with a lowercase start is
    // treated as prose rather than a field.
    if (k.split(/\s+/).length > 3 && /^[a-z]/.test(k)) continue;
    if (!(k in pairs) && v) pairs[k] = v;
  }
  return pairs;
}

function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// Maps a board's own labels onto the fields the app displays
function pickStudentFields(pairs) {
  // `accept` lets a caller insist on a certain shape of value — marks fields
  // ask for digits, because boards also spell the total out in words
  // ("Four Hundred Two Only.") under a similar label.
  const find = (opts, ...keys) => {
    const accept = (opts && opts.accept) || (() => true);
    const entries = Object.entries(pairs).filter(([, v]) => v && accept(String(v)));
    for (const key of keys) {
      const exact = entries.find(([k]) => k.toLowerCase().trim() === key);
      if (exact) return exact[1];
    }
    for (const key of keys) {
      const hit = entries.find(([k]) => {
        const lk = k.toLowerCase();
        if (!lk.includes(key)) return false;
        // a bare "marks" search must not settle for "Total Marks" or "Remarks"
        if (key === 'marks' && (lk.includes('total') || lk.includes('remark'))) return false;
        return true;
      });
      if (hit) return hit[1];
    }
    return null;
  };
  const numeric = { accept: (v) => /\d/.test(v) };

  return {
    name: find(null, 'student name', 'candidate name', 'name of candidate', 'name'),
    fatherName: find(null, "father's name", 'father name', 'father'),
    rollNo: find(null, 'roll no', 'roll number', 'roll'),
    group: find(null, 'group', 'subjects'),
    institute: find(null, 'institution', 'school', 'college', 'institute'),
    totalMarks: find(numeric, 'total marks', 'maximum marks', 'max marks'),
    obtainedMarks: find(numeric, 'marks obtained', 'obtained marks', 'total obtained', 'marks'),
    grade: find(null, 'grade'),
    status: find(null, 'result', 'status', 'remarks'),
  };
}

module.exports = {
  UA, fetchHtml, retry, cleanHtml, extractTables, splitTables, isPairTable,
  extractPairs, extractDefinitions, htmlToText, pickStudentFields,
};
