async function renderDictation(root, subjectId) {
  root.innerHTML = '<p>Loading...</p>';
  let exercise;
  try {
    exercise = await api(`/api/exercises/next?subjectId=${subjectId}&type=dictation`);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  let startTime = null;
  const sttNote = Speech.sttSupported ? '' : '<p style="opacity:0.8;">🎤 Voice input isn\'t available in this browser — please type what you remember instead.</p>';

  root.innerHTML = `
    <h2>🎧 Listen &amp; Retell — Level ${exercise.currentLevel}</h2>
    <p>Press play, listen carefully to the whole story, then tell us what happened — by speaking or typing.</p>
    <button type="button" id="play-btn">▶️ Play Story</button>
    ${sttNote}
    <div style="margin-top: 20px;">
      <button type="button" id="mic-btn" class="mic-btn" ${Speech.sttSupported ? '' : 'disabled'}>🎤</button>
      <span id="mic-status" style="margin-left: 12px;"></span>
    </div>
    <label for="retell-text">What do you remember?</label>
    <textarea id="retell-text" rows="4" placeholder="Type or speak what you heard..."></textarea>
    <button type="button" id="submit-btn" disabled>Submit</button>
    <div id="feedback"></div>
  `;

  const textarea = document.getElementById('retell-text');
  const submitBtn = document.getElementById('submit-btn');
  const micBtn = document.getElementById('mic-btn');
  const micStatus = document.getElementById('mic-status');

  textarea.addEventListener('input', () => {
    submitBtn.disabled = textarea.value.trim().length === 0;
  });

  document.getElementById('play-btn').addEventListener('click', () => {
    document.getElementById('play-btn').disabled = true;
    Speech.speak(exercise.content.story, () => {
      startTime = Date.now();
      document.getElementById('play-btn').disabled = false;
      micStatus.textContent = 'Story finished — now tell us what happened!';
    });
  });

  let recognition = null;
  micBtn.addEventListener('click', () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    micBtn.classList.add('listening');
    micStatus.textContent = 'Listening...';
    recognition = Speech.listen({
      onResult: (transcript) => {
        textarea.value = (textarea.value ? textarea.value + ' ' : '') + transcript;
        submitBtn.disabled = false;
      },
      onEnd: () => {
        micBtn.classList.remove('listening');
        micStatus.textContent = 'Tap the mic to speak again, or edit the text below.';
        recognition = null;
      },
      onError: (err) => {
        micBtn.classList.remove('listening');
        micStatus.textContent = `Mic error: ${err.message}. You can type instead.`;
        recognition = null;
      }
    });
  });

  let answered = false;
  submitBtn.addEventListener('click', async () => {
    if (answered) return;
    answered = true;
    submitBtn.disabled = true;
    const latencyMs = startTime ? Date.now() - startTime : 60000;

    const result = await api('/api/exercises/attempt', {
      method: 'POST',
      body: JSON.stringify({
        exerciseId: exercise.exerciseId,
        subjectId,
        transcript: textarea.value,
        latencyMs
      })
    });

    showFeedback(result, root, subjectId, 'dictation');
  });
}
