/* ======================================================== */
/* SCRIPT.JS // GROOVIX ROBOT CONTROL ENGINE                 */
/* ======================================================== */

// 1. GLOBAL STATE DEFINITIONS
let ws = null;
let wsConnected = false;
let isDemoMode = false;
let reconnectTimer = null;
let currentIp = "";
let latencyPingTime = 0;
let latencyVal = null;
let bytesSent = 0;
let dataRateInterval = null;

// Audio System Variables
let audioContext = null;
let analyser = null;
let gainNode = null;
let audioBuffer = null;      // Decoded raw audio buffer (immune to file:// CORS blocks)
let audioSourceNode = null;  // Dynamic buffer source node played via Web Audio API
let startTime = 0;           // Playback start reference time
let startOffset = 0;         // Playback current offset in seconds
let playbackDuration = 0;    // Decoded audio track duration in seconds
let progressTimer = null;    // UI progress bar tick timer
let isAudioPlaying = false;
let beatInterval = null;
const beatThrottleMs = 70; // 14 packets/sec
let beatEnergy = 0.0;     // Decay-based beat energy value (0.0 to 1.0)
let bassEnergy = 0.0;     // Current frame raw bass value
let midEnergy = 0.0;
let trebleEnergy = 0.0;

// Beat Detection Config
const bassHistory = [];
const maxBassHistoryLength = 30; // ~1.5s of history at 50fps
let lastBeatTime = 0;
const beatDebounceMs = 280;

// Robotics Config
const motors = {
  LSHOULDER: 90,
  LARM: 90,
  RSHOULDER: 90,
  RARM: 90
};
const motorOffsets = {
  LSHOULDER: 0,
  LARM: 0,
  RSHOULDER: 0,
  RARM: 0
};
const headPoseOffset = {
  tilt: 0,
  bob: 0
};
let isDemoRoutineActive = false;
let demoRoutineTimer = null;

// Markov AI Dance Machine Config
let markovState = "IDLE"; // IDLE, BOUNCE, WAVE, FRENZY
let markovIntensity = "LOW"; // LOW, MID, HIGH
let markovUpdateTimer = null;
let markovCycleCount = 0;

// UI Elements
const connectionPortal = document.getElementById('connection-portal');
const dashboardContainer = document.getElementById('dashboard-container');
const esp32IpInput = document.getElementById('esp32-ip');
const btnConnect = document.getElementById('btn-connect');
const btnDemo = document.getElementById('btn-demo');
const btnDisconnect = document.getElementById('btn-disconnect');
const portalStatus = document.getElementById('portal-status');
const sysStatus = document.getElementById('sys-status');
const sysLatency = document.getElementById('sys-latency');
const sysBps = document.getElementById('sys-bps');
const terminalLog = document.getElementById('terminal-log');
const wsConsoleLog = document.getElementById('ws-console-log');
const telemetryTxLight = document.getElementById('telemetry-tx-light');

// Sliders and Audio controls
const slides = {
  LSHOULDER: document.getElementById('slide-lshoulder'),
  LARM: document.getElementById('slide-larm'),
  RSHOULDER: document.getElementById('slide-rshoulder'),
  RARM: document.getElementById('slide-rarm')
};
const valLabels = {
  LSHOULDER: document.getElementById('val-lshoulder'),
  LARM: document.getElementById('val-larm'),
  RSHOULDER: document.getElementById('val-rshoulder'),
  RARM: document.getElementById('val-rarm')
};

const btnPlayPause = document.getElementById('btn-play-pause');
const playIcon = document.getElementById('play-icon');
const audioStateTag = document.getElementById('audio-state-tag');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const trackName = document.getElementById('track-name');
const currentTimeLabel = document.getElementById('current-time');
const totalTimeLabel = document.getElementById('total-time');
const progressBarOuter = document.getElementById('progress-bar-outer');
const progressBarFill = document.getElementById('progress-bar-fill');
const volumeSlider = document.getElementById('volume-slider');

// FIX 1: These were missing — caused ReferenceError crashing init()
const btnResetPose = document.getElementById('btn-reset-pose');
const btnDanceDemo = document.getElementById('btn-dance-demo');

// Visualizer Canvas
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId = null;

// ========================================================
// 2. DIAGNOSTIC TERMINAL LOGGING
// ========================================================
function logTerminal(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  let typeSpan = `<span class="log-info">[INFO]</span>`;
  if (type === 'warn') typeSpan = `<span class="log-warn">[WARN]</span>`;
  if (type === 'error') typeSpan = `<span class="log-error">[ERR]</span>`;
  if (type === 'ok') typeSpan = `<span class="log-info" style="color: var(--neon-green)">[OK]</span>`;
  
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${time}]</span> ${typeSpan} ${message}`;
  
  terminalLog.appendChild(line);
  terminalLog.scrollTop = terminalLog.scrollHeight;
}

function logWS(message, type = 'tx-beat') {
  const line = document.createElement('div');
  line.className = `ws-line ${type}`;
  line.innerText = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${message}`;
  
  wsConsoleLog.appendChild(line);
  wsConsoleLog.scrollTop = wsConsoleLog.scrollHeight;
  
  // Cap history at 12 entries
  while (wsConsoleLog.children.length > 12) {
    wsConsoleLog.removeChild(wsConsoleLog.firstChild);
  }
}

