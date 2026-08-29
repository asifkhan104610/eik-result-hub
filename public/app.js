// ====== SITE CONFIGURATION — edit these for your website ======
// Links shown after a successful result ("keep browsing" tiles).
const EXPLORE_LINKS = [
  { icon: '🏫', label: 'Latest Admissions', url: 'https://educationinkarachi.net/admissions-update/' },
  { icon: '🔎', label: 'Find Admission Programs', url: 'https://educationinkarachi.net/program-finder/' },
  { icon: '📝', label: 'MDCAT / ECAT Practice Tests', url: 'https://educationinkarachi.net/practice-tests/' },
  { icon: '📄', label: 'Build Your Free CV', url: 'https://educationinkarachi.net/free-cv-builder/' },
];

// Upcoming results (edit freely — shown in the "Upcoming Results" section)
const UPCOMING_RESULTS = [
  { icon: '📘', board: 'Punjab Boards', exam: 'Matric (SSC) Annual 2026' },
  { icon: '📗', board: 'FBISE', exam: 'SSC-II Annual 2026' },
  { icon: '📙', board: 'KP Boards', exam: 'Matric (SSC) Annual 2026' },
  { icon: '📕', board: 'BSEK Karachi', exam: 'Science Group 2026' },
  { icon: '📒', board: 'All Boards', exam: 'Inter (HSSC) Annual 2026' },
];

// Your WordPress site — the "Result News & Announcements" section shows the
// latest posts of this category automatically (via the WP REST API).
const WP_SITE = 'https://educationinkarachi.net';
const WP_CATEGORY = 'latest-results';
// ====== end configuration ======

let BOARDS = [];
let captchaSessionId = null;

const $ = (id) => document.getElementById(id);

// ---------- init ----------
async function init() {
  const res = await fetch('/api/boards');
  BOARDS = await res.json();

  const sel = $('board');
  const provinces = [...new Set(BOARDS.map((b) => b.province))];
  for (const prov of provinces) {
    const og = document.createElement('optgroup');
    og.label = prov;
    for (const b of BOARDS.filter((x) => x.province === prov)) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name + (b.supported ? ' ✓' : '');
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  sel.addEventListener('change', onBoardChange);

  // default to the board with the most recently announced result
  const newest = BOARDS.filter((b) => b.supported && b.exams.length)
    .sort((a, z) => latestYear(z.exams[0].label) - latestYear(a.exams[0].label))[0];
  if (newest) sel.value = newest.id;

  onBoardChange();
  renderLatestResults();
  renderUpcoming();
  renderNews();
}

// ---------- latest / upcoming / news sections ----------
// Boards do not publish announcement dates in machine-readable form, so we
// sort by the most recent exam year in the label (newest first).
function latestYear(label) {
  const years = (label.match(/(19|20)\d{2}/g) || ['0']).map(Number);
  return Math.max(...years);
}

function renderLatestResults() {
  const grid = $('latestGrid');
  const items = BOARDS.filter((b) => b.supported && b.exams.length)
    .map((b) => ({ board: b, exam: b.exams[0] }))
    .sort((a, z) => latestYear(z.exam.label) - latestYear(a.exam.label));
  if (!items.length) return;
  for (const { board: b, exam } of items) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mini-card';
    card.setAttribute('aria-label', `Check ${b.name} — ${exam.label}`);
    const emoji = document.createElement('span');
    emoji.className = 'mc-emoji';
    emoji.textContent = '🏛️';
    const body = document.createElement('div');
    body.className = 'mc-body';
    body.innerHTML = '<div class="mc-board"></div><div class="mc-exam"></div>';
    body.firstElementChild.textContent = b.name;
    body.lastElementChild.textContent = exam.label;
    const go = document.createElement('span');
    go.className = 'mc-go';
    go.textContent = '→';
    card.append(emoji, body, go);
    card.addEventListener('click', () => {
      $('board').value = b.id;
      onBoardChange();
      if (!$('examField').hidden) $('exam').value = exam.id;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      $('rollNo').focus({ preventScroll: true });
    });
    grid.appendChild(card);
  }
  $('latestSection').hidden = false;
}

function renderUpcoming() {
  const grid = $('upcomingGrid');
  for (const u of UPCOMING_RESULTS) {
    const card = document.createElement('div');
    card.className = 'mini-card';
    card.style.cursor = 'default';
    const emoji = document.createElement('span');
    emoji.className = 'mc-emoji';
    emoji.textContent = u.icon;
    const body = document.createElement('div');
    body.className = 'mc-body';
    body.innerHTML = '<div class="mc-board"></div><div class="mc-exam"></div><div class="mc-date"></div>';
    body.children[0].textContent = u.board;
    body.children[1].textContent = u.exam;
    body.children[2].textContent = 'Coming Soon 🔜';
    card.append(emoji, body);
    grid.appendChild(card);
  }
}

