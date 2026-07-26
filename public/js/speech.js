const Speech = (() => {
  const synthSupported = 'speechSynthesis' in window;
  const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sttSupported = !!RecognitionClass;

  function speak(text, onEnd) {
    if (!synthSupported) {
      if (onEnd) onEnd();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.lang = 'en-US';
    if (onEnd) utter.onend = onEnd;
    window.speechSynthesis.speak(utter);
  }

  function listen({ onResult, onEnd, onError }) {
    if (!sttSupported) {
      if (onError) onError(new Error('Speech recognition not supported in this browser.'));
      return null;
    }
    const recognition = new RecognitionClass();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(' ');
      if (onResult) onResult(transcript);
    };
    recognition.onerror = (event) => {
      if (onError) onError(new Error(event.error));
    };
    recognition.onend = () => {
      if (onEnd) onEnd();
    };

    recognition.start();
    return recognition;
  }

  return { speak, listen, synthSupported, sttSupported };
})();
