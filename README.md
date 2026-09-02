---
title: EIK Result Hub
emoji: 🎓
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# EIK Result Hub

A web app for checking Pakistani education board results — single roll number or a full class list (bulk), with Excel/CSV export.

## How to run

```
npm install   (first time only)
npm start
```

Then open **http://localhost:3000** in your browser.

## Features

- Directory of **27 boards** (Federal, KP, Punjab, Sindh, Balochistan, AJK, GB)
- **Direct lookup** (enter a roll number, see the result on screen) — 14 boards:
  - Federal Board (FBISE) — SSC/HSSC, annual/tech, all classes
  - BISE Peshawar, Mardan, Abbottabad, D.I. Khan — KP
  - BISE Lahore, Rawalpindi, Gujranwala, Faisalabad, Sahiwal, D.G. Khan — Punjab
  - BSE Karachi (Matric) and BIE Karachi (Inter) — looked up from result gazette PDFs
- **Captcha relay** for captcha-protected boards (BISE Lahore, BISE Kohat): the app shows the board's captcha image, you type the code, and the lookup goes through.
- `npm run check` — health check over every adapter; warns when a board starts offering fewer results than it has before, which is what a silently broken discovery filter looks like.
- Remaining boards get a direct link to their official result page

## Adding a new board

1. Create `src/adapters/<boardId>.js` exporting `{ exams, lookup }`
   (`lookup({ exam, rollNo })` → `{ status, student, fields, tables, rawHtml }`).
   Optionally export `getExams()` if the exam list should be fetched live, and
   `startSession()` + `needsCaptcha: true` for captcha-protected boards
   (see `biselahore.js` for the pattern).
2. Register it in `src/adapters/index.js`
3. Make sure the board has an entry in `src/boards.js`

## Notes

- Results come **live from the boards' official websites** — if a board's site is down or its system changes, the adapter needs updating
- Bulk mode waits 0.5 s between requests to avoid stressing board servers
- Gazette PDFs are cached in memory for 12 hours, so checking a whole class is fast after the first lookup
- Board sites can be slow during result season
