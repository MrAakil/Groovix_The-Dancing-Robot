/* ================================================================ */
/* MARKOV_DANCE.JS  //  GROOVIX PROBABILISTIC DANCE ENGINE  v3.0    */
/* ================================================================ */

'use strict';

/* ================================================================ */
/* SECTION 1: STATE DEFINITIONS                                    */
/* ================================================================ */
const DANCE_STATES = [
  { id: 1,  name: 'REST_NATURAL',   leftArm: 90,  rightArm: 90,  category: 'A' },
  { id: 2,  name: 'SWAY_LEFT',      leftArm: 72,  rightArm: 102, category: 'A' },
  { id: 3,  name: 'SWAY_RIGHT',     leftArm: 108, rightArm: 78,  category: 'A' },
  { id: 4,  name: 'GENTLE_OPEN',    leftArm: 62,  rightArm: 118, category: 'A' },
  { id: 5,  name: 'SOFT_CROSS',     leftArm: 118, rightArm: 62,  category: 'A' },
  { id: 6,  name: 'LEFT_REACH',     leftArm: 46,  rightArm: 88,  category: 'A' },
  { id: 7,  name: 'RIGHT_REACH',    leftArm: 92,  rightArm: 46,  category: 'A' },

  { id: 8,  name: 'GROOVE_WIDE',    leftArm: 50,  rightArm: 132, category: 'B' },
  { id: 9,  name: 'GROOVE_NARROW',  leftArm: 132, rightArm: 50,  category: 'B' },
  { id: 10, name: 'PUMP_LEFT',      leftArm: 34,  rightArm: 112, category: 'B' },
  { id: 11, name: 'PUMP_RIGHT',     leftArm: 112, rightArm: 34,  category: 'B' },
  { id: 12, name: 'HALF_WAVE',      leftArm: 58,  rightArm: 142, category: 'B' },
  { id: 13, name: 'BOUNCE_ARMS',    leftArm: 76,  rightArm: 76,  category: 'B' },
  { id: 14, name: 'MID_CROSS',      leftArm: 138, rightArm: 138, category: 'B' },

  { id: 15, name: 'FULL_OPEN',      leftArm: 22,  rightArm: 158, category: 'C' },
  { id: 16, name: 'FULL_CROSS',     leftArm: 158, rightArm: 22,  category: 'C' },
  { id: 17, name: 'VICTORY_ARMS',   leftArm: 32,  rightArm: 32,  category: 'C' },
  { id: 18, name: 'POWER_LEFT',     leftArm: 12,  rightArm: 148, category: 'C' },
  { id: 19, name: 'POWER_RIGHT',    leftArm: 148, rightArm: 12,  category: 'C' },
  { id: 20, name: 'FRENZY_SPREAD',  leftArm: 16,  rightArm: 164, category: 'C' },
];

const ENERGY_THRESHOLDS = {
  LOW_MAX: 0.33,
  MID_MAX: 0.66,
};

const ENERGY_WEIGHTS = {
  LOW:  { A: 2.5, B: 0.8, C: 0.1 },
  MID:  { A: 0.7, B: 2.0, C: 0.7 },
  HIGH: { A: 0.1, B: 0.8, C: 2.5 },
};

const BASE_PROBABILITIES = [0.30, 0.25, 0.20, 0.15, 0.10];
const ENERGY_PROFILE_INTERVAL_MS = 10000;
const TRANSITION_REFRESH_MS = 5000; // rebuild transition candidates every 5s while playing
const TRANSITION_DELAY_MIN_MS = 3000; // 3 seconds between dance moves
const TRANSITION_DELAY_MAX_MS = 3000; // fixed 3s cadence
const LERP_SPEED = 0.10;
const MOTOR_SEND_RATE_MS = 66;