// Flash TX Light indicator
function flashTxLight(type = 'beat') {
  telemetryTxLight.classList.add('active');
  if (type === 'beat') {
    telemetryTxLight.innerText = "TX_BEAT";
  } else if (type === 'step') {
    telemetryTxLight.innerText = "TX_STEP";
  } else {
    telemetryTxLight.innerText = "TX_SET";
  }
  setTimeout(() => {
    telemetryTxLight.classList.remove('active');
  }, 45);
}

// ========================================================
// 3. WEBSOCKET PROTOCOL ENGINE
// ========================================================
function connectWebSocket() {
  let host = esp32IpInput.value.trim();
  
  if (!host) {
    logTerminal("Invalid IP Address.", "error");
    alert("Please enter a valid IP address or hostname.");
    return;
  }
  
  // Format host correctly
  if (!host.startsWith("ws://") && !host.startsWith("wss://")) {
    host = `ws://${host}`;
  }
  if (!host.includes(":", 4)) {
    // If no port defined, append default ESP32 WebSockets port 81
    host = `${host}:81`;
  }
  
  currentIp = host;
  isDemoMode = false;
  
  logTerminal(`Initiating network socket connection to: ${host}...`, 'info');
  setConnectionStatus("reconnecting");
  
  btnConnect.disabled = true;
  btnConnect.querySelector('.btn-text').innerText = "CONNECTING LINK...";
  
  try {
    if (ws) {
      ws.close();
    }
    
    ws = new WebSocket(host);
    
    // Latency tracking ping
    let pingInterval = null;
    
    ws.onopen = () => {
      wsConnected = true;
      setConnectionStatus("connected");
      logTerminal(`Network handshake successful. GROOVIX is online!`, 'ok');
      
      // Dismiss connection screen overlay
      setTimeout(() => {
        connectionPortal.classList.add('portal-dismissed');
        dashboardContainer.classList.remove('container-hidden');
        resizeCanvas();
      }, 1000);
      
      // Start ping loop
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          latencyPingTime = performance.now();
          ws.send("PING");
        }
      }, 2000);
    };
    
    ws.onmessage = (event) => {
      const data = event.data;
      if (data === "PONG") {
        const rtt = Math.round(performance.now() - latencyPingTime);
        sysLatency.innerText = `${rtt} ms`;
        sysLatency.style.color = rtt < 100 ? "var(--neon-green)" : "var(--neon-amber)";
      }
    };
    
    ws.onclose = (event) => {
      wsConnected = false;
      clearInterval(pingInterval);
      
      if (!isDemoMode) {
        setConnectionStatus("disconnected");
        logTerminal(`Socket connection lost (Code: ${event.code}).`, 'error');
        
        // Show portal overlay if it was dismissed
        if (!dashboardContainer.classList.contains('container-hidden')) {
          dashboardContainer.classList.add('container-hidden');
          connectionPortal.classList.remove('portal-dismissed');
        }
        
        // Auto-reconnect trigger
        logTerminal(`Attempting auto-reconnection in 5 seconds...`, 'warn');
        reconnectTimer = setTimeout(connectWebSocket, 5000);
      }
      
      btnConnect.disabled = false;
      btnConnect.querySelector('.btn-text').innerText = "ESTABLISH HARDWARE LINK";
    };
    
    ws.onerror = (error) => {
      logTerminal(`Socket channel encountered an error.`, 'error');
    };
    
  } catch (err) {
    logTerminal(`Socket creation failed: ${err.message}`, 'error');
    btnConnect.disabled = false;
    btnConnect.querySelector('.btn-text').innerText = "ESTABLISH HARDWARE LINK";
    setConnectionStatus("disconnected");
  }
}

function activateLocalSimulator() {
  isDemoMode = true;
  wsConnected = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
  
  logTerminal(`Bypassing physical hardware. Offline Simulator Mode initialized.`, 'ok');
  setConnectionStatus("connected"); // Treat as "connected" for UI rendering
  sysLatency.innerText = "SIMULATOR";
  sysLatency.style.color = "var(--neon-purple)";
  
  // Transition views
  setTimeout(() => {
    connectionPortal.classList.add('portal-dismissed');
    dashboardContainer.classList.remove('container-hidden');
    resizeCanvas();
  }, 500);
}

function disconnectHardware() {
  isDemoMode = false;
  wsConnected = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
  
  logTerminal(`Hardware link closed by console command.`, 'warn');
  setConnectionStatus("disconnected");
  
  dashboardContainer.classList.add('container-hidden');
  connectionPortal.classList.remove('portal-dismissed');
  
  // Reset buttons
  btnConnect.disabled = false;
  btnConnect.querySelector('.btn-text').innerText = "ESTABLISH HARDWARE LINK";
}

