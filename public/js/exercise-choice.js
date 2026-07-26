// Shared renderer for every multiple-choice exercise type: Picture Match plus the
// four arithmetic operations. They all have the same shape (a prompt, a spoken
// question, three tappable choice tiles) — only the copy and how the question is
// spoken out loud differ per type.
const CHOICE_TYPE_META = {
  dragdrop: { icon: '🖼️', label: 'Picture Match', prompt: 'Which picture matches the word?', spoken: (q) => q },
  addition: { icon: '➕', label: 'Addition', prompt: "What's the answer?", spoken: toSpokenMath },
  subtraction: { icon: '➖', label: 'Subtraction', prompt: "What's the answer?", spoken: toSpokenMath },
  multiplication: { icon: '✖️', label: 'Multiplication', prompt: "What's the answer?", spoken: toSpokenMath },
  division: { icon: '➗', label: 'Division', prompt: "What's the answer?", spoken: toSpokenMath }
};

function toSpokenMath(question) {
  return question
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/\+/g, ' plus ')
    .replace(/-/g, ' minus ')
    .replace(/=/g, ' equals ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function renderChoiceExercise(root, subjectId, type) {
  const meta = CHOICE_TYPE_META[type];
  root.innerHTML = '<p>Loading...</p>';
  let exercise;
  try {
    exercise = await api(`/api/exercises/next?subjectId=${subjectId}&type=${type}`);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  const startTime = Date.now();
  root.innerHTML = `
    <h2>${meta.icon} ${meta.label} — Level ${exercise.currentLevel}</h2>
    <p>${meta.prompt}</p>
    <h1 id="word-display" style="font-size: 42px;">${exercise.content.word}</h1>
    <button type="button" id="hear-word">🔊 Hear it</button>
    <div class="choice-grid" id="choices"></div>
    <div id="feedback"></div>
  `;

  const spoken = meta.spoken(exercise.content.word);
  document.getElementById('hear-word').addEventListener('click', () => Speech.speak(spoken));
  Speech.speak(spoken);

  const choicesEl = document.getElementById('choices');
  exercise.content.choices.forEach((choice) => {
    const tile = document.createElement('div');
    tile.className = 'choice-tile';
    tile.textContent = choice.emoji;
    tile.dataset.id = choice.id;
    tile.addEventListener('click', () => submitAnswer(choice.id, tile));
    choicesEl.appendChild(tile);
  });

  let answered = false;
  async function submitAnswer(answerId, tileEl) {
    if (answered) return;
    answered = true;
    const latencyMs = Date.now() - startTime;
    choicesEl.querySelectorAll('.choice-tile').forEach((t) => (t.style.pointerEvents = 'none'));
    tileEl.classList.add('selected');

    const result = await api('/api/exercises/attempt', {
      method: 'POST',
      body: JSON.stringify({ exerciseId: exercise.exerciseId, subjectId, answer: answerId, latencyMs })
    });

    choicesEl.querySelectorAll('.choice-tile').forEach((t) => {
      if (t.dataset.id === result.correctAnswer) t.classList.add('correct');
      else if (t === tileEl) t.classList.add('incorrect');
    });

    showFeedback(result, root, subjectId, type);
  }
}

function renderDragdrop(root, subjectId) { return renderChoiceExercise(root, subjectId, 'dragdrop'); }
function renderAddition(root, subjectId) { return renderChoiceExercise(root, subjectId, 'addition'); }
function renderSubtraction(root, subjectId) { return renderChoiceExercise(root, subjectId, 'subtraction'); }
function renderMultiplication(root, subjectId) { return renderChoiceExercise(root, subjectId, 'multiplication'); }
function renderDivision(root, subjectId) { return renderChoiceExercise(root, subjectId, 'division'); }

function showFeedback(result, root, subjectId, type) {
  const directionMsg = { up: '⬆️ Level up! Nice work.', down: '⬇️ Let\'s try an easier one next.', hold: 'Keep practicing at this level.' };
  const feedback = document.getElementById('feedback');
  feedback.innerHTML = `
    <div class="${result.score >= 70 ? 'success-msg' : 'error-msg'}">
      Score: ${result.score} (Grade ${result.grade}) — ${directionMsg[result.direction]}
    </div>
    <button type="button" id="next-btn">Next Exercise →</button>
  `;
  document.getElementById('next-btn').addEventListener('click', () => {
    const renderers = {
      dragdrop: renderDragdrop,
      scramble: renderScramble,
      dictation: renderDictation,
      addition: renderAddition,
      subtraction: renderSubtraction,
      multiplication: renderMultiplication,
      division: renderDivision
    };
    renderers[type](root, subjectId);
  });
}
