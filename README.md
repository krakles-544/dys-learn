# DysLearn — Working Prototype

An AI-based tutor for lower primary pupils with learning difficulties, built per
`proposal 001.docx` / `the concept paper.docx` (Technical University of Kenya,
Purity Bosibori Ondieki, SCCJ/01515/2022).

This is a **functional prototype**, not the full academic-scope system described
in the proposal's Dec 2025–Jun 2026 timeline. It demonstrates all four specific
objectives (§1.4.2) end to end using lighter, faster-to-build technology:

| Proposal's plan | This prototype |
|---|---|
| PHP + MySQL | Node.js + Express + PostgreSQL on Supabase (same schema/ERD), hosted on Vercel |
| Cloud/Python STT & TTS | Browser Web Speech API (built into Chrome/Edge, no setup) |
| Trained ML adaptive model | Rule-based adaptive difficulty engine + rule-based "AI insight" |

The UI follows the client's supplied mockups (`docs/mockups/`): a purple app bar,
rounded friendly typography (Fredoka + Lexend), colour-coded subjects, stat
tiles, and separate **pupil / teacher / parent** portals.

## Requirements

- Node.js 22.9+
- A Supabase project (free tier is fine) — or any PostgreSQL database for local development
- **Google Chrome or Microsoft Edge** (for speech-to-text and text-to-speech —
  Firefox/Safari lack full Web Speech API support; the app falls back to typed
  input if speech isn't available)

## Running it

1. **Create a Supabase project** at supabase.com. Pick the **Central EU (Frankfurt)**
   region — `vercel.json` pins the app's functions to Frankfurt (`fra1`), and keeping
   the two together keeps every database call short. If you choose a different
   region, change `regions` in `vercel.json` to the nearest Vercel region.
2. **Configure environment variables:** copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Supabase → *Connect* → **Transaction pooler** connection
     string (port 6543), with your database password filled in
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — Supabase → *Project Settings
     → API*. The service-role key is a secret: keep it server-side only. Without
     these two the app still runs, but teachers can't attach book PDFs.
   - `SESSION_SECRET` — any long random string
3. **Install, create the tables and load the demo data** (safe to re-run):

   ```bash
   npm install
   npm run setup     # = npm run db:migrate && npm run seed
   ```

4. **Start it:**

   ```bash
   npm start
   ```

   Then open **http://localhost:3001** in Chrome or Edge.

To wipe everything and start over, drop the tables in Supabase (*SQL Editor*) and
run `npm run setup` again.

## Deploying to Vercel

1. Import the GitHub repo in Vercel. No build settings are needed — Vercel detects
   the Express app from `server.js`, and serves `public/` from its CDN.
2. Under *Project Settings → Environment Variables*, add `DATABASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET` (the same
   values as your `.env`, but use a fresh `SESSION_SECRET` for production).
3. Deploy. The schema and seed data are applied from your machine with
   `npm run setup` — the deployed app never changes the schema itself.

## Accessing the data

Everything lives in the Supabase project: the **Table Editor** shows every table
and supports filtering and CSV export, and the **SQL Editor** runs queries. Give
other people access by inviting them under *Organization → Team* with the
least-privileged role that works for them. The tables hold children's personal
data, so treat access under Kenya's Data Protection Act, 2019. Row Level Security
is enabled on every table with no policies, so Supabase's auto-generated public
REST API can't read them; only the app's server connection can.

## Demo accounts

| Role | Login | Password |
|---|---|---|
| Pupil | `purity` | `purity123` |
| Teacher | `teacher@dyslearn.demo` | `teacher123` |
| Parent | `parent@dyslearn.demo` | `parent123` |

Or register a new pupil / teacher / parent account from the login page. A parent
can link a child during registration (or later) with the child's registration
number, e.g. `DL-2026-001`.

## Subjects

Mathematics, English, Social Studies (SST), Kiswahili and Science. Each has a
sample exercise bank at three difficulty tiers (easy / medium / hard). The
adaptive engine moves a pupil's per-subject level 1–5 and snaps to the nearest
authored tier.

## What's implemented

- **Adaptive learning module** — per-pupil, per-subject difficulty (1–5) that
  rises after strong, fast attempts and falls after weak ones (`routes/exercises.js`).
- **Speech-to-text / text-to-speech** — stories, words and page instructions are
  read aloud (`SpeechSynthesis`); pupils can answer by speaking (`SpeechRecognition`)
  or typing (`public/js/speech.js`, `say()` in `public/js/app.js`).
- **Gamified exercises** — Picture Match, Word Scramble (hint-scaffolded retry
  loop) and Listen & Retell, plus arithmetic drills for Mathematics.
- **Pupil dashboard** — stat tiles (attendance, class, overall progress), subject
  cards, recent activity.
- **Book library** — teachers add textbooks / storybooks / workbooks per subject
  and grade, optionally attaching a PDF; pupils browse and download them on the
  Books page (`routes/books.js`).
- **Teacher portal** — register pupils into your class, edit attendance, generate
  a progress report, and send **Guidelines to Parent** (an auto-generated AI
  insight plus your own note).
- **Parent portal** — "My Children's Learning Progress": attendance, overall
  status, active subjects, and the Learning Insights & Recommendations feed.

## What's out of scope

Matches the proposal's own out-of-scope list (§1.6) plus realistic prototype
limits: a real trained ML model, cloud STT/TTS billing setup, full CBC content
curation beyond the sample banks, and government
system integration. The "AI insight" is a transparent rule over attempt history,
not a language model.

## Project structure

```
server.js              Express entry point (exports the app for Vercel)
db/                    Postgres schema, connection pool, migrate + seed scripts, Supabase Storage helper
routes/                auth, student, exercises (adaptive engine), teacher, parent, books, insights (shared helpers)
public/                frontend: login/register, pupil/teacher/parent dashboards, exercise + books pages, CSS/JS
data/content.json      seed exercise content (5 subjects × 3 difficulty tiers)
docs/mockups/          the client's supplied design references
```
