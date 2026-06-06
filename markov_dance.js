/* ================================================================ */
/* MARKOV_DANCE.JS  //  GROOVIX STEP-BASED DANCE ENGINE             */
/* ================================================================ */

'use strict';

/* ================================================================ */
/* SECTION 1: STATE DEFINITIONS                                     */
/* ================================================================ */
function armPose(leftVertical, leftHorizontal, leftForearm, rightVertical, rightHorizontal, rightForearm, headYaw) {
  return {
    leftShoulderVertical: leftVertical,
    leftShoulderHorizontal: leftHorizontal,
    leftForearm,
    rightShoulderVertical: rightVertical,
    rightShoulderHorizontal: rightHorizontal,
    rightForearm,
    headYaw,
  };
}

const DANCE_STATES = [
  { id: 1,  name: 'REST_NATURAL',   category: 'A', pose: armPose(90,  90,  90,  90,  90,  90,  90) },
  { id: 2,  name: 'SWAY_LEFT',      category: 'A', pose: armPose(76,  72,  104, 102, 106, 82,  72) },
  { id: 3,  name: 'SWAY_RIGHT',     category: 'A', pose: armPose(108, 74,  78,  78,  108, 106, 108) },
  { id: 4,  name: 'GENTLE_OPEN',    category: 'A', pose: armPose(66,  56,  112, 118, 124, 68,  90) },
  { id: 5,  name: 'SOFT_CROSS',     category: 'A', pose: armPose(118, 122, 62,  62,  58,  118, 90) },
  { id: 6,  name: 'LEFT_REACH',     category: 'A', pose: armPose(48,  44,  72,  88,  94,  104, 65) },
  { id: 7,  name: 'RIGHT_REACH',    category: 'A', pose: armPose(92,  86,  104, 48,  136, 72,  115) },

  { id: 8,  name: 'GROOVE_WIDE',    category: 'B', pose: armPose(50,  42,  124, 132, 138, 56,  78) },
  { id: 9,  name: 'GROOVE_NARROW',  category: 'B', pose: armPose(132, 128, 58,  50,  52,  122, 102) },
  { id: 10, name: 'PUMP_LEFT',      category: 'B', pose: armPose(36,  66,  46,  112, 108, 94,  60) },
  { id: 11, name: 'PUMP_RIGHT',     category: 'B', pose: armPose(112, 72,  94,  36,  114, 46,  120) },
  { id: 12, name: 'HALF_WAVE',      category: 'B', pose: armPose(58,  48,  38,  142, 126, 112, 72) },
  { id: 13, name: 'BOUNCE_ARMS',    category: 'B', pose: armPose(76,  80,  64,  76,  100, 116, 90) },
  { id: 14, name: 'MID_CROSS',      category: 'B', pose: armPose(138, 126, 136, 138, 54,  44,  90) },

  { id: 15, name: 'FULL_OPEN',      category: 'C', pose: armPose(22,  30,  34,  158, 150, 146, 90) },
  { id: 16, name: 'FULL_CROSS',     category: 'C', pose: armPose(158, 142, 148, 22,  38,  32,  90) },
  { id: 17, name: 'VICTORY_ARMS',   category: 'C', pose: armPose(32,  58,  28,  32,  122, 152, 90) },
  { id: 18, name: 'POWER_LEFT',     category: 'C', pose: armPose(12,  46,  36,  148, 112, 82,  55) },
  { id: 19, name: 'POWER_RIGHT',    category: 'C', pose: armPose(148, 68,  82,  12,  134, 36,  125) },
  { id: 20, name: 'FRENZY_SPREAD',  category: 'C', pose: armPose(16,  28,  26,  164, 152, 154, 90) },
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
  MIN_MS: 1000,
  DEFAULT_MS: 1500,
  MAX_MS: 2000,
};

const SERVO_PROTOCOL = {
  MIN_REPEAT_GAP: 2,
};

const MARKOV_KINEMATICS = {
  MAX_JOINT_DELTA: 180,
  LOW_SMOOTHING: 1.25,
  MID_SMOOTHING: 0.85,
  HIGH_SMOOTHING: 0.35,
};

const ENERGY_PROFILE_INTERVAL_MS = 500;
const UI_LERP_SPEED = 0.12;

