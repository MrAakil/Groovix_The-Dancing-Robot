/* ================================================================ */
/* MARKOV_DANCE.JS  //  GROOVIX STEP-BASED DANCE ENGINE             */
/* ================================================================ */

'use strict';

/* ================================================================ */
/* SECTION 1: STATE DEFINITIONS                                     */
/* ================================================================ */
const DANCE_STATES = [
  { id: 1,  name: 'REST_NATURAL',   category: 'A', pose: { leftShoulder: 90,  leftArm: 90,  rightShoulder: 90,  rightArm: 90,  headTilt: 0,   headBob: 0 } },
  { id: 2,  name: 'SWAY_LEFT',      category: 'A', pose: { leftShoulder: 72,  leftArm: 104, rightShoulder: 102, rightArm: 82,  headTilt: -7,  headBob: 1 } },
  { id: 3,  name: 'SWAY_RIGHT',     category: 'A', pose: { leftShoulder: 108, leftArm: 78,  rightShoulder: 78,  rightArm: 106, headTilt: 7,   headBob: 1 } },
  { id: 4,  name: 'GENTLE_OPEN',    category: 'A', pose: { leftShoulder: 62,  leftArm: 112, rightShoulder: 118, rightArm: 68,  headTilt: 0,   headBob: -1 } },
  { id: 5,  name: 'SOFT_CROSS',     category: 'A', pose: { leftShoulder: 118, leftArm: 62,  rightShoulder: 62,  rightArm: 118, headTilt: 0,   headBob: 2 } },
  { id: 6,  name: 'LEFT_REACH',     category: 'A', pose: { leftShoulder: 46,  leftArm: 72,  rightShoulder: 88,  rightArm: 104, headTilt: -10, headBob: 0 } },
  { id: 7,  name: 'RIGHT_REACH',    category: 'A', pose: { leftShoulder: 92,  leftArm: 104, rightShoulder: 46,  rightArm: 72,  headTilt: 10,  headBob: 0 } },

  { id: 8,  name: 'GROOVE_WIDE',    category: 'B', pose: { leftShoulder: 50,  leftArm: 124, rightShoulder: 132, rightArm: 56,  headTilt: -5,  headBob: 3 } },
  { id: 9,  name: 'GROOVE_NARROW',  category: 'B', pose: { leftShoulder: 132, leftArm: 58,  rightShoulder: 50,  rightArm: 122, headTilt: 5,   headBob: 3 } },
  { id: 10, name: 'PUMP_LEFT',      category: 'B', pose: { leftShoulder: 34,  leftArm: 46,  rightShoulder: 112, rightArm: 94,  headTilt: -12, headBob: 4 } },
  { id: 11, name: 'PUMP_RIGHT',     category: 'B', pose: { leftShoulder: 112, leftArm: 94,  rightShoulder: 34,  rightArm: 46,  headTilt: 12,  headBob: 4 } },
  { id: 12, name: 'HALF_WAVE',      category: 'B', pose: { leftShoulder: 58,  leftArm: 38,  rightShoulder: 142, rightArm: 112, headTilt: -8,  headBob: 2 } },
  { id: 13, name: 'BOUNCE_ARMS',    category: 'B', pose: { leftShoulder: 76,  leftArm: 64,  rightShoulder: 76,  rightArm: 116, headTilt: 0,   headBob: 6 } },
  { id: 14, name: 'MID_CROSS',      category: 'B', pose: { leftShoulder: 138, leftArm: 136, rightShoulder: 138, rightArm: 44,  headTilt: 0,   headBob: 3 } },

  { id: 15, name: 'FULL_OPEN',      category: 'C', pose: { leftShoulder: 22,  leftArm: 34,  rightShoulder: 158, rightArm: 146, headTilt: 0,   headBob: -2 } },
  { id: 16, name: 'FULL_CROSS',     category: 'C', pose: { leftShoulder: 158, leftArm: 148, rightShoulder: 22,  rightArm: 32,  headTilt: 0,   headBob: 5 } },
  { id: 17, name: 'VICTORY_ARMS',   category: 'C', pose: { leftShoulder: 32,  leftArm: 28,  rightShoulder: 32,  rightArm: 152, headTilt: 0,   headBob: -4 } },
  { id: 18, name: 'POWER_LEFT',     category: 'C', pose: { leftShoulder: 12,  leftArm: 36,  rightShoulder: 148, rightArm: 82,  headTilt: -15, headBob: 5 } },
  { id: 19, name: 'POWER_RIGHT',    category: 'C', pose: { leftShoulder: 148, leftArm: 82,  rightShoulder: 12,  rightArm: 36,  headTilt: 15,  headBob: 5 } },
  { id: 20, name: 'FRENZY_SPREAD',  category: 'C', pose: { leftShoulder: 16,  leftArm: 26,  rightShoulder: 164, rightArm: 154, headTilt: 0,   headBob: 8 } },
];