/* ================================================================ */
/* SECTION 2: ENGINE                                                */
/* ================================================================ */
const MarkovDance = (() => {
  const statesByCategory = {
    A: DANCE_STATES.filter(state => state.category === 'A'),
    B: DANCE_STATES.filter(state => state.category === 'B'),
    C: DANCE_STATES.filter(state => state.category === 'C'),
  };

  let transitionTable = new Map();
  let currentState = DANCE_STATES[0];
  let currentEnergyValue = 0;
  let currentEnergyCategory = 'LOW';
  let targetLeft = currentState.leftArm;
  let targetRight = currentState.rightArm;
  let currentLeft = currentState.leftArm;
  let currentRight = currentState.rightArm;
  let schedulerTimer = null;
  let energyTimer = null;
  let transitionRefreshTimer = null;
  let motionFrameId = null;
  let lastMotorSendMs = 0;

  function isSongPlaying() {
    return typeof isAudioPlaying !== 'undefined' && isAudioPlaying;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }

  function classifyEnergy(value) {
    const energy = clamp01(value);
    if (energy <= ENERGY_THRESHOLDS.LOW_MAX) return 'LOW';
    if (energy <= ENERGY_THRESHOLDS.MID_MAX) return 'MID';
    return 'HIGH';
  }

  function seededShuffle(list, seed) {
    const array = [...list];
    let state = seed >>> 0;
    for (let index = array.length - 1; index > 0; index -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const swapIndex = state % (index + 1);
      [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
    }
    return array;
  }

  function buildTransitionTable() {
    transitionTable = new Map();

    DANCE_STATES.forEach(state => {
      const sameCategory = statesByCategory[state.category].filter(candidate => candidate.id !== state.id);
      const otherCategories = ['A', 'B', 'C'].filter(category => category !== state.category);

      const sameCandidates = seededShuffle(sameCategory, state.id * 37).slice(0, 3);
      const crossCategoryA = seededShuffle(statesByCategory[otherCategories[0]], state.id * 53)[0];
      const crossCategoryB = seededShuffle(statesByCategory[otherCategories[1]], state.id * 91)[0];

      transitionTable.set(state.id, [
        sameCandidates[0],
        sameCandidates[1],
        sameCandidates[2],
        crossCategoryA,
        crossCategoryB,
      ]);
    });

    console.log(`[MARKOV] Transition table built with ${DANCE_STATES.length} states.`);
  }

  function normalizeProbabilities(weightedValues) {
    const total = weightedValues.reduce((sum, value) => sum + value, 0);
    if (!total) {
      const equalWeight = 1 / weightedValues.length;
      return weightedValues.map(() => equalWeight);
    }
    return weightedValues.map(value => value / total);
  }

  function buildCumulativeProbabilities(probabilities) {
    const cumulative = [];
    let runningTotal = 0;

    probabilities.forEach(probability => {
      runningTotal += probability;
      cumulative.push(runningTotal);
    });

    cumulative[cumulative.length - 1] = 1;
    return cumulative;
  }

  function selectFromCumulativeDistribution(cumulativeProbabilities) {
    const roll = Math.random();
    for (let index = 0; index < cumulativeProbabilities.length; index += 1) {
      if (roll <= cumulativeProbabilities[index]) return index;
    }
    return cumulativeProbabilities.length - 1;
  }

  function getWeightedProbabilities(candidates, energyCategory) {
    const weights = ENERGY_WEIGHTS[energyCategory];
    const weighted = candidates.map((candidate, index) => BASE_PROBABILITIES[index] * weights[candidate.category]);
    return normalizeProbabilities(weighted);
  }

  function pickNextState() {
    const candidates = transitionTable.get(currentState.id);
    const weightedProbabilities = getWeightedProbabilities(candidates, currentEnergyCategory);
    const cumulative = buildCumulativeProbabilities(weightedProbabilities);
    const selectedIndex = selectFromCumulativeDistribution(cumulative);
    return {
      state: candidates[selectedIndex],
      probabilities: weightedProbabilities,
      cumulative,
      selectedIndex,
    };
  }

  function sendBeatTelemetry(energyValue) {
    if (!isSongPlaying()) return;

    const value = clamp01(energyValue);
    const command = `BEAT:${value.toFixed(2)}`;

    if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(command);
      if (typeof bytesSent !== 'undefined') bytesSent += command.length;
      if (typeof flashTxLight === 'function') flashTxLight('beat');
    }

    if (typeof logWS === 'function') {
      logWS(`SENT -> ${command}`, 'tx-beat');
    }
  }

  function updateEnergyUi() {
    const energyLabel = document.getElementById('markov-intensity');
    if (energyLabel) {
      energyLabel.innerText = currentEnergyCategory;
      energyLabel.className = `m-value-intensity ${currentEnergyCategory.toLowerCase()}`;
    }

    const blendLabel = document.getElementById('markov-blend');
    if (blendLabel) {
      blendLabel.innerText = `${Math.round(currentEnergyValue * 100)}%`;
    }

    const thresholdLabel = document.getElementById('markov-threshold');
    if (thresholdLabel) {
      thresholdLabel.innerText = currentEnergyValue.toFixed(2);
    }

    const cellIdle = document.getElementById('cell-idle');
    const cellBounce = document.getElementById('cell-bounce');
    const cellWave = document.getElementById('cell-wave');
    const cellFrenzy = document.getElementById('cell-frenzy');

    if (cellIdle) cellIdle.innerText = `A x${ENERGY_WEIGHTS[currentEnergyCategory].A.toFixed(1)}`;
    if (cellBounce) cellBounce.innerText = `B x${ENERGY_WEIGHTS[currentEnergyCategory].B.toFixed(1)}`;
    if (cellWave) cellWave.innerText = `C x${ENERGY_WEIGHTS[currentEnergyCategory].C.toFixed(1)}`;
    if (cellFrenzy) cellFrenzy.innerText = `CDF ${Math.round(currentEnergyValue * 100)}%`;

    if (typeof logTerminal === 'function') {
      logTerminal(
        `[MARKOV] Energy profile -> value=${currentEnergyValue.toFixed(2)} category=${currentEnergyCategory}`,
        'info'
      );
    }
  }

  function updateStateUi(state, transitionMeta) {
    const stateLabel = document.getElementById('markov-state');
    if (stateLabel) stateLabel.innerText = state.name;

    const categoryToCell = {
      A: document.getElementById('cell-idle'),
      B: document.getElementById('cell-bounce'),
      C: document.getElementById('cell-wave'),
    };

    ['cell-idle', 'cell-bounce', 'cell-wave', 'cell-frenzy'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.classList.remove('active');
    });

    const activeCell = categoryToCell[state.category];
    if (activeCell) activeCell.classList.add('active');

    if (typeof logWS === 'function') {
      logWS(
        `MARKOV -> [${state.name}] cat:${state.category} energy:${currentEnergyCategory} cdf:${transitionMeta.cumulative[transitionMeta.selectedIndex].toFixed(3)}`,
        'tx-cmd'
      );
    }
  }

  function applyDanceState(nextState, transitionMeta) {
    currentState = nextState;
    targetLeft = nextState.leftArm;
    targetRight = nextState.rightArm;
    updateStateUi(nextState, transitionMeta);

    console.log(
      `[MARKOV] state=${nextState.name} (${nextState.category}) left=${nextState.leftArm} right=${nextState.rightArm} energy=${currentEnergyCategory}`
    );
  }

  function updateRobotPose(leftAngle, rightAngle) {
    if (typeof motorOffsets === 'undefined' || typeof motors === 'undefined') return;

    motorOffsets.LSHOULDER = leftAngle - motors.LSHOULDER;
    motorOffsets.RSHOULDER = rightAngle - motors.RSHOULDER;
    motorOffsets.LARM = 0;
    motorOffsets.RARM = 0;

    if (typeof updateRobotHologram === 'function') {
      updateRobotHologram();
    }
  }

  function sendMotorState(leftAngle, rightAngle) {
    if (!isSongPlaying()) return;

    const now = performance.now();
    if (now - lastMotorSendMs < MOTOR_SEND_RATE_MS) return;
    lastMotorSendMs = now;

    if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`SET:LSHOULDER:${leftAngle}`);
      ws.send(`SET:RSHOULDER:${rightAngle}`);

      if (typeof bytesSent !== 'undefined') bytesSent += 30;
      if (typeof flashTxLight === 'function') flashTxLight('command');
    }
  }

  function motionLoop() {
    currentLeft += (targetLeft - currentLeft) * LERP_SPEED;
    currentRight += (targetRight - currentRight) * LERP_SPEED;

    if (Math.abs(currentLeft - targetLeft) < 0.25) currentLeft = targetLeft;
    if (Math.abs(currentRight - targetRight) < 0.25) currentRight = targetRight;

    const leftAngle = Math.round(Math.max(0, Math.min(180, currentLeft)));
    const rightAngle = Math.round(Math.max(0, Math.min(180, currentRight)));

    updateRobotPose(leftAngle, rightAngle);
    sendMotorState(leftAngle, rightAngle);

    motionFrameId = requestAnimationFrame(motionLoop);
  }

  function scheduleNextTransition() {
    if (!isSongPlaying()) {
      schedulerTimer = setTimeout(scheduleNextTransition, TRANSITION_DELAY_MIN_MS);
      return;
    }

    const nextStateMeta = pickNextState();
    applyDanceState(nextStateMeta.state, nextStateMeta);

    const delay = TRANSITION_DELAY_MIN_MS + Math.floor(Math.random() * (TRANSITION_DELAY_MAX_MS - TRANSITION_DELAY_MIN_MS + 1));
    schedulerTimer = setTimeout(scheduleNextTransition, delay);
  }

  function sampleEnergyProfile() {
    if (!isSongPlaying()) {
      currentEnergyValue = 0;
      currentEnergyCategory = 'LOW';
      updateEnergyUi();
      console.log('[MARKOV] song paused, skipping BEAT telemetry and Markov energy send');
      return;
    }

    const rawEnergy = clamp01(typeof beatEnergy === 'number' ? beatEnergy : 0);
    currentEnergyValue = rawEnergy;
    currentEnergyCategory = classifyEnergy(rawEnergy);

    if (typeof markovIntensity !== 'undefined') markovIntensity = currentEnergyCategory;
    if (typeof markovState !== 'undefined') markovState = currentState.name;

    sendBeatTelemetry(rawEnergy);
    updateEnergyUi();

    console.log(`[MARKOV] beat energy sample=${rawEnergy.toFixed(2)} category=${currentEnergyCategory}`);
  }

  function startEnergyProfiler() {
    if (energyTimer) clearInterval(energyTimer);
    energyTimer = setInterval(sampleEnergyProfile, ENERGY_PROFILE_INTERVAL_MS);
  }

  function start() {
    console.log('[MARKOV] ==========================================');
    console.log('[MARKOV] GROOVIX Markov Dance Engine v3.0 starting');
    console.log('[MARKOV] ==========================================');

    buildTransitionTable();
    currentState = DANCE_STATES[0];
    targetLeft = currentState.leftArm;
    targetRight = currentState.rightArm;
    currentLeft = currentState.leftArm;
    currentRight = currentState.rightArm;

    updateRobotPose(currentState.leftArm, currentState.rightArm);
    updateEnergyUi();

    if (schedulerTimer) clearTimeout(schedulerTimer);
    if (motionFrameId) cancelAnimationFrame(motionFrameId);

    startEnergyProfiler();
    schedulerTimer = setTimeout(scheduleNextTransition, TRANSITION_DELAY_MIN_MS + Math.floor(Math.random() * (TRANSITION_DELAY_MAX_MS - TRANSITION_DELAY_MIN_MS + 1)));
    motionLoop();

    // Start transition refresher (rebuild candidates every 5s while music plays)
    if (transitionRefreshTimer) clearInterval(transitionRefreshTimer);
    transitionRefreshTimer = setInterval(() => {
      if (isSongPlaying()) {
        buildTransitionTable();
        console.log('[MARKOV] Transition table refreshed (5s) while music playing.');
      }
    }, TRANSITION_REFRESH_MS);

    console.log('[MARKOV] Live state engine ready: 20 states | energy refresh: 10s | transition cadence: 3000ms');
  }

  function stop() {
    if (energyTimer) clearInterval(energyTimer);
    if (schedulerTimer) clearTimeout(schedulerTimer);
    if (motionFrameId) cancelAnimationFrame(motionFrameId);
    energyTimer = null;
    schedulerTimer = null;
    if (transitionRefreshTimer) clearInterval(transitionRefreshTimer);
    transitionRefreshTimer = null;
    motionFrameId = null;
    console.log('[MARKOV] Dance engine stopped.');
  }

  /*
   * Manual refresh endpoint to rebuild the transition table on demand.
   * Intended for debugging and tuning — safe to call while running.
   */
  function refreshTransitions() {
    buildTransitionTable();
    console.log('[MARKOV] Manual transition table refresh executed.');
  }

  function debug() {
    return {
      currentState,
      currentEnergyValue,
      currentEnergyCategory,
      targetLeft,
      targetRight,
      currentLeft,
      currentRight,
      transitionTable: Object.fromEntries(transitionTable.entries()),
    };
  }

  return { start, stop, debug, refresh: refreshTransitions };
})();

function initMarkovDanceEngine() {
  MarkovDance.start();
}

// Global debug helper: call `forceMarkovTransitionRefresh()` from the browser console
// to force an immediate rebuild of the transition table.
window.forceMarkovTransitionRefresh = function() {
  if (typeof MarkovDance !== 'undefined' && typeof MarkovDance.refresh === 'function') {
    MarkovDance.refresh();
  } else {
    console.warn('MarkovDance.refresh() not available');
  }
};
