// Live speech-to-text for the dispatcher, using the browser's built-in
// SpeechRecognition (Chrome, Edge and Safari). Free, no API key.
// Needs a secure page: localhost or https (your Vercel link) both work.

import { useCallback, useEffect, useRef, useState } from 'react';

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const dictationSupported = Boolean(Recognition);

const SILENCE_MS = 2500; // stop by itself after this long without new words

const ERRORS = {
  'not-allowed': 'Microphone access is blocked. Click the icon in the address bar and allow the microphone.',
  'service-not-allowed': 'Microphone access is blocked. Click the icon in the address bar and allow the microphone.',
  'audio-capture': 'No microphone found. Check that one is connected.',
  'no-speech': 'Didn’t hear anything. Try again and speak close to the mic.',
  network: 'Speech recognition needs an internet connection.',
};

// "the next train is delayed" → "The next train is delayed."
export function tidy(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const capped = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * onText(text)  — called continuously with the words so far (for the live preview)
 * onDone(text)  — called once when listening stops, with the tidied final text
 */
export function useDictation({ onText, onDone }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const textRef = useRef('');
  const silenceRef = useRef(null);
  const cbs = useRef({ onText, onDone });
  cbs.current = { onText, onDone };

  const stop = useCallback(() => {
    clearTimeout(silenceRef.current);
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!Recognition) {
      setError('Speech input isn’t supported in this browser. Use Chrome or Safari.');
      return;
    }
    setError(null);
    textRef.current = '';

    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      const text = Array.from(e.results, (r) => r[0].transcript).join('');
      textRef.current = text;
      cbs.current.onText(text);
      clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => rec.stop(), SILENCE_MS);
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] || `Speech input stopped (${e.error}).`);
    };
    rec.onend = () => {
      clearTimeout(silenceRef.current);
      recRef.current = null;
      setListening(false);
      cbs.current.onDone(tidy(textRef.current));
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Couldn’t start the microphone. Try again.');
    }
  }, []);

  // Stop listening if the dispatcher leaves the page.
  useEffect(() => () => recRef.current?.abort(), []);

  return { listening, error, start, stop, supported: dictationSupported };
}