const ENERGY_THRESHOLDS = {
  LOW_MAX: 0.33,
  MID_MAX: 0.66,
};

const ENERGY_WEIGHTS = {
  LOW:  { A: 2.4, B: 0.8, C: 0.15 },
  MID:  { A: 0.8, B: 2.0, C: 0.8 },
  HIGH: { A: 0.15, B: 0.9, C: 2.5 },
};

const DANCE_TIMING = {
  MIN_MS: 2000,
  DEFAULT_MS: 2600,
  MAX_MS: 3000,
};

const STEP_PROTOCOL = {
  INCLUDE_ENERGY: false,
  MIN_REPEAT_GAP: 2,
};

const ENERGY_PROFILE_INTERVAL_MS = 500;
const UI_LERP_SPEED = 0.12;

/*
 * Tunable Markov matrix. Each source state maps to likely next step IDs.
 * Probabilities are intentionally local: most transitions stay in a compatible
 * energy band, while a few bridge states let the robot ramp up or cool down.
 */
const TRANSITION_MATRIX = {
  1:  [{ id: 2, p: 0.35 }, { id: 4, p: 0.25 }, { id: 8, p: 0.20 }, { id: 13, p: 0.15 }, { id: 1, p: 0.05 }],
  2:  [{ id: 3, p: 0.40 }, { id: 5, p: 0.30 }, { id: 1, p: 0.20 }, { id: 4, p: 0.10 }],
  3:  [{ id: 2, p: 0.40 }, { id: 4, p: 0.25 }, { id: 7, p: 0.20 }, { id: 9, p: 0.15 }],
  4:  [{ id: 5, p: 0.30 }, { id: 8, p: 0.25 }, { id: 2, p: 0.20 }, { id: 12, p: 0.15 }, { id: 1, p: 0.10 }],
  5:  [{ id: 4, p: 0.35 }, { id: 3, p: 0.25 }, { id: 9, p: 0.20 }, { id: 14, p: 0.15 }, { id: 1, p: 0.05 }],
  6:  [{ id: 7, p: 0.35 }, { id: 10, p: 0.25 }, { id: 2, p: 0.20 }, { id: 8, p: 0.15 }, { id: 1, p: 0.05 }],
  7:  [{ id: 6, p: 0.35 }, { id: 11, p: 0.25 }, { id: 3, p: 0.20 }, { id: 9, p: 0.15 }, { id: 1, p: 0.05 }],
  8:  [{ id: 9, p: 0.30 }, { id: 12, p: 0.25 }, { id: 10, p: 0.20 }, { id: 15, p: 0.15 }, { id: 4, p: 0.10 }],
  9:  [{ id: 8, p: 0.30 }, { id: 14, p: 0.25 }, { id: 11, p: 0.20 }, { id: 16, p: 0.15 }, { id: 5, p: 0.10 }],
  10: [{ id: 11, p: 0.30 }, { id: 12, p: 0.25 }, { id: 8, p: 0.20 }, { id: 18, p: 0.15 }, { id: 6, p: 0.10 }],
  11: [{ id: 10, p: 0.30 }, { id: 13, p: 0.25 }, { id: 9, p: 0.20 }, { id: 19, p: 0.15 }, { id: 7, p: 0.10 }],
  12: [{ id: 13, p: 0.30 }, { id: 8, p: 0.25 }, { id: 15, p: 0.20 }, { id: 10, p: 0.15 }, { id: 4, p: 0.10 }],
  13: [{ id: 12, p: 0.25 }, { id: 14, p: 0.25 }, { id: 10, p: 0.20 }, { id: 17, p: 0.20 }, { id: 1, p: 0.10 }],
  14: [{ id: 13, p: 0.30 }, { id: 9, p: 0.25 }, { id: 16, p: 0.20 }, { id: 11, p: 0.15 }, { id: 5, p: 0.10 }],
  15: [{ id: 17, p: 0.30 }, { id: 18, p: 0.25 }, { id: 12, p: 0.20 }, { id: 8, p: 0.15 }, { id: 20, p: 0.10 }],
  16: [{ id: 19, p: 0.30 }, { id: 17, p: 0.25 }, { id: 14, p: 0.20 }, { id: 9, p: 0.15 }, { id: 20, p: 0.10 }],
  17: [{ id: 15, p: 0.25 }, { id: 16, p: 0.25 }, { id: 20, p: 0.20 }, { id: 13, p: 0.20 }, { id: 12, p: 0.10 }],
  18: [{ id: 19, p: 0.30 }, { id: 20, p: 0.25 }, { id: 15, p: 0.20 }, { id: 10, p: 0.15 }, { id: 12, p: 0.10 }],
  19: [{ id: 18, p: 0.30 }, { id: 20, p: 0.25 }, { id: 16, p: 0.20 }, { id: 11, p: 0.15 }, { id: 14, p: 0.10 }],
  20: [{ id: 17, p: 0.30 }, { id: 18, p: 0.20 }, { id: 19, p: 0.20 }, { id: 15, p: 0.15 }, { id: 16, p: 0.15 }],
};

