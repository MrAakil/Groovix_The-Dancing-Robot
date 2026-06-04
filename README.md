# Groovix

A browser-based Markov dance controller that sends servo angle signals to an ESP32 via WebSocket. The browser keeps the Web Audio analysis, UI, Markov pose selection, and WebSocket connection, while the ESP32 writes each received motor angle to the matching servo.

## Features

- Markov dance engine (`markov_dance.js`) with 20 ESP32-compatible dance states.
- Each state now defines a full seven-servo pose: vertical shoulder lift, horizontal shoulder lift, and forearm for each hand, plus head yaw for left/right rotation only.
- Configurable transition matrix with energy-aware and kinematic-distance weighting for LOW, MID, and HIGH behavior.
- Anti-repeat selection so the robot avoids tight loops.
- Adaptive transition cadence from roughly 2s to 3s based on audio energy and optional BPM globals.
- WebSocket servo protocol: scheduled `SET:<motor>:<angle>` commands for all motors in the selected pose.
- Local dashboard pose interpolation remains browser-only for smooth visual feedback.

## Files

- `index.html` - app entry; loads `markov_dance.js` before `script.js`.
- `markov_dance.js` - Markov state manager, transition matrix, scheduler, energy integration, and servo signal sender.
- `script.js` - app initialization, WebSocket connection, audio setup, and UI glue.
- `mock_esp32.js` - local test harness that listens for `SET:` motor messages.
- `style.css` - UI styles.
- `package.json` - project metadata.

## Quick start

1. Open `index.html` in a modern browser.
2. Connect to the ESP32 WebSocket endpoint or use the local simulator.
3. Load and play an audio file.
4. The Markov scheduler starts automatically through `initMarkovDanceEngine()`.

## WebSocket Message Format

- `SET:<motor>:<angle>` - primary protocol, where `<angle>` is `0` through `180`.

Examples:

```text
SET:LSHOULDER_V:76
SET:LSHOULDER_H:72
SET:LFOREARM:104
SET:RSHOULDER_V:102
SET:RSHOULDER_H:106
SET:RFOREARM:82
SET:HEAD_YAW:72
```

The ESP32 should map each motor name to its servo and write the received angle:

```cpp
servoMap[motorName].write(angle);
```

Manual slider controls and Markov playback both use `SET:<MOTOR>:<ANGLE>`. The supported motor names are:

```text
LSHOULDER_V
LSHOULDER_H
LFOREARM
RSHOULDER_V
RSHOULDER_H
RFOREARM
HEAD_YAW
```

During playback, every Markov transition sends all seven motor signals to the ESP32.

## Markov movement model

The scheduler treats each dance pose as a Markov state. For every transition, it starts from the explicit row in `TRANSITION_MATRIX`, then multiplies each candidate by:

- the current audio-energy class weight (`LOW`, `MID`, or `HIGH`),
- an anti-repeat penalty for recently used states,
- a kinematic smoothness weight based on seven-servo pose distance.

Those candidate weights are normalized into a probability distribution before random sampling, so each next pose is selected from a valid Markov transition distribution while still respecting the three-motor hand mechanics and the left/right-only head axis.

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