function setConnectionStatus(state) {
  portalStatus.className = `status-value ${state}`;
  sysStatus.className = `tel-value ${state}`;
  
  if (state === "connected") {
    const text = isDemoMode ? "SIMULATOR ACTIVE" : "LINK ESTABLISHED";
    portalStatus.innerText = text;
    sysStatus.innerText = text;
    sysStatus.style.color = isDemoMode ? "var(--neon-purple)" : "var(--neon-green)";
  } else if (state === "disconnected") {
    portalStatus.innerText = "LINK OFFLINE";
    sysStatus.innerText = "DISCONNECTED";
    sysStatus.style.color = "var(--neon-red)";
  } else if (state === "reconnecting") {
    portalStatus.innerText = "LINK LINKING...";
    sysStatus.innerText = "CONNECTING...";
    sysStatus.style.color = "var(--neon-amber)";
  }
}

// Transmit commands
function sendServoCommand(motorName, angle) {
  const cmd = `SET:${motorName}:${angle}`;
  
  if (wsConnected && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(cmd);
    bytesSent += cmd.length;
    flashTxLight('command');
  }
  
  logWS(`SENT -> ${cmd}`, 'tx-cmd');
}

// FIX 3: Compute fresh beat energy on every send tick, independently of the
// visualizer RAF loop. This guarantees real values reach the ESP32 even if the
// canvas is not yet painted or if a frame was skipped.
function computeBeatEnergy() {
  if (!analyser || !isAudioPlaying) return;
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  
  // Spectral band energy accumulation
  let localBass = 0;
  let localMid = 0;
  let localTreble = 0;
  
  for (let i = 0; i < 10; i++) localBass += dataArray[i];
  for (let i = 11; i < 80; i++) localMid += dataArray[i];
  for (let i = 81; i < 250; i++) localTreble += dataArray[i];
  
  bassEnergy   = localBass   / 10;
  midEnergy    = localMid    / 70;
  trebleEnergy = localTreble / 170;
  
  const isBeat = detectBeat(bassEnergy);
  const normalizedBass = bassEnergy / 255;
  
  if (isBeat) {
    beatEnergy = 1.0;
  } else {
    // Exponential decay that tracks current bass level
    beatEnergy = beatEnergy * 0.85 + normalizedBass * 0.15;
  }
}

function sendBeatEnergy() {
  if (!isAudioPlaying) return;
  
  // Always pull fresh FFT data before sending so the value is never stale
  computeBeatEnergy();

  // Beat energy now biases Markov STEP selection locally; it is no longer
  // streamed as its own WebSocket packet during dance playback.
}

// Byte data rate telemetry tracker
function startDataRateTracker() {
  dataRateInterval = setInterval(() => {
    const kbps = (bytesSent * 8) / 1000;
    sysBps.innerText = `${kbps.toFixed(1)} kb/s`;
    bytesSent = 0;
  }, 1000);
}

// ========================================================
// 4. MUSIC & WEB AUDIO API ENGINE
// ========================================================
function initAudioEngine() {
  if (audioContext) return; // Already setup
  
  logTerminal("Allocating browser Web Audio nodes...", "info");
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512; // 256 frequency bins, crisp response
    
    gainNode = audioContext.createGain();
    gainNode.gain.value = volumeSlider.value / 100;
    
    analyser.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    logTerminal("Web Audio node matrix route completed.", "ok");
  } catch (err) {
    logTerminal(`Web Audio initiation aborted: ${err.message}`, "error");
  }
}

function handleAudioFile(file) {
  initAudioEngine();
  
  logTerminal(`Loading and decoding track: ${file.name}...`, "info");
  audioStateTag.className = "hud-pill-neutral";
  audioStateTag.innerText = "DECODING...";
  btnPlayPause.disabled = true;
  
  // Stop existing playback if any
  stopPlayback();
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result;
    
    audioContext.decodeAudioData(arrayBuffer, function(buffer) {
      audioBuffer = buffer;
      playbackDuration = buffer.duration;
      trackName.innerText = file.name;
      totalTimeLabel.innerText = formatTime(playbackDuration);
      currentTimeLabel.innerText = "0:00";
      progressBarFill.style.width = "0%";
      startOffset = 0;
      
      audioStateTag.className = "hud-pill-neutral";
      audioStateTag.innerText = "READY";
      btnPlayPause.disabled = false;
      playIcon.className = "fa-solid fa-play";
      isAudioPlaying = false;
      
      logTerminal(`Loaded track: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB) - Ready.`, "ok");
    }, function(err) {
      logTerminal(`Error decoding audio data: ${err.message}`, "error");
      audioStateTag.innerText = "ERROR";
    });
  };
  
  reader.onerror = function() {
    logTerminal("FileReader error loading file.", "error");
    audioStateTag.innerText = "ERROR";
  };
  
  reader.readAsArrayBuffer(file);
}