/* ================================================================ */
/* SECTION 2: ENGINE                                                */
/* ================================================================ */
const MarkovDance = (() => {
  const statesById = new Map(DANCE_STATES.map(state => [state.id, state]));
  const POSE_FIELDS = ['leftShoulder', 'leftArm', 'rightShoulder', 'rightArm', 'headTilt', 'headBob'];

  let transitionTable = new Map();
  let currentState = DANCE_STATES[0];
  let currentEnergyValue = 0;
  let currentEnergyCategory = 'LOW';
  let recentStateIds = [currentState.id];
  let targetPose = { ...currentState.pose };
  let currentPose = { ...currentState.pose };
  let schedulerTimer = null;
  let energyTimer = null;
  let motionFrameId = null;
  let lastStepCommand = '';

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

  function normalizeProbabilities(candidates) {
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (!total) {
      const equalWeight = 1 / candidates.length;
      return candidates.map(candidate => ({ ...candidate, probability: equalWeight }));
    }

    return candidates.map(candidate => ({
      ...candidate,
      probability: candidate.weight / total,
    }));
  }

  function buildCumulativeProbabilities(candidates) {
    let runningTotal = 0;
    return candidates.map((candidate, index) => {
      runningTotal += candidate.probability;
      return {
        ...candidate,
        cumulative: index === candidates.length - 1 ? 1 : runningTotal,
      };
    });
  }

  function buildTransitionTable() {
    transitionTable = new Map();

    Object.entries(TRANSITION_MATRIX).forEach(([sourceId, transitions]) => {
      const candidates = transitions
        .map(transition => ({
          state: statesById.get(transition.id),
          baseProbability: transition.p,
        }))
        .filter(candidate => candidate.state);

      transitionTable.set(Number(sourceId), candidates);
    });

    console.log(`[MARKOV] Loaded ${transitionTable.size} explicit transition rows.`);
  }

  function updateEnergySample() {
    if (typeof computeBeatEnergy === 'function') {
      computeBeatEnergy();
    }

    const rawEnergy = clamp01(typeof beatEnergy === 'number' ? beatEnergy : 0);
    currentEnergyValue = rawEnergy;
    currentEnergyCategory = classifyEnergy(rawEnergy);

    if (typeof markovIntensity !== 'undefined') markovIntensity = currentEnergyCategory;
    if (typeof markovState !== 'undefined') markovState = currentState.name;
  }

  function getWeightedCandidates() {
    const candidates = transitionTable.get(currentState.id) || transitionTable.get(1);
    const weights = ENERGY_WEIGHTS[currentEnergyCategory];

    const weighted = candidates.map(candidate => {
      const wasRecent = recentStateIds.includes(candidate.state.id);
      const repeatPenalty = wasRecent ? 0.35 : 1;
      const categoryWeight = weights[candidate.state.category] || 1;

      return {
        ...candidate,
        weight: candidate.baseProbability * categoryWeight * repeatPenalty,
      };
    });

    return buildCumulativeProbabilities(normalizeProbabilities(weighted));
  }

  function selectNextState() {
    updateEnergySample();

    const weightedCandidates = getWeightedCandidates();
    const roll = Math.random();
    const selected = weightedCandidates.find(candidate => roll <= candidate.cumulative) || weightedCandidates[weightedCandidates.length - 1];

    return {
      state: selected.state,
      roll,
      candidates: weightedCandidates,
      selected,
    };
  }

  function getAdaptiveDelay() {
    const energyRange = DANCE_TIMING.MAX_MS - DANCE_TIMING.MIN_MS;
    const energyDelay = DANCE_TIMING.MAX_MS - Math.round(currentEnergyValue * energyRange);
    const bpm = typeof estimatedBpm === 'number' && Number.isFinite(estimatedBpm) ? estimatedBpm : 0;

    if (bpm >= 120) return Math.max(DANCE_TIMING.MIN_MS, energyDelay - 250);
    if (bpm > 0 && bpm < 85) return Math.min(DANCE_TIMING.MAX_MS, energyDelay + 250);

    return Math.max(DANCE_TIMING.MIN_MS, Math.min(DANCE_TIMING.MAX_MS, energyDelay || DANCE_TIMING.DEFAULT_MS));
  }

  function formatStepCommand(stateId) {
    if (STEP_PROTOCOL.INCLUDE_ENERGY) {
      return `STEP:${stateId}:${currentEnergyValue.toFixed(2)}`;
    }

    return `STEP:${stateId}`;
  }

  function sendDanceStep(stateId) {
    if (!isSongPlaying()) return;

    const command = formatStepCommand(stateId);
    if (command === lastStepCommand) return;
    lastStepCommand = command;

    if (typeof wsConnected !== 'undefined' && wsConnected && typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(command);
      if (typeof bytesSent !== 'undefined') bytesSent += command.length;
      if (typeof flashTxLight === 'function') flashTxLight('step');
    }

    if (typeof logWS === 'function') {
      logWS(`SENT -> ${command}`, 'tx-cmd');
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

    if (cellIdle) cellIdle.innerText = `LOW x${ENERGY_WEIGHTS[currentEnergyCategory].A.toFixed(1)}`;
    if (cellBounce) cellBounce.innerText = `MID x${ENERGY_WEIGHTS[currentEnergyCategory].B.toFixed(1)}`;
    if (cellWave) cellWave.innerText = `HIGH x${ENERGY_WEIGHTS[currentEnergyCategory].C.toFixed(1)}`;
    if (cellFrenzy) cellFrenzy.innerText = `STEP ${currentState.id}`;
  }

  function updateStateUi(state, transitionMeta) {
    const stateLabel = document.getElementById('markov-state');
    if (stateLabel) stateLabel.innerText = `${state.id}: ${state.name}`;

    ['cell-idle', 'cell-bounce', 'cell-wave', 'cell-frenzy'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.classList.remove('active');
    });

    const activeCellByCategory = {
      A: document.getElementById('cell-idle'),
      B: document.getElementById('cell-bounce'),
      C: document.getElementById('cell-wave'),
    };

    const activeCell = activeCellByCategory[state.category];
    if (activeCell) activeCell.classList.add('active');

    if (typeof logWS === 'function') {
      logWS(
        `MARKOV -> step:${state.id} cat:${state.category} energy:${currentEnergyCategory} p:${transitionMeta.selected.probability.toFixed(2)}`,
        'tx-cmd'
      );
    }
  }

  function applyDanceState(nextState, transitionMeta) {
    currentState = nextState;
    targetPose = { ...nextState.pose };
    recentStateIds.push(nextState.id);

    while (recentStateIds.length > STEP_PROTOCOL.MIN_REPEAT_GAP + 1) {
      recentStateIds.shift();
    }

    updateStateUi(nextState, transitionMeta);
    sendDanceStep(nextState.id);

    console.log(
      `[MARKOV] step=${nextState.id} state=${nextState.name} category=${nextState.category} energy=${currentEnergyValue.toFixed(2)}`
    );
  }

  function updateRobotPose(pose) {
    if (typeof motorOffsets === 'undefined' || typeof motors === 'undefined') return;

    motorOffsets.LSHOULDER = pose.leftShoulder - motors.LSHOULDER;
    motorOffsets.LARM = pose.leftArm - motors.LARM;
    motorOffsets.RSHOULDER = pose.rightShoulder - motors.RSHOULDER;
    motorOffsets.RARM = pose.rightArm - motors.RARM;

    if (typeof headPoseOffset !== 'undefined') {
      headPoseOffset.tilt = pose.headTilt;
      headPoseOffset.bob = pose.headBob;
    }

    if (typeof updateRobotHologram === 'function') {
      updateRobotHologram();
    }
  }

  function motionLoop() {
    POSE_FIELDS.forEach(field => {
      currentPose[field] += (targetPose[field] - currentPose[field]) * UI_LERP_SPEED;
      if (Math.abs(currentPose[field] - targetPose[field]) < 0.25) {
        currentPose[field] = targetPose[field];
      }
    });

    updateRobotPose({
      leftShoulder: Math.round(Math.max(0, Math.min(180, currentPose.leftShoulder))),
      leftArm: Math.round(Math.max(0, Math.min(180, currentPose.leftArm))),
      rightShoulder: Math.round(Math.max(0, Math.min(180, currentPose.rightShoulder))),
      rightArm: Math.round(Math.max(0, Math.min(180, currentPose.rightArm))),
      headTilt: currentPose.headTilt,
      headBob: currentPose.headBob,
    });
    motionFrameId = requestAnimationFrame(motionLoop);
  }

  function scheduleNextTransition() {
    if (!isSongPlaying()) {
      updateEnergySample();
      updateEnergyUi();
      schedulerTimer = setTimeout(scheduleNextTransition, DANCE_TIMING.DEFAULT_MS);
      return;
    }

    const nextStateMeta = selectNextState();
    applyDanceState(nextStateMeta.state, nextStateMeta);
    updateEnergyUi();

    schedulerTimer = setTimeout(scheduleNextTransition, getAdaptiveDelay());
  }

  function sampleEnergyProfile() {
    updateEnergySample();
    updateEnergyUi();
  }

  function startEnergyProfiler() {
    if (energyTimer) clearInterval(energyTimer);
    energyTimer = setInterval(sampleEnergyProfile, ENERGY_PROFILE_INTERVAL_MS);
  }

  function start() {
    console.log('[MARKOV] ==========================================');
    console.log('[MARKOV] GROOVIX STEP Markov Dance Engine starting');
    console.log('[MARKOV] ==========================================');

    buildTransitionTable();
    currentState = DANCE_STATES[0];
    currentEnergyValue = 0;
    currentEnergyCategory = 'LOW';
    recentStateIds = [currentState.id];
    lastStepCommand = '';
    targetPose = { ...currentState.pose };
    currentPose = { ...currentState.pose };

    updateRobotPose(currentState.pose);
    updateEnergyUi();

    if (schedulerTimer) clearTimeout(schedulerTimer);
    if (motionFrameId) cancelAnimationFrame(motionFrameId);

    startEnergyProfiler();
    schedulerTimer = setTimeout(scheduleNextTransition, DANCE_TIMING.DEFAULT_MS);
    motionLoop();

    console.log('[MARKOV] Step engine ready: 20 states | payload: STEP:<id> | cadence: adaptive 2s-3s');
  }

  function stop() {
    if (energyTimer) clearInterval(energyTimer);
    if (schedulerTimer) clearTimeout(schedulerTimer);
    if (motionFrameId) cancelAnimationFrame(motionFrameId);
    energyTimer = null;
    schedulerTimer = null;
    motionFrameId = null;
    console.log('[MARKOV] Dance engine stopped.');
  }

  function refreshTransitions() {
    buildTransitionTable();
    console.log('[MARKOV] Manual transition table refresh executed.');
  }

  function debug() {
    return {
      currentState,
      currentEnergyValue,
      currentEnergyCategory,
      recentStateIds,
      targetPose,
      currentPose,
      transitionTable: Object.fromEntries(transitionTable.entries()),
    };
  }

  return { start, stop, debug, refresh: refreshTransitions };
})();

function initMarkovDanceEngine() {
  MarkovDance.start();
}

window.forceMarkovTransitionRefresh = function() {
  if (typeof MarkovDance !== 'undefined' && typeof MarkovDance.refresh === 'function') {
    MarkovDance.refresh();
  } else {
    console.warn('MarkovDance.refresh() not available');
  }
};