/*
 * Tunable Markov matrix. Each source state maps to likely next pose IDs.
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
  const POSE_FIELDS = [
    'leftShoulderVertical',
    'leftShoulderHorizontal',
    'leftForearm',
    'rightShoulderVertical',
    'rightShoulderHorizontal',
    'rightForearm',
    'headYaw',
  ];

  const SERVO_POSE_MAP = {
    LSHOULDER_V: 'leftShoulderVertical',
    LSHOULDER_H: 'leftShoulderHorizontal',
    LFOREARM: 'leftForearm',
    RSHOULDER_V: 'rightShoulderVertical',
    RSHOULDER_H: 'rightShoulderHorizontal',
    RFOREARM: 'rightForearm',
    HEAD_YAW: 'headYaw',
  };

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
  let lastPoseCommandKey = '';

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

  function getPoseDistance(fromPose, toPose) {
    const totalDistance = POSE_FIELDS.reduce((sum, field) => {
      return sum + Math.abs((toPose[field] || 0) - (fromPose[field] || 0));
    }, 0);

    return totalDistance / (POSE_FIELDS.length * MARKOV_KINEMATICS.MAX_JOINT_DELTA);
  }

  function getKinematicWeight(candidateState) {
    const smoothingByEnergy = {
      LOW: MARKOV_KINEMATICS.LOW_SMOOTHING,
      MID: MARKOV_KINEMATICS.MID_SMOOTHING,
      HIGH: MARKOV_KINEMATICS.HIGH_SMOOTHING,
    };
    const distance = getPoseDistance(currentState.pose, candidateState.pose);
    const smoothing = smoothingByEnergy[currentEnergyCategory] || MARKOV_KINEMATICS.MID_SMOOTHING;

    return Math.max(0.2, 1 - (distance * smoothing));
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
      const kinematicWeight = getKinematicWeight(candidate.state);

      return {
        ...candidate,
        weight: candidate.baseProbability * categoryWeight * repeatPenalty * kinematicWeight,
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

  function getServoTargets(pose) {
    return Object.entries(SERVO_POSE_MAP).map(([motorName, poseField]) => ({
      motorName,
      angle: Math.round(Math.max(0, Math.min(180, pose[poseField]))),
    }));
  }

  function sendServoPose(state) {
    if (!isSongPlaying()) return;

    const servoTargets = getServoTargets(state.pose);
    const poseCommandKey = servoTargets.map(target => `${target.motorName}:${target.angle}`).join('|');
    if (poseCommandKey === lastPoseCommandKey) return;
    lastPoseCommandKey = poseCommandKey;

    const sentCommands = [];

    if (typeof wsConnected !== 'undefined' && wsConnected && typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
      servoTargets.forEach(target => {
        const command = `SET:${target.motorName}:${target.angle}`;
        ws.send(command);
        sentCommands.push(command);
        if (typeof bytesSent !== 'undefined') bytesSent += command.length;
      });
      if (typeof flashTxLight === 'function') flashTxLight('pose');
    }

    if (typeof logWS === 'function') {
      const signalText = servoTargets.map(target => `${target.motorName}:${target.angle}`).join(' ');
      logWS(`SENT -> POSE:${state.id} ${signalText}`, 'tx-cmd');
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
    if (cellFrenzy) cellFrenzy.innerText = `POSE ${currentState.id}`;
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
        `MARKOV -> pose:${state.id} cat:${state.category} energy:${currentEnergyCategory} p:${transitionMeta.selected.probability.toFixed(2)}`,
        'tx-cmd'
      );
    }
  }

  function applyDanceState(nextState, transitionMeta) {
    currentState = nextState;
    targetPose = { ...nextState.pose };
    recentStateIds.push(nextState.id);

    while (recentStateIds.length > SERVO_PROTOCOL.MIN_REPEAT_GAP + 1) {
      recentStateIds.shift();
    }

    updateStateUi(nextState, transitionMeta);
    sendServoPose(nextState);

    console.log(
      `[MARKOV] pose=${nextState.id} state=${nextState.name} category=${nextState.category} energy=${currentEnergyValue.toFixed(2)}`
    );
  }

  function updateRobotPose(pose) {
    if (typeof motorOffsets === 'undefined' || typeof motors === 'undefined') return;

    motorOffsets.LSHOULDER_V = pose.leftShoulderVertical - motors.LSHOULDER_V;
    motorOffsets.LSHOULDER_H = pose.leftShoulderHorizontal - motors.LSHOULDER_H;
    motorOffsets.LFOREARM = pose.leftForearm - motors.LFOREARM;
    motorOffsets.RSHOULDER_V = pose.rightShoulderVertical - motors.RSHOULDER_V;
    motorOffsets.RSHOULDER_H = pose.rightShoulderHorizontal - motors.RSHOULDER_H;
    motorOffsets.RFOREARM = pose.rightForearm - motors.RFOREARM;
    motorOffsets.HEAD_YAW = pose.headYaw - motors.HEAD_YAW;

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
      leftShoulderVertical: Math.round(Math.max(0, Math.min(180, currentPose.leftShoulderVertical))),
      leftShoulderHorizontal: Math.round(Math.max(0, Math.min(180, currentPose.leftShoulderHorizontal))),
      leftForearm: Math.round(Math.max(0, Math.min(180, currentPose.leftForearm))),
      rightShoulderVertical: Math.round(Math.max(0, Math.min(180, currentPose.rightShoulderVertical))),
      rightShoulderHorizontal: Math.round(Math.max(0, Math.min(180, currentPose.rightShoulderHorizontal))),
      rightForearm: Math.round(Math.max(0, Math.min(180, currentPose.rightForearm))),
      headYaw: Math.round(Math.max(0, Math.min(180, currentPose.headYaw))),
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
    console.log('[MARKOV] GROOVIX Servo Markov Dance Engine starting');
    console.log('[MARKOV] ==========================================');

    buildTransitionTable();
    currentState = DANCE_STATES[0];
    currentEnergyValue = 0;
    currentEnergyCategory = 'LOW';
    recentStateIds = [currentState.id];
    lastPoseCommandKey = '';
    targetPose = { ...currentState.pose };
    currentPose = { ...currentState.pose };

    updateRobotPose(currentState.pose);
    updateEnergyUi();

    if (schedulerTimer) clearTimeout(schedulerTimer);
    if (motionFrameId) cancelAnimationFrame(motionFrameId);

    startEnergyProfiler();
    schedulerTimer = setTimeout(scheduleNextTransition, DANCE_TIMING.DEFAULT_MS);
    motionLoop();

    console.log('[MARKOV] Servo engine ready: 20 states | payload: SET:<motor>:<angle> x7 | cadence: adaptive 1s-2s');
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
