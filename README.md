# Groovix

A browser-based Markov dance controller that sends dance step IDs to an ESP32 via WebSocket. The browser keeps the Web Audio analysis, UI, and WebSocket connection, while the ESP32 owns the servo poses in `danceMoves[20]` and executes motion locally.

## Features

- Markov dance engine (`markov_dance.js`) with 20 ESP32-compatible dance states.
- Each state now defines a full pose: shoulders, arms, and head tilt/bob metadata for preview and ESP32 choreography mapping.
- Configurable transition matrix with energy-aware weighting for LOW, MID, and HIGH behavior.
- Anti-repeat selection so the robot avoids tight loops.
- Adaptive transition cadence from roughly 2s to 3s based on audio energy and optional BPM globals.
- Low-traffic WebSocket protocol: scheduled `STEP:<id>` commands instead of continuous servo angle streaming.
- Local dashboard pose interpolation remains browser-only for smooth visual feedback.

## Files

- `index.html` - app entry; loads `markov_dance.js` before `script.js`.
- `markov_dance.js` - Markov state manager, transition matrix, scheduler, energy integration, and STEP sender.
- `script.js` - app initialization, WebSocket connection, audio setup, and UI glue.
- `mock_esp32.js` - local test harness that listens for `STEP:` messages.
- `style.css` - UI styles.
- `package.json` - project metadata.

## Quick start

1. Open `index.html` in a modern browser.
2. Connect to the ESP32 WebSocket endpoint or use the local simulator.
3. Load and play an audio file.
4. The Markov scheduler starts automatically through `initMarkovDanceEngine()`.

## WebSocket message format

- `STEP:<id>` - primary protocol, where `<id>` is `1` through `20`.
- `STEP:<id>:<energy>` - optional extended format. Enable with `STEP_PROTOCOL.INCLUDE_ENERGY` in `markov_dance.js`.

Examples:

```text
STEP:2
STEP:5
STEP:1
```

The ESP32 should map the incoming ID to its local motion table. Each local move should include shoulder, arm, and head servo targets where your hardware supports them:

```cpp
applyMove(stepNumber);
```

Manual slider controls still use legacy `SET:<MOTOR>:<ANGLE>` commands for calibration/manual operation. The Markov dance engine does not stream servo angles.

## Developer notes

- Tune the state graph in `TRANSITION_MATRIX` inside `markov_dance.js`.
- Tune timing in `DANCE_TIMING`.
- Tune energy behavior in `ENERGY_WEIGHTS` and `ENERGY_THRESHOLDS`.
- Force a transition table rebuild from the console using `window.forceMarkovTransitionRefresh()`.

## Testing

Run the mock receiver:

```bash
node mock_esp32.js
```

Then connect the app to `ws://localhost:81` and play audio. The mock displays the active `STEP` command.
