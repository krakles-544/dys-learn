# DysLearn — Working Prototype

An AI-based tutor for lower primary pupils with learning difficulties, built per
`proposal 001.docx` / `the concept paper.docx` (Technical University of Kenya,
Purity Bosibori Ondieki, SCCJ/01515/2022).

This is a **one-day functional prototype**, not the full academic-scope system
described in the proposal's Dec 2025–Jun 2026 timeline. It demonstrates all four
specific objectives (§1.4.2) end to end using lighter, faster-to-build technology:

| Proposal's plan | This prototype |
|---|---|
| PHP + MySQL | Node.js + Express + SQLite (same schema/ERD, lighter runtime) |
| Cloud/Python STT & TTS | Browser Web Speech API (built into Chrome/Edge, no setup) |
| Trained ML adaptive model | Rule-based adaptive difficulty engine |

## Requirements

- Node.js 18+
- **Google Chrome or Microsoft Edge** (for speech-to-text and text-to-speech —
  Firefox/Safari lack full Web Speech API support; the app falls back to typed
  input if speech isn't available)

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:3001** in Chrome or Edge.

If you ever want to wipe and re-seed the database:

```bash
rm db/dyslearn.sqlite
npm run seed
```

## Demo accounts

| Role | Login | Password |
|---|---|---|
| Pupil | `purity` | `purity123` |
| Teacher | `teacher@dyslearn.demo` | `teacher123` |

Or register a new pupil/teacher account from the login page.

## What's implemented

- **Adaptive learning module** — each pupil has a per-subject difficulty level
  (1–5) that rises after strong, fast attempts and falls after weak ones
  (`routes/exercises.js`).
- **Speech-to-text / text-to-speech** — stories and words are read aloud
  (`SpeechSynthesis`); pupils can answer by speaking (`SpeechRecognition`) or
  typing if the mic/browser isn't available (`public/js/speech.js`).
- **Gamified exercises** — Picture Match (drag/click-match), Word Scramble,
  and Listen & Retell (dictation of a short story).
- **Educator dashboard** — pupil list, attempt history, and an auto-generated
  progress report (average score, strengths, challenges).

## What's out of scope for today

Matches the proposal's own out-of-scope list (§1.6) plus realistic one-day
limits: a real trained ML model, cloud STT/TTS billing setup, Kiswahili
bilingual toggle, full CBC content curation beyond the sample English/Literacy
bank, production deployment/hosting, and government system integration. The
`Math` subject is seeded in the database to prove the schema generalizes, but
has no exercise content authored yet.

## Project structure

```
server.js            Express entry point
db/                   SQLite schema, connection helper, seed script
routes/               auth, student, exercises (adaptive engine), teacher
public/               frontend: login/register/dashboards/exercise pages + CSS/JS
data/content.json     seed exercise content (3 difficulty tiers)
```
