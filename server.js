const express = require('express');
const path = require('path');
const { BOARDS } = require('./src/boards');
const adapters = require('./src/adapters');
const captchaSessions = require('./src/captchaSessions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Board directory (frontend dropdown isi se banta hai)
app.get('/api/boards', async (req, res) => {
  const out = await Promise.all(
    BOARDS.map(async (b) => {
      const adapter = adapters[b.id];
      let exams = adapter ? adapter.exams : [];
      // Some boards (e.g. BIEK) publish their exam/gazette list on the live site
      if (adapter && adapter.getExams) {
        try {
          exams = await adapter.getExams();
        } catch {
          exams = adapter.exams || [];
        }
      }
      return {
        id: b.id,
        name: b.name,
        province: b.province,
        website: b.website,
        resultUrl: b.resultUrl,
        supported: Boolean(adapter),
        needsCaptcha: Boolean(adapter && adapter.needsCaptcha),
        exams,
        note: b.note || null,
      };
    })
  );
  res.json(out);
});

// Captcha relay: fetches the board's captcha image and opens a session
app.get('/api/captcha', async (req, res) => {
  const adapter = adapters[req.query.board];
  if (!adapter || !adapter.startSession) {
    return res.status(404).json({ status: 'error', message: 'This board does not use a captcha' });
  }
  try {
    const { data, image } = await adapter.startSession();
    const sessionId = captchaSessions.create(req.query.board, data);
    res.json({ sessionId, image });
  } catch (err) {
    res.status(502).json({ status: 'error', message: 'Could not load the captcha from the board website: ' + err.message });
  }
});

// Single result lookup
app.get('/api/result', async (req, res) => {
  const { board, exam, rollNo, captcha, sessionId } = req.query;
  if (!board || !rollNo) {
    return res.status(400).json({ status: 'error', message: 'Both board and rollNo are required' });
  }
  const adapter = adapters[board];
  if (!adapter) {
    const info = BOARDS.find((b) => b.id === board);
    return res.status(404).json({
      status: 'unsupported',
      message: 'Direct lookup is not available for this board yet. Please use the official website.',
      resultUrl: info ? info.resultUrl : null,
    });
  }
  try {
    let session = null;
    if (adapter.needsCaptcha) {
      session = sessionId ? captchaSessions.get(sessionId) : null;
      if (!session || session.board !== board) {
        return res.json({
          status: 'badcaptcha',
          board,
          rollNo,
          message: 'The captcha session has expired — please enter the code from the new image',
        });
      }
    }
    const result = await adapter.lookup({ exam, rollNo: String(rollNo).trim(), captcha, session });
    res.json(result);
  } catch (err) {
    res.status(502).json({
      status: 'error',
      message: 'Could not fetch the result from the board website: ' + err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`EIK Result Hub running at: http://localhost:${PORT}`);
});