// Latest posts from the WordPress "results" category (live dates & announcements)
async function renderNews() {
  if (!WP_SITE || !WP_CATEGORY) return;
  try {
    const base = WP_SITE.replace(/\/$/, '') + '/wp-json/wp/v2';
    const catRes = await fetch(`${base}/categories?slug=${encodeURIComponent(WP_CATEGORY)}&_fields=id`);
    const cats = await catRes.json();
    if (!cats.length) return;
    const postsRes = await fetch(`${base}/posts?categories=${cats[0].id}&per_page=6&_fields=id,title,link,date`);
    const posts = await postsRes.json();
    if (!Array.isArray(posts) || !posts.length) return;

    const grid = $('newsGrid');
    for (const p of posts) {
      const a = document.createElement('a');
      a.className = 'mini-card';
      a.href = p.link;
      a.target = '_top';
      a.rel = 'noopener';
      const emoji = document.createElement('span');
      emoji.className = 'mc-emoji';
      emoji.textContent = '📰';
      const body = document.createElement('div');
      body.className = 'mc-body';
      body.innerHTML = '<div class="mc-board"></div><div class="mc-date"></div>';
      body.children[0].innerHTML = p.title.rendered; // WP returns sanitized title HTML
      body.children[1].textContent = new Date(p.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });
      // fresh posts (under 14 days old) get a NEW badge
      if (Date.now() - new Date(p.date).getTime() < 14 * 24 * 60 * 60 * 1000) {
        const badge = document.createElement('span');
        badge.className = 'badge-new';
        badge.textContent = 'NEW';
        body.children[0].appendChild(badge);
      }
      const go = document.createElement('span');
      go.className = 'mc-go';
      go.textContent = '→';
      a.append(emoji, body, go);
      grid.appendChild(a);
    }
    $('newsSection').hidden = false;
  } catch {
    // site unreachable or REST API disabled — section simply stays hidden
  }
}

function currentBoard() {
  return BOARDS.find((b) => b.id === $('board').value);
}

function onBoardChange() {
  const b = currentBoard();
  if (!b) return;

  // exam dropdown
  const examField = $('examField');
  const examSel = $('exam');
  examSel.innerHTML = '';
  if (b.exams && b.exams.length) {
    for (const e of b.exams) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.label;
      examSel.appendChild(opt);
    }
    examField.hidden = false;
  } else {
    examField.hidden = true;
  }

  // supported vs link-only
  $('lookupCard').hidden = !b.supported;
  $('unsupportedCard').hidden = b.supported;
  if (!b.supported) {
    $('unsupportedMsg').textContent =
      (b.note || 'Direct lookup is not available for this board yet.') +
      ' Use the button below to open the official result page:';
    $('officialLink').href = b.resultUrl || b.website;
  }

  $('boardNote').hidden = true;
  if (b.supported && b.needsCaptcha) {
    $('boardNote').textContent = b.note || 'This board shows a captcha — type the code from the image below.';
    $('boardNote').hidden = false;
  } else if (b.supported && b.exams.length === 0) {
    $('boardNote').textContent = 'This board only takes a roll number and shows the latest announced result.';
    $('boardNote').hidden = false;
  }

  // captcha box for captcha-protected boards
  $('captchaBox').hidden = !(b.supported && b.needsCaptcha);
  $('captchaInput').value = '';
  captchaSessionId = null;
  if (b.supported && b.needsCaptcha) loadCaptcha();

  $('singleResult').innerHTML = '';
}

async function loadCaptcha() {
  const b = currentBoard();
  if (!b || !b.needsCaptcha) return;
  const img = $('captchaImg');
  img.alt = 'Loading captcha…';
  img.removeAttribute('src');
  captchaSessionId = null;
  $('captchaInput').value = '';
  try {
    const res = await fetch('/api/captcha?board=' + encodeURIComponent(b.id));
    const data = await res.json();
    if (!res.ok || !data.image) throw new Error(data.message || 'HTTP ' + res.status);
    captchaSessionId = data.sessionId;
    img.src = data.image;
    img.alt = 'Captcha';
  } catch (e) {
    img.alt = 'Captcha failed to load — click ⟳';
  }
}

$('captchaRefresh').addEventListener('click', loadCaptcha);

// ---------- lookup ----------
async function lookupOne(rollNo) {
  const b = currentBoard();
  const params = new URLSearchParams({ board: b.id, rollNo });
  if (!$('examField').hidden) params.set('exam', $('exam').value);
  if (b.needsCaptcha) {
    params.set('captcha', $('captchaInput').value.trim());
    if (captchaSessionId) params.set('sessionId', captchaSessionId);
  }
  const res = await fetch('/api/result?' + params.toString());
  const data = await res.json().catch(() => ({ status: 'error', message: 'Invalid response from server' }));
  if (!res.ok && data.status !== 'unsupported') {
    return { status: 'error', rollNo, message: data.message || 'HTTP ' + res.status };
  }
  return { rollNo, ...data };
}