// FIX 2: Must be async and AWAIT resume — otherwise audio starts in a suspended
// context and getByteFrequencyData returns all zeros for the first several frames.
async function togglePlayback() {
  if (!audioBuffer) return;
  
  initAudioEngine();
  
  // Browsers block AudioContext unless resumed on a direct user gesture.
  // CRITICAL: await this — if we don't wait, the context is still suspended when
  // startPlayback() runs, causing the analyser to return all-zero frequency data.
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  
  if (isAudioPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (isAudioPlaying) return;
  
  audioSourceNode = audioContext.createBufferSource();
  audioSourceNode.buffer = audioBuffer;
  audioSourceNode.connect(analyser);
  
  audioSourceNode.onended = function() {
    // Only trigger if we reached the end naturally (not stopped manually)
    const currentElapsed = audioContext.currentTime - startTime;
    if (isAudioPlaying && currentElapsed >= playbackDuration - 0.1) {
      handlePlaybackEnded();
    }
  };
  
  audioSourceNode.start(0, startOffset);
  startTime = audioContext.currentTime - startOffset;
  isAudioPlaying = true;
  
  playIcon.className = "fa-solid fa-pause";
  audioStateTag.className = "hud-pill-neutral playing";
  audioStateTag.innerText = "PLAYING";
  
  // Start progress bar updates
  clearInterval(progressTimer);
  progressTimer = setInterval(updateProgressBar, 100);
  
  logTerminal("Audio stream playing. Markov scheduler is selecting STEP commands...");
}

function pausePlayback() {
  if (!isAudioPlaying) return;
  
  // Save current position
  startOffset = audioContext.currentTime - startTime;
  if (startOffset > playbackDuration) startOffset = playbackDuration;
  
  if (audioSourceNode) {
    audioSourceNode.stop();
    audioSourceNode = null;
  }
  
  isAudioPlaying = false;
  playIcon.className = "fa-solid fa-play";
  audioStateTag.className = "hud-pill-neutral";
  audioStateTag.innerText = "PAUSED";
  
  clearInterval(beatInterval);
  clearInterval(progressTimer);
  logTerminal("Audio stream paused.");
}

function stopPlayback() {
  if (audioSourceNode) {
    try {
      audioSourceNode.stop();
    } catch (e) {}
    audioSourceNode = null;
  }
  isAudioPlaying = false;
  startOffset = 0;
  clearInterval(beatInterval);
  clearInterval(progressTimer);
}

function handlePlaybackEnded() {
  isAudioPlaying = false;
  startOffset = 0;
  playIcon.className = "fa-solid fa-play";
  audioStateTag.className = "hud-pill-neutral";
  audioStateTag.innerText = "FINISHED";
  clearInterval(beatInterval);
  clearInterval(progressTimer);
  progressBarFill.style.width = "0%";
  currentTimeLabel.innerText = "0:00";
  logTerminal("Audio playback completed.");
}

function updateProgressBar() {
  if (!isAudioPlaying) return;
  const current = audioContext.currentTime - startTime;
  if (current >= playbackDuration) {
    currentTimeLabel.innerText = formatTime(playbackDuration);
    progressBarFill.style.width = "100%";
    return;
  }
  currentTimeLabel.innerText = formatTime(current);
  const percent = (current / playbackDuration) * 100;
  progressBarFill.style.width = `${percent}%`;
}

// Time track formatting helper
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Drag & drop handlers
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const ext = files[0].name.split('.').pop().toLowerCase();
    if (ext === 'mp3' || ext === 'wav') {
      handleAudioFile(files[0]);
    } else {
      alert("Unsupported file format. Please upload MP3 or WAV audio.");
    }
  }
});

dropzone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleAudioFile(fileInput.files[0]);
  }
});

// Click on progress bar to seek
progressBarOuter.addEventListener('click', (e) => {
  if (!audioBuffer) return;
  const rect = progressBarOuter.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percent = clickX / rect.width;
  const targetTime = percent * playbackDuration;
  
  const wasPlaying = isAudioPlaying;
  
  stopPlayback();
  
  startOffset = targetTime;
  currentTimeLabel.innerText = formatTime(startOffset);
  progressBarFill.style.width = `${percent * 100}%`;
  
  if (wasPlaying) {
    startPlayback();
  }
});

volumeSlider.addEventListener('input', () => {
  const val = volumeSlider.value;
  if (gainNode) {
    gainNode.gain.value = val / 100;
  }
});

// ========================================================
// 5. BEAT DETECTION ALGORITHM
// ========================================================
function detectBeat(bassVal) {
  // Add to historical rolling array
  bassHistory.push(bassVal);
  if (bassHistory.length > maxBassHistoryLength) {
    bassHistory.shift();
  }
  
  // Calculate average historical bass energy
  const sum = bassHistory.reduce((a, b) => a + b, 0);
  const avg = sum / (bassHistory.length || 1);
  
  // Threshold multiplier. Adapts based on intensity (lowered for higher sensitivity)
  let threshold = 1.18;
  if (markovIntensity === "HIGH") threshold = 1.12; // More sensitive when music is driving hard
  
  const now = performance.now();
  
  // A beat occurs if the current energy spikes significantly above average (cutoff lowered from 40 to 15)
  if (bassVal > avg * threshold && now - lastBeatTime > beatDebounceMs && bassVal > 15) {
    lastBeatTime = now;
    return true;
  }
  return false;
}

