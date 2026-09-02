// Shared helpers for the teacher and parent portals: a coarse "progress status"
// badge and a rule-based (no real ML) "AI insight" sentence generated from a
// pupil's attempt history. Both are deliberately simple and explainable.

function progressStatus(avgScore) {
  if (avgScore == null) return { label: 'Not started', tone: 'neutral' };
  if (avgScore >= 80) return { label: 'Excellent', tone: 'good' };
  if (avgScore >= 65) return { label: 'Good', tone: 'good' };
  if (avgScore >= 50) return { label: 'Fair', tone: 'warn' };
  return { label: 'Needs Support', tone: 'bad' };
}

const TYPE_SKILL = {
  dragdrop: 'picture and word matching',
  scramble: 'spelling',
  dictation: 'listening and retelling',
  addition: 'addition',
  subtraction: 'subtraction',
  multiplication: 'multiplication',
  division: 'division'
};

const SUBJECT_TIP = {
  English: 'read one short story aloud together each evening, letting the child echo every sentence back',
  Mathematics: 'play counting games with bottle tops or stones for ten minutes a day',
  'Social Studies (SST)': 'talk about places you pass on the way to school and name them together',
  Kiswahili: 'name household objects in Kiswahili during chores and let the child repeat them',
  Science: 'point out plants, animals and weather on your walks and ask "why" questions'
};

function generateInsight(db, studentId) {
  const rows = db
    .prepare(
      `SELECT a.score, e.type, sub.subject_name AS subject
       FROM activity_attempts a
       JOIN exercises e ON e.exercise_id = a.exercise_id
       JOIN subjects sub ON sub.subject_id = e.subject_id
       WHERE a.student_id = ?`
    )
    .all(studentId);

  if (rows.length < 3) {
    return 'Not enough activity yet to spot a pattern. Encourage the child to play a few learning games across different subjects this week.';
  }

  const bySubject = {};
  const byType = {};
  for (const r of rows) {
    (bySubject[r.subject] ||= []).push(r.score);
    (byType[r.type] ||= []).push(r.score);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const subjectAvgs = Object.entries(bySubject).map(([subject, xs]) => ({ subject, avg: avg(xs) }));
  const typeAvgs = Object.entries(byType).map(([type, xs]) => ({ type, avg: avg(xs) }));
  subjectAvgs.sort((a, b) => b.avg - a.avg);
  typeAvgs.sort((a, b) => a.avg - b.avg);

  const best = subjectAvgs[0];
  const worst = subjectAvgs[subjectAvgs.length - 1];
  const weakestSkill = TYPE_SKILL[typeAvgs[0].type] || 'some activities';

  let insight = `Strong work in ${best.subject} (average ${Math.round(best.avg)}%).`;
  if (worst.subject !== best.subject && worst.avg < 70) {
    const tip = SUBJECT_TIP[worst.subject] || 'set aside a short, calm practice time each day';
    insight += ` ${worst.subject} is lagging (average ${Math.round(worst.avg)}%), especially ${weakestSkill}. At home, try to ${tip}.`;
  } else if (typeAvgs[0].avg < 70) {
    insight += ` Keep an eye on ${weakestSkill} — short daily practice with lots of encouragement will help.`;
  } else {
    insight += ' Progress is steady across the board; keep the routine going and celebrate the wins.';
  }
  return insight;
}

module.exports = { progressStatus, generateInsight };