// ---------- single ----------
$('checkBtn').addEventListener('click', async () => {
  const rollNo = $('rollNo').value.trim();
  if (!rollNo) return $('rollNo').focus();
  const btn = $('checkBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Checking…';
  $('singleResult').innerHTML = '';
  try {
    const r = await lookupOne(rollNo);
    $('singleResult').appendChild(renderResult(r));
    if (r.status === 'badcaptcha') loadCaptcha();
  } catch (e) {
    $('singleResult').appendChild(renderResult({ status: 'error', rollNo, message: e.message }));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check Result';
  }
});
$('rollNo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('checkBtn').click(); });

function renderResult(r) {
  const wrap = document.createElement('div');
  wrap.className = 'result-card';

  const head = document.createElement('div');
  head.className = 'result-head ' + (r.status === 'found' ? 'found' : r.status === 'notfound' ? 'notfound' : 'error');
  head.textContent =
    r.status === 'found' ? `✔ Result found — Roll No ${r.rollNo}` :
    r.status === 'notfound' ? `Roll No ${r.rollNo} — no record found` :
    r.status === 'badcaptcha' ? `Captcha problem: ${r.message || 'please retry with the new image'}` :
    `Roll No ${r.rollNo} — error: ${r.message || 'unknown error'}`;
  wrap.appendChild(head);

  // "Not found" is usually the right answer for the wrong exam session, so
  // explain what this board is actually serving and link to its own page.
  if (r.status !== 'found') {
    const b = currentBoard();
    const body = document.createElement('div');
    body.className = 'result-body';

    if (r.status === 'notfound') {
      const exam = !$('examField').hidden && $('exam').selectedOptions[0];
      const tips = document.createElement('ul');
      tips.className = 'tips';
      const items = [
        r.note ||
          (exam
            ? `This board was searched for: ${exam.textContent}. If your result is from a different exam or year, pick that one above.`
            : 'This board only publishes its most recently announced result.'),
        'Check the roll number for typos — it must match your admit card exactly.',
        'If the result was announced only minutes ago, the board may still be updating its system.',
      ];
      for (const t of items) {
        const li = document.createElement('li');
        li.textContent = t;
        tips.appendChild(li);
      }
      body.appendChild(tips);
    } else if (r.message) {
      const p = document.createElement('p');
      p.textContent = r.message;
      body.appendChild(p);
    }

    if (b && (b.resultUrl || b.website)) {
      const a = document.createElement('a');
      a.className = 'btn-link official';
      a.href = b.resultUrl || b.website;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `Open ${b.name} official result page ↗`;
      body.appendChild(a);
    }
    wrap.appendChild(body);
    return wrap;
  }

  const body = document.createElement('div');
  body.className = 'result-body';

  // all label/value fields from the board (fall back to normalized student fields)
  const kv = document.createElement('div');
  kv.className = 'kv';
  let kvData = r.fields && Object.keys(r.fields).length ? r.fields : null;
  if (!kvData) {
    const labels = {
      name: 'Name', fatherName: 'Father Name', group: 'Group', institute: 'Institute',
      obtainedMarks: 'Obtained Marks', totalMarks: 'Total Marks', grade: 'Grade', status: 'Result/Status',
    };
    kvData = {};
    for (const [key, label] of Object.entries(labels)) {
      if (r.student && r.student[key]) kvData[label] = r.student[key];
    }
  }
  let shown = 0;
  for (const [label, v] of Object.entries(kvData)) {
    if (!v) continue;
    kv.insertAdjacentHTML('beforeend', `<div class="k"></div><div class="v"></div>`);
    kv.children[kv.children.length - 2].textContent = label;
    kv.lastElementChild.textContent = v;
    shown++;
  }
  if (shown) body.appendChild(kv);

  // data tables (pure label/value tables are already shown in the grid above)
  for (const rows of r.tables || []) {
    if (rows.length < 2) continue;
    if (shown && rows.every((cells) => cells.length <= 2)) continue;
    const table = document.createElement('table');
    table.className = 'res';
    rows.forEach((cells, i) => {
      const tr = document.createElement('tr');
      cells.forEach((c) => {
        const td = document.createElement(i === 0 ? 'th' : 'td');
        td.textContent = c;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  // board ka asli result card (sandboxed)
  if (r.rawHtml) {
    const det = document.createElement('details');
    det.innerHTML = "<summary>View the board's original result card</summary>";
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', '');
    iframe.srcdoc = r.rawHtml;
    det.appendChild(iframe);
    body.appendChild(det);
  }

  // keep-browsing tiles (links to the main website)
  const explore = document.createElement('div');
  explore.className = 'explore';
  explore.innerHTML = '<div class="explore-title">What\'s next? Keep exploring 👇</div>';
  const eg = document.createElement('div');
  eg.className = 'explore-grid';
  for (const item of EXPLORE_LINKS) {
    const a = document.createElement('a');
    a.className = 'explore-tile';
    a.href = item.url;
    a.target = '_top';
    a.rel = 'noopener';
    const ico = document.createElement('span');
    ico.textContent = item.icon;
    const lbl = document.createElement('span');
    lbl.textContent = item.label;
    a.append(ico, lbl);
    eg.appendChild(a);
  }
  explore.appendChild(eg);
  body.appendChild(explore);

  wrap.appendChild(body);
  return wrap;
}

init();
