// In-memory store for captcha-relay sessions (board cookies + form state).
// A session is created when the frontend requests a captcha image and is
// used (and kept updated) by subsequent lookups.
const crypto = require('crypto');

const SESSION_TTL = 15 * 60 * 1000;
const sessions = new Map(); // id -> { board, at, data }

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.at > SESSION_TTL) sessions.delete(id);
  }
}

function create(board, data) {
  cleanup();
  const id = crypto.randomBytes(16).toString('hex');
  sessions.set(id, { board, at: Date.now(), data });
  return id;
}

function get(id) {
  cleanup();
  const s = sessions.get(id);
  if (s) s.at = Date.now();
  return s || null;
}

function remove(id) {
  sessions.delete(id);
}

module.exports = { create, get, remove };
