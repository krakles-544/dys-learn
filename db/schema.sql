-- DysLearn schema, adapted from proposal 001.docx §5.5.1 data dictionary.
-- Two tables (exercises, student_difficulty) are pragmatic additions: the
-- proposal's dictionary only covered logging attempts, not the content bank
-- itself or the per-student adaptive difficulty state.

CREATE TABLE IF NOT EXISTS teachers (
  teacher_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  firstname      TEXT NOT NULL,
  lastname       TEXT NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  mobile         TEXT,
  subject        TEXT,
  userpassword   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  student_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  regno          TEXT UNIQUE NOT NULL,
  firstname      TEXT NOT NULL,
  middlename     TEXT,
  lastname       TEXT NOT NULL,
  grade          INTEGER NOT NULL,
  email          TEXT,
  username       TEXT UNIQUE NOT NULL,
  userpassword   TEXT NOT NULL,
  parent_mobile  TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
  subject_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_name   TEXT NOT NULL,
  subject_desc   TEXT
);

-- Content bank (pragmatic addition beyond the proposal's dictionary)
CREATE TABLE IF NOT EXISTS exercises (
  exercise_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id     INTEGER NOT NULL REFERENCES subjects(subject_id),
  type           TEXT NOT NULL CHECK (type IN ('dragdrop','scramble','dictation','addition','subtraction','multiplication','division')),
  difficulty     INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  content_json   TEXT NOT NULL
);

-- Per-student, per-subject adaptive difficulty state (pragmatic addition)
CREATE TABLE IF NOT EXISTS student_difficulty (
  student_id     INTEGER NOT NULL REFERENCES students(student_id),
  subject_id     INTEGER NOT NULL REFERENCES subjects(subject_id),
  level          INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  PRIMARY KEY (student_id, subject_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(student_id),
  starttime      TEXT NOT NULL,
  endtime        TEXT
);

CREATE TABLE IF NOT EXISTS activity_attempts (
  attempt_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES sessions(session_id),
  exercise_id    INTEGER NOT NULL REFERENCES exercises(exercise_id),
  student_id     INTEGER NOT NULL REFERENCES students(student_id),
  latency_ms     INTEGER NOT NULL,
  score          REAL NOT NULL,
  grade          TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS speechlogs (
  log_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(student_id),
  input_text     TEXT,
  output_text    TEXT,
  timestamp      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress_reports (
  report_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(student_id),
  average_score  REAL NOT NULL,
  strengths      TEXT,
  challenges     TEXT,
  generated_at   TEXT NOT NULL
);