// ========================================================
// 6. CANVAS REALTIME AUDIO VISUALIZER
// ========================================================
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);

function drawVisualizer() {
  animationFrameId = requestAnimationFrame(drawVisualizer);
  
  if (!analyser || !isAudioPlaying) {
    // Static state graphics when idle
    drawStaticVisualizer();
    return;
  }
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  
  const timeArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(timeArray);
  
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas with trace transparency for tail bleed glow
  ctx.fillStyle = 'rgba(6, 6, 12, 0.2)';
  ctx.fillRect(0, 0, width, height);
  
  // Draw subtle grid
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < width; x += 40) {
    ctx.moveTo(x, 0); ctx.lineTo(x, height);
  }
  for (let y = 0; y < height; y += 40) {
    ctx.moveTo(0, y); ctx.lineTo(width, y);
  }
  ctx.stroke();

  // SPECTRAL BANDS — use computeBeatEnergy() to update the global band energy
  // variables (bassEnergy, midEnergy, trebleEnergy, beatEnergy) from fresh FFT data.
  // The visualizer reuses those globals so there's a single source of truth.
  computeBeatEnergy();
  
  // Update vertical level meters from freshly computed globals
  document.getElementById('val-bass').innerText = (bassEnergy / 255).toFixed(2);
  document.getElementById('val-mid').innerText = (midEnergy / 255).toFixed(2);
  document.getElementById('val-treble').innerText = (trebleEnergy / 255).toFixed(2);
  
  document.getElementById('fill-bass').style.height = `${(bassEnergy / 255) * 100}%`;
  document.getElementById('fill-mid').style.height = `${(midEnergy / 255) * 100}%`;
  document.getElementById('fill-treble').style.height = `${(trebleEnergy / 255) * 100}%`;

  // Beat HUD visual pulse
  if (beatEnergy > 0.85) {
    document.getElementById('hologram-beat-energy').style.color = "var(--neon-purple)";
    document.getElementById('hologram-beat-energy').style.textShadow = "var(--glow-purple)";
  } else {
    document.getElementById('hologram-beat-energy').style.color = "var(--neon-cyan)";
    document.getElementById('hologram-beat-energy').style.textShadow = "none";
  }
  
  document.getElementById('hologram-beat-energy').innerText = `BEAT ENERGY: ${beatEnergy.toFixed(2)}`;
  
  // DRAW RADIAL SPECTRUM VISUALIZER
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(centerX, centerY) * 0.45 + (beatEnergy * 15);
  
  // Pulsing central aura
  const radialGlow = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.4, centerX, centerY, baseRadius * 1.5);
  radialGlow.addColorStop(0, `rgba(189, 0, 255, ${0.15 * beatEnergy})`);
  radialGlow.addColorStop(0.5, `rgba(0, 240, 255, ${0.05 * beatEnergy})`);
  radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radialGlow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw radial bars
  const numBars = 120;
  for (let i = 0; i < numBars; i++) {
    const angle = (i / numBars) * Math.PI * 2;
    
    // Distribute data points symmetrically
    const arrayIndex = Math.floor(Math.abs(Math.sin(angle)) * (bufferLength / 2));
    const rawVal = dataArray[arrayIndex];
    const barHeight = (rawVal / 255) * 45;
    
    const xStart = centerX + Math.cos(angle) * baseRadius;
    const yStart = centerY + Math.sin(angle) * baseRadius;
    const xEnd = centerX + Math.cos(angle) * (baseRadius + barHeight);
    const yEnd = centerY + Math.sin(angle) * (baseRadius + barHeight);
    
    // Multi-color gradients based on angle
    const hue = (i / numBars) * 360;
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${0.3 + (rawVal / 255) * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }
  
  // Draw inner digital oscilloscope
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'var(--neon-cyan)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  
  for (let i = 0; i < bufferLength; i += 2) {
    const angle = (i / bufferLength) * Math.PI * 2;
    const timeDomainVal = (timeArray[i] / 128.0) - 1.0; // Normalized between -1.0 and 1.0
    const oscRadius = baseRadius - 8 + (timeDomainVal * 12);
    
    const x = centerX + Math.cos(angle) * oscRadius;
    const y = centerY + Math.sin(angle) * oscRadius;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0; // Reset
  
  // Draw center hub ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius - 10, 0, Math.PI * 2);
  ctx.stroke();
  
  // Apply mechanical beat expansions to the Robot model SVG reactor core
  updateRobotHologram();
}

function drawStaticVisualizer() {
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.fillStyle = '#06060c';
  ctx.fillRect(0, 0, width, height);
  
  // Draw static radar oscilloscope ring
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(centerX, centerY) * 0.45;
  
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Small sweep lines
  const time = performance.now() * 0.001;
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
  ctx.shadowColor = 'var(--neon-cyan)';
  ctx.shadowBlur = 4;
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  const startAngle = time % (Math.PI * 2);
  ctx.arc(centerX, centerY, baseRadius, startAngle, startAngle + 0.3);
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  // Grid background details
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.015)';
  ctx.beginPath();
  for (let x = 0; x < width; x += 40) {
    ctx.moveTo(x, 0); ctx.lineTo(x, height);
  }
  ctx.stroke();
}

