# Groovix

A browser-based Markov-driven dance controller that sends motor commands to an ESP32 via WebSocket. Designed to run in a browser with Web Audio analysis and a deterministic Markov engine for stable, repeatable choreography.

## Features

- Markov dance engine (`markov_dance.js`) with 20 predefined states and deterministic 5-candidate transitions.
- Energy profiling (10s window) that classifies audio energy into LOW/MID/HIGH and biases transitions accordingly.
- Smooth motion interpolation using requestAnimationFrame.
- WebSocket integration (`ws`) for sending `BEAT:` and `SET:` messages to hardware (ESP32 or mock harness).
- Safety gating: no BEAT/SET messages are sent unless audio is playing.
- Transition table refresh while music plays and a debug endpoint to force refresh.

## Files

- `index.html` — app entry; loads `markov_dance.js` before `script.js`.
- `markov_dance.js` — Markov engine, scheduler, motion loop, WebSocket hooks.
- `script.js` — app initialization, WebSocket connection, audio setup and UI glue.
- `mock_esp32.js` — local test harness that listens for `BEAT:` and `SET:` messages.
- `style.css` — UI styles.
- `package.json` — project metadata (if present).

## Quick start (development)

1. Open `index.html` in a modern browser (Chrome/Edge/Firefox).
2. Ensure the page can access audio (play a track or enable microphone as configured).
3. The Markov engine starts automatically via `initMarkovDanceEngine()` in `script.js`.

If you want to test without hardware, run the mock ESP32 harness in a Node.js environment (if provided) or inspect the browser console for outgoing WebSocket messages.

## WebSocket message format

- `BEAT:<value>` — emitted every 10 seconds by the Markov engine (value ~0.0-1.0 energy level).
- `SET:<MOTOR>:<ANGLE>` — motor set commands rate-limited by the Markov engine.

Notes: All outbound packets are gated: they are only sent when the app's audio-playing state is true.

## Developer notes

- Transition cadence is configurable in `markov_dance.js` via `TRANSITION_DELAY_MIN_MS` and `TRANSITION_DELAY_MAX_MS` (currently set to a fixed 3000ms cadence).
- Force a transition table rebuild from the console using `window.forceMarkovTransitionRefresh()`.
- The engine uses a seeded shuffle to ensure deterministic candidate selection between refreshes.
- To add states or tune motor offsets, edit `DANCE_STATES` inside `markov_dance.js`.

## Testing & Debugging

- Open the browser DevTools console to see `[MARKOV]` logs for state transitions, BEAT samples, and refresh events.
- Use the mock harness (`mock_esp32.js`) to verify message formats without hardware.

## License

This repository contains demo code. Add a license file if you intend to publish or share this project.

---

If you'd like, I can also add a small `README` section showing example console commands to run the mock harness or a `Dev` npm script — want me to add that?