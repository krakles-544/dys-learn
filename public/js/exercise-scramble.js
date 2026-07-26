function shuffleLetters(letters) {
  const arr = letters.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function renderScramble(root, subjectId) {
  root.innerHTML = '<p>Loading...</p>';
  let exercise;
  try {
    exercise = await api(`/api/exercises/next?subjectId=${subjectId}&type=scramble`);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  const startTime = Date.now();
  const targetWord = exercise.content.word.toLowerCase();

  // Kids get unlimited retries with a growing hint (one more letter locked in
  // place after every miss), so a wrong guess never dead-ends them — it just
  // narrows the puzzle. The final grade reflects how many tries it took.
  let revealedCount = 0;
  let attempts = 0;
  let remaining = [];
  let placed = [];

  root.innerHTML = `
    <h2>🔤 Word Scramble — Level ${exercise.currentLevel}</h2>
    <p>Click the letters in order to spell the word. Click a placed letter to remove it.</p>
    <button type="button" id="hear-hint">🔊 Hear the word</button>
    <p><strong>Word so far:</strong></p>
    <div class="drop-zone" id="revealed-zone"></div>
    <p><strong>Letters:</strong></p>
    <div class="letters-row" id="letter-bank"></div>
    <p><strong>Your answer:</strong></p>
    <div class="drop-zone" id="answer-zone"></div>
    <button type="button" id="submit-btn" disabled>Submit</button>
    <div id="hint-msg"></div>
    <div id="feedback"></div>
  `;

  document.getElementById('hear-hint').addEventListener('click', () => Speech.speak(targetWord));
  Speech.speak(targetWord);

  const revealedZone = document.getElementById('revealed-zone');
  const bank = document.getElementById('letter-bank');
  const zone = document.getElementById('answer-zone');
  const submitBtn = document.getElementById('submit-btn');
  const hintMsg = document.getElementById('hint-msg');

  function renderRevealed() {
    revealedZone.innerHTML = '';
    for (let i = 0; i < revealedCount; i++) {
      const tile = document.createElement('div');
      tile.className = 'letter-tile locked';
      tile.textContent = targetWord[i];
      revealedZone.appendChild(tile);
    }
    if (revealedCount === 0) revealedZone.innerHTML = '<span style="opacity:0.6;">(no hints used yet)</span>';
  }

  function renderBank() {
    bank.innerHTML = '';
    remaining.forEach((letter, idx) => {
      if (placed.includes(idx)) return;
      const tile = document.createElement('div');
      tile.className = 'letter-tile';
      tile.textContent = letter;
      tile.addEventListener('click', () => {
        placed.push(idx);
        renderBank();
        renderZone();
      });
      bank.appendChild(tile);
    });
  }

  function renderZone() {
    zone.innerHTML = '';
    placed.forEach((idx, position) => {
      const tile = document.createElement('div');
      tile.className = 'letter-tile';
      tile.textContent = remaining[idx];
      tile.addEventListener('click', () => {
        placed.splice(position, 1);
        renderBank();
        renderZone();
      });
      zone.appendChild(tile);
    });
    submitBtn.disabled = placed.length !== remaining.length;
  }

  function startRound() {
    remaining = shuffleLetters(targetWord.slice(revealedCount).split(''));
    placed = [];
    renderRevealed();
    renderBank();
    renderZone();
  }

  startRound();

  let finished = false;
  submitBtn.addEventListener('click', async () => {
    if (finished || submitBtn.disabled) return;
    attempts++;

    const guess = targetWord.slice(0, revealedCount) + placed.map((idx) => remaining[idx]).join('');

    if (guess === targetWord) {
      finished = true;
      submitBtn.disabled = true;
      hintMsg.innerHTML = '';
      const latencyMs = Date.now() - startTime;
      const result = await api('/api/exercises/attempt', {
        method: 'POST',
        body: JSON.stringify({ exerciseId: exercise.exerciseId, subjectId, answer: targetWord, attempts, latencyMs })
      });
      showFeedback(result, root, subjectId, 'scramble');
    } else {
      revealedCount = Math.min(revealedCount + 1, targetWord.length - 1);
      hintMsg.innerHTML = `<div class="error-msg">Not quite — here's a hint! One more letter is locked in above. Give it another go 💪</div>`;
      startRound();
    }
  });
}