// ========================================================
// 7. ROBOT HARDWARE & SVG VISUALIZATION MODULATOR
// ========================================================
function updateRobotHologram() {
  // Read motor values (sum of manual and procedural Markov offsets)
  const lShoulderFinal = Math.max(0, Math.min(180, motors.LSHOULDER + motorOffsets.LSHOULDER));
  const lArmFinal = Math.max(0, Math.min(180, motors.LARM + motorOffsets.LARM));
  const rShoulderFinal = Math.max(0, Math.min(180, motors.RSHOULDER + motorOffsets.RSHOULDER));
  const rArmFinal = Math.max(0, Math.min(180, motors.RARM + motorOffsets.RARM));
  
  // Map angles to SVG rotation degrees
  // SVG default orientations:
  // LSHOULDER points vertical (rotate = 90 makes it point down. Range 0 to 180 flips arm)
  // Left arm default is rotated 90. To reflect 0-180 range, we calculate rotations relative to hinge anchor.
  // We offset it so that angle 90 is natural horizontal/diagonal rest.
  const svgLShoulderRot = lShoulderFinal; 
  const svgLArmRot = lArmFinal - 90; // relative to shoulder
  
  const svgRShoulderRot = -rShoulderFinal;
  const svgRArmRot = -(rArmFinal - 90); // relative to shoulder
  
  // Apply rotation transforms to elements
  document.getElementById('lshoulder-rotator').setAttribute('transform', `rotate(${svgLShoulderRot})`);
  document.getElementById('larm-rotator').setAttribute('transform', `rotate(${svgLArmRot})`);
  document.getElementById('rshoulder-rotator').setAttribute('transform', `rotate(${svgRShoulderRot})`);
  document.getElementById('rarm-rotator').setAttribute('transform', `rotate(${svgRArmRot})`);
  
  // Beat expansions on visor and reactor core
  const reactorBg = document.getElementById('reactor-core-bg');
  const reactorCore = document.getElementById('reactor-core');
  const visor = document.getElementById('robot-visor');
  const headGroup = document.getElementById('robot-head-group');
  
  const baseCoreRadius = 22 + (beatEnergy * 14);
  reactorBg.setAttribute('r', baseCoreRadius);
  reactorCore.setAttribute('r', 10 + (beatEnergy * 4));
  
  // Pulsing visor colors between Magenta (High energy beat) and Cyan
  if (beatEnergy > 0.6) {
    visor.setAttribute('stroke', '#bd00ff');
    visor.setAttribute('stroke-width', '7');
  } else {
    visor.setAttribute('stroke', '#00f0ff');
    visor.setAttribute('stroke-width', '5');
  }
  
  // Markov steps provide intentional head motion; beat energy adds a small pulse.
  const headBob = headPoseOffset.bob + (beatEnergy * 5);
  headGroup.setAttribute('transform', `translate(0, ${headBob}) rotate(${headPoseOffset.tilt} 200 105)`);
}

// Reset Motor angles back to nominal poses (90 deg)
function resetRobotPose() {
  logTerminal("Command sent: RESET_POSE calibration.", "warn");
  isDemoRoutineActive = false;
  if (demoRoutineTimer) clearTimeout(demoRoutineTimer);
  
  Object.keys(motors).forEach(m => {
    motors[m] = 90;
    slides[m].value = 90;
    valLabels[m].innerText = "90°";
    sendServoCommand(m, 90);
  });
  
  // Reset offsets
  Object.keys(motorOffsets).forEach(m => {
    motorOffsets[m] = 0;
  });
  headPoseOffset.tilt = 0;
  headPoseOffset.bob = 0;
  
  updateRobotHologram();
}

// Procedural mechanical sweep routine
function triggerDanceDemo() {
  logTerminal("Command sent: DANCE_DEMO sequence initiation.", "warn");
  isDemoRoutineActive = true;
  let step = 0;
  
  function executeStep() {
    if (!isDemoRoutineActive) return;
    
    switch (step % 5) {
      case 0: // Pose 1: Left high, right low
        setMotorTarget('LSHOULDER', 150);
        setMotorTarget('LARM', 60);
        setMotorTarget('RSHOULDER', 30);
        setMotorTarget('RARM', 120);
        break;
      case 1: // Pose 2: Mirror pose
        setMotorTarget('LSHOULDER', 30);
        setMotorTarget('LARM', 120);
        setMotorTarget('RSHOULDER', 150);
        setMotorTarget('RARM', 60);
        break;
      case 2: // Pose 3: Arms Out wide
        setMotorTarget('LSHOULDER', 120);
        setMotorTarget('LARM', 90);
        setMotorTarget('RSHOULDER', 120);
        setMotorTarget('RARM', 90);
        break;
      case 3: // Pose 4: Arms tucked in
        setMotorTarget('LSHOULDER', 45);
        setMotorTarget('LARM', 160);
        setMotorTarget('RSHOULDER', 45);
        setMotorTarget('RARM', 160);
        break;
      case 4: // Pose 5: Mid rest
        setMotorTarget('LSHOULDER', 90);
        setMotorTarget('LARM', 90);
        setMotorTarget('RSHOULDER', 90);
        setMotorTarget('RARM', 90);
        break;
    }
    
    step++;
    demoRoutineTimer = setTimeout(executeStep, 1000);
  }
  
  executeStep();
}

function setMotorTarget(motor, angle) {
  motors[motor] = angle;
  slides[motor].value = angle;
  valLabels[motor].innerText = `${angle}°`;
  sendServoCommand(motor, angle);
}

// Bind sliders
Object.keys(slides).forEach(m => {
  slides[m].addEventListener('input', () => {
    isDemoRoutineActive = false; // Override manual demo
    const val = parseInt(slides[m].value);
    motors[m] = val;
    valLabels[m].innerText = `${val}°`;
    
    sendServoCommand(m, val);
    updateRobotHologram();
  });
});

// ========================================================
// 8. MARKOV AI KINETIC DECISION ENGINE
// ========================================================
function runMarkovAIController() {
  markovUpdateTimer = setInterval(() => {
    if (!isAudioPlaying) {
      // Revert to IDLE state
      transitionMarkovState("IDLE");
      markovIntensity = "LOW";
      updateMarkovIntensityUI();
      Object.keys(motorOffsets).forEach(m => motorOffsets[m] = 0);
      updateRobotHologram();
      return;
    }
    
    // Classify audio energy
    const rollingAvgBass = bassHistory.reduce((a,b)=>a+b, 0) / (bassHistory.length || 1);
    
    // Threshold boundaries
    if (rollingAvgBass < 35) {
      markovIntensity = "LOW";
    } else if (rollingAvgBass >= 35 && rollingAvgBass < 85) {
      markovIntensity = "MID";
    } else {
      markovIntensity = "HIGH";
    }
    
    updateMarkovIntensityUI();
    
    // Markov state transition matrix evaluation
    const roll = Math.random() * 100;
    
    if (markovIntensity === "LOW") {
      // 85% remain IDLE, 15% BOUNCE
      if (markovState !== "IDLE" && markovState !== "BOUNCE") {
        transitionMarkovState("IDLE");
      } else if (markovState === "IDLE" && roll < 15) {
        transitionMarkovState("BOUNCE");
      } else if (markovState === "BOUNCE" && roll < 70) {
        transitionMarkovState("IDLE");
      }
    } 
    else if (markovIntensity === "MID") {
      // Transitions between BOUNCE (60%) and WAVE (40%)
      if (markovState === "IDLE") {
        transitionMarkovState("BOUNCE");
      } else if (markovState === "BOUNCE" && roll < 40) {
        transitionMarkovState("WAVE");
      } else if (markovState === "WAVE" && roll < 50) {
        transitionMarkovState("BOUNCE");
      } else if (markovState === "FRENZY") {
        transitionMarkovState("WAVE");
      }
    } 
    else if (markovIntensity === "HIGH") {
      // 70% chance to jump into FRENZY, 30% WAVE
      if (markovState !== "FRENZY" && markovState !== "WAVE") {
        transitionMarkovState("WAVE");
      } else if (markovState === "WAVE" && roll < 65) {
        transitionMarkovState("FRENZY");
      } else if (markovState === "FRENZY" && roll < 30) {
        transitionMarkovState("WAVE");
      }
    }
    
  }, 1400); // Decides next pose parameters every 1.4 seconds
}

function transitionMarkovState(newState) {
  markovState = newState;
  document.getElementById('markov-state').innerText = markovState;
  
  // Highlights active cells in the UI visual matrix
  const cells = {
    IDLE: document.getElementById('cell-idle'),
    BOUNCE: document.getElementById('cell-bounce'),
    WAVE: document.getElementById('cell-wave'),
    FRENZY: document.getElementById('cell-frenzy')
  };
  
  Object.keys(cells).forEach(c => {
    if (c === newState) {
      cells[c].classList.add('active');
    } else {
      cells[c].classList.remove('active');
    }
  });

  // Log decision event to Outbox console
  logWS(`AI STATE TRANSITION -> [${newState}]`, 'tx-cmd');
}

function updateMarkovIntensityUI() {
  const badge = document.getElementById('markov-intensity');
  badge.innerText = markovIntensity;
  badge.className = `m-value-intensity ${markovIntensity.toLowerCase()}`;
  
  // Highlight active probabilities dynamic text
  const idleCell = document.getElementById('cell-idle');
  const bounceCell = document.getElementById('cell-bounce');
  const waveCell = document.getElementById('cell-wave');
  const frenzyCell = document.getElementById('cell-frenzy');
  
  if (markovIntensity === "LOW") {
    idleCell.innerText = "IDLE (85%)";
    bounceCell.innerText = "BOUNCE (15%)";
    waveCell.innerText = "WAVE (0%)";
    frenzyCell.innerText = "FRENZY (0%)";
    document.getElementById('markov-blend').innerText = "15%";
  } else if (markovIntensity === "MID") {
    idleCell.innerText = "IDLE (0%)";
    bounceCell.innerText = "BOUNCE (60%)";
    waveCell.innerText = "WAVE (40%)";
    frenzyCell.innerText = "FRENZY (0%)";
    document.getElementById('markov-blend').innerText = "55%";
  } else {
    idleCell.innerText = "IDLE (0%)";
    bounceCell.innerText = "BOUNCE (0%)";
    waveCell.innerText = "WAVE (30%)";
    frenzyCell.innerText = "FRENZY (70%)";
    document.getElementById('markov-blend').innerText = "90%";
  }
}

// procedural kinematic animation frame calculations
function computeProceduralOscillations() {
  requestAnimationFrame(computeProceduralOscillations);
  
  if (!isAudioPlaying) {
    // Revert offsets back to zero smoothly
    Object.keys(motorOffsets).forEach(m => {
      motorOffsets[m] *= 0.95; // exponential decay decay
      if (Math.abs(motorOffsets[m]) < 0.1) motorOffsets[m] = 0;
    });
    updateRobotHologram();
    return;
  }
  
  const time = performance.now() * 0.001; // absolute time
  
  // Markov Action Maps
  switch (markovState) {
    case "IDLE":
      // Tiny breathing drift
      motorOffsets.LSHOULDER = Math.sin(time * 1.5) * 3;
      motorOffsets.RSHOULDER = -Math.sin(time * 1.5) * 3;
      motorOffsets.LARM = Math.cos(time * 1.5) * 2;
      motorOffsets.RARM = -Math.cos(time * 1.5) * 2;
      break;
      
    case "BOUNCE":
      // Vertical hip/shoulder bounce synchronized with beat decay
      const bounceAmp = 18 * beatEnergy;
      motorOffsets.LSHOULDER = Math.sin(time * 5) * bounceAmp;
      motorOffsets.RSHOULDER = Math.sin(time * 5) * bounceAmp;
      motorOffsets.LARM = Math.cos(time * 5) * (bounceAmp * 0.7);
      motorOffsets.RARM = Math.cos(time * 5) * (bounceAmp * 0.7);
      break;
      
    case "WAVE":
      // Out of phase arm waving
      motorOffsets.LSHOULDER = Math.sin(time * 3) * 28;
      motorOffsets.RSHOULDER = -Math.sin(time * 3) * 28;
      motorOffsets.LARM = Math.sin(time * 3.5 + Math.PI/2) * 15;
      motorOffsets.RARM = -Math.sin(time * 3.5 + Math.PI/2) * 15;
      break;
      
    case "FRENZY":
      // High-speed jittering and sweeps driven by beat energy
      const frenzySpeed = 10 + (beatEnergy * 5);
      const intensityScale = 35 * beatEnergy;
      
      motorOffsets.LSHOULDER = Math.sin(time * frenzySpeed) * intensityScale;
      motorOffsets.RSHOULDER = Math.cos(time * (frenzySpeed * 0.9)) * intensityScale;
      motorOffsets.LARM = Math.sin(time * (frenzySpeed * 1.2)) * (intensityScale * 0.8);
      motorOffsets.RARM = Math.cos(time * (frenzySpeed * 1.1)) * (intensityScale * 0.8);
      break;
  }
  
  updateRobotHologram();
  
  // Hardware dance motion is now STEP-based. This legacy visual oscillator may
  // still animate the dashboard if invoked, but it must not stream servo angles.
}

// ========================================================
// 9. EVENT REGISTRATIONS & STARTUP INITIALIZATION
// ========================================================
function init() {
  logTerminal("Attaching dashboard controls and click event bindings...", "info");
  
  btnConnect.addEventListener('click', connectWebSocket);
  btnDemo.addEventListener('click', activateLocalSimulator);
  btnDisconnect.addEventListener('click', disconnectHardware);
  
  btnPlayPause.addEventListener('click', togglePlayback);
  btnResetPose.addEventListener('click', resetRobotPose);
  btnDanceDemo.addEventListener('click', triggerDanceDemo);
  
  // Setup visualizer sizes
  resizeCanvas();
  drawStaticVisualizer();
  
  // Start visual loop
  drawVisualizer();
  
  // Start telemetry logs and trackers
  startDataRateTracker();
  if (typeof initMarkovDanceEngine === 'function') {
    initMarkovDanceEngine();
  } else {
    logTerminal("Markov dance module not loaded.", "warn");
  }
  
  logTerminal("GROOVIX AI Robotics OS fully online and responsive.", "ok");
}

window.onload = init;
