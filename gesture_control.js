/* ======================================================== */
/* GESTURE_CONTROL.JS // HAND POSE MOTOR CONTROLLER        */
/* ======================================================== */

// Global gesture state
let gestureState = {
  isInitialized: false,
  hands: null,
  camera: null,
  canvasElement: null,
  canvasCtx: null,
  selectedMotors: null,
  motorAngles: {
    LSHOULDER_V: 90,
    LSHOULDER_H: 90,
    LFOREARM: 90,
    RSHOULDER_V: 90,
    RSHOULDER_H: 90,
    RFOREARM: 90,
    HEAD_YAW: 90
  },
  
  recentFrames: [],             // For jitter filtering
  maxFrameHistory: 5,
  lastSentAngle: {},
  angleSendThreshold: 5,        // Only send if angle changes > 5 degrees
  detectionActive: false
};

// Initialize MediaPipe Hands
async function initGestureControl() {
  try {
    logTerminal("Loading MediaPipe models...", "info");
    
    // Dynamically import MediaPipe Tasks Vision
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0");
    const { FilesetResolver, HandLandmarker } = vision;
    
    const visionOptions = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    gestureState.hands = await HandLandmarker.createFromOptions(visionOptions, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
      },
      runningMode: "VIDEO",
      numHands: 2
    });

    // Setup video element
    const videoElement = document.getElementById('gesture-video');
    if (!videoElement) {
      logTerminal('gesture-video element not found', "error");
      updateGestureStatus('FAILED');
      return false;
    }
    
    // Create camera helper
    const Camera = window.Camera;
    if (!Camera) {
      logTerminal('MediaPipe Camera not found', "error");
      updateGestureStatus('FAILED');
      return false;
    }
    
    gestureState.camera = new Camera(videoElement, {
      onFrame: detectHandGestures,
      width: 480,
      height: 360
    });
    
    // Setup canvas for drawing
    gestureState.canvasElement = document.getElementById('gesture-canvas');
    gestureState.canvasCtx = gestureState.canvasElement.getContext('2d');
    
    // Request camera permissions and start
    await gestureState.camera.start();
    
    gestureState.isInitialized = true;
    gestureState.detectionActive = true;
    logTerminal(`Hand gesture control initialized successfully`, 'ok');
    updateGestureStatus('READY');
    
    return true;
  } catch (error) {
    console.error('Failed to initialize gesture control:', error);
    logTerminal(`Gesture control initialization failed: ${error.message}`, 'error');
    updateGestureStatus('FAILED');
    return false;
  }
}

// Detect hand gestures and landmarks
async function detectHandGestures() {
  if (!gestureState.hands || !gestureState.camera || !gestureState.detectionActive) return;
  
  try {
    const video = document.getElementById('gesture-video');
    const canvas = gestureState.canvasElement;
    const ctx = gestureState.canvasCtx;
    
    // Detect hands
    const results = gestureState.hands.detectForVideo(video, performance.now());
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (results.landmarks && results.landmarks.length > 0) {
      for (let handIdx = 0; handIdx < results.landmarks.length; handIdx++) {
        const landmarks = results.landmarks[handIdx];
        
        // Handle both old API and new Tasks Vision API formats for handedness
        let handLabel = 'Right';
        if (results.handednesses && results.handednesses[handIdx]) {
          const handObj = results.handednesses[handIdx][0] || results.handednesses[handIdx];
          handLabel = handObj.categoryName || handObj.label || 'Right';
        } else if (results.handedness && results.handedness[handIdx]) {
          handLabel = results.handedness[handIdx].label || 'Right';
        }
        
        // Detect finger state
        const fingerStates = detectFingerStates(landmarks);
        
        // Determine which motor to control based on extended fingers
        const selectedMotors = determineSelectedMotors(fingerStates);
        
        // Serialize selected motors for comparison
        const selectedMotorsStr = selectedMotors ? selectedMotors.join(',') : null;
        const currentSelectedMotorsStr = gestureState.selectedMotors ? gestureState.selectedMotors.join(',') : null;
        
        // If a motor is selected and it's a new selection, update UI
        if (selectedMotorsStr !== currentSelectedMotorsStr) {
          gestureState.selectedMotors = selectedMotors;
          updateSelectedMotorDisplay();
          if (selectedMotorsStr) {
            logTerminal(`Motors selected: ${selectedMotorsStr}`, "info");
          }
        }
        
        // If a motor is selected, calculate angle from hand position
        if (gestureState.selectedMotors && gestureState.selectedMotors.length > 0) {
          const angle = calculateAngleFromHandPosition(landmarks, handLabel);
          
          gestureState.selectedMotors.forEach(motor => {
            gestureState.motorAngles[motor] = angle;
            
            // Send motor command if angle changed significantly
            const lastAngle = gestureState.lastSentAngle[motor] || 90;
            if (Math.abs(angle - lastAngle) > gestureState.angleSendThreshold) {
              sendMotorCommand(motor, angle);
              gestureState.lastSentAngle[motor] = angle;
            }
          });
          
          updateAngleDisplay(angle);
        }
        
        // Draw landmarks on canvas
        drawHandLandmarks(ctx, landmarks, handLabel);
      }
    } else {
      // No hands detected - reset motor selection
      if (gestureState.selectedMotors) {
        gestureState.selectedMotors = null;
        updateSelectedMotorDisplay();
        updateGestureStatus('NO HANDS DETECTED');
      }
    }
  } catch (error) {
    console.error('Error in detectHandGestures:', error);
  }
}

// Detect which fingers are extended
function detectFingerStates(landmarks) {
  // Finger indices in MediaPipe HandLandmark
  const THUMB_TIP = 4;
  const INDEX_TIP = 8;
  const MIDDLE_TIP = 12;
  const RING_TIP = 16;
  const PINKY_TIP = 20;
  
  const THUMB_IP = 3;
  const INDEX_PIP = 6;
  const MIDDLE_PIP = 10;
  const RING_PIP = 14;
  const PINKY_PIP = 18;
  
  // A finger is extended if its tip is significantly higher (lower y value) than its PIP joint
  const isIndexExtended = landmarks[INDEX_TIP].y < landmarks[INDEX_PIP].y - 0.015;
  const isMiddleExtended = landmarks[MIDDLE_TIP].y < landmarks[MIDDLE_PIP].y - 0.015;
  const isRingExtended = landmarks[RING_TIP].y < landmarks[RING_PIP].y - 0.015;
  const isPinkyExtended = landmarks[PINKY_TIP].y < landmarks[PINKY_PIP].y - 0.015;
  
  // Thumb is special because it extends horizontally or diagonally
  // We check distance from IP joint to Tip in both X and Y
  const isThumbExtended = Math.abs(landmarks[THUMB_TIP].x - landmarks[THUMB_IP].x) > 0.035 || 
                          landmarks[THUMB_TIP].y < landmarks[THUMB_IP].y - 0.03;
  
  return {
    thumb: isThumbExtended,
    index: isIndexExtended,
    middle: isMiddleExtended,
    ring: isRingExtended,
    pinky: isPinkyExtended
  };
}

// Determine which motor should be controlled based on finger state
function determineSelectedMotors(fingerStates) {
  // Count extended fingers
  const extendedCount = Object.values(fingerStates).filter(v => v).length;
  
  if (extendedCount === 1) {
    return ['HEAD_YAW'];
  } else if (extendedCount === 2) {
    return ['LSHOULDER_V', 'RSHOULDER_V'];
  } else if (extendedCount === 3) {
    return ['LSHOULDER_H', 'RSHOULDER_H'];
  } else if (extendedCount === 4) {
    return ['LFOREARM', 'RFOREARM'];
  }
  
  return null;
}

// Calculate motor angle based on hand position (0-180 degrees)
function calculateAngleFromHandPosition(landmarks, handedness) {
  const PALM_CENTER = 9; // Middle finger base for center reference
  
  // Get hand X position for angle mapping
  const palm = landmarks[PALM_CENTER];
  const hand_center_x = palm.x;
  
  // Map hand X position to angle
  // Left side (x < 0.3) -> 0-90 degrees
  // Center (0.3 < x < 0.7) -> 80-100 degrees
  // Right side (x > 0.7) -> 90-180 degrees
  
  let angle = 90; // Default center position
  
  if (hand_center_x < 0.3) {
    // Left side: map to 0-90
    angle = Math.round((hand_center_x / 0.3) * 90);
  } else if (hand_center_x > 0.7) {
    // Right side: map to 90-180
    angle = Math.round(90 + ((hand_center_x - 0.7) / 0.3) * 90);
  } else {
    // Center area: around 90 degrees
    angle = Math.round(80 + ((hand_center_x - 0.3) / 0.4) * 20);
  }
  
  // Clamp between 0 and 180
  angle = Math.max(0, Math.min(180, angle));
  return angle;
}

// Draw hand landmarks on canvas for visual feedback
function drawHandLandmarks(ctx, landmarks, handedness) {
  // Draw connections (bones)
  ctx.strokeStyle = handedness === 'Right' ? 'rgba(0, 255, 0, 0.6)' : 'rgba(255, 0, 0, 0.6)';
  ctx.lineWidth = 2;
  
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],           // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],           // Index
    [0, 9], [9, 10], [10, 11], [11, 12],      // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],    // Ring
    [0, 17], [17, 18], [18, 19], [19, 20]     // Pinky
  ];
  
  // Draw connections
  for (const connection of HAND_CONNECTIONS) {
    const start = landmarks[connection[0]];
    const end = landmarks[connection[1]];
    ctx.beginPath();
    ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
    ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
    ctx.stroke();
  }
  
  // Draw landmarks (joints)
  ctx.fillStyle = handedness === 'Right' ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
  for (const landmark of landmarks) {
    const x = landmark.x * ctx.canvas.width;
    const y = landmark.y * ctx.canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Send motor control command via WebSocket
function sendMotorCommand(motorName, angle) {
  if (typeof window.setMotorTarget === 'function') {
    window.setMotorTarget(motorName, angle);
    if (typeof window.updateRobotHologram === 'function') {
      window.updateRobotHologram();
    }
  } else {
    // Fallback if running independently
    const cmd = `SET:${motorName}:${angle}`;
    if (typeof wsConnected !== 'undefined' && wsConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(cmd);
      if (typeof bytesSent !== 'undefined') bytesSent += cmd.length;
      if (typeof flashTxLight === 'function') flashTxLight('command');
    }
    if (typeof logWS === 'function') {
      logWS(`GESTURE -> ${cmd}`, 'tx-cmd');
    }
  }
  updateGestureStatus(`${motorName}: ${angle}°`);
}

// Update UI display for selected motor
function updateSelectedMotorDisplay() {
  const display = document.getElementById('gesture-motor-display');
  if (!display) return;
  
  if (gestureState.selectedMotors && gestureState.selectedMotors.length > 0) {
    display.innerHTML = `
      <span class="gesture-label">SELECTED MOTORS</span>
      <span class="gesture-motor-name">${gestureState.selectedMotors.join(', ')}</span>
    `;
  } else {
    display.innerHTML = `
      <span class="gesture-label">SHOW 1-4 FINGERS</span>
      <span class="gesture-motor-name">--</span>
    `;
  }
}

// Update angle display
function updateAngleDisplay(angle) {
  const display = document.getElementById('gesture-angle-display');
  if (display) {
    display.innerHTML = `<span class="gesture-angle">${angle}°</span>`;
  }
}

// Update gesture status indicator
function updateGestureStatus(status) {
  const statusEl = document.getElementById('gesture-status');
  if (statusEl) {
    statusEl.innerText = status;
    // Update color based on status
    if (status.includes('NO HANDS')) {
      statusEl.className = 'hud-pill-neutral';
    } else if (status === 'READY') {
      statusEl.className = 'hud-pill-neon';
      statusEl.style.color = 'var(--neon-green)';
    } else if (status === 'STOPPED') {
      statusEl.className = 'hud-pill-neutral';
    } else {
      statusEl.className = 'hud-pill-neon';
      statusEl.style.color = 'var(--neon-cyan)';
    }
  }
}

// Stop gesture control
function stopGestureControl() {
  gestureState.detectionActive = false;
  if (gestureState.camera) {
    gestureState.camera.stop();
  }
  gestureState.isInitialized = false;
  gestureState.selectedMotors = null;
  updateGestureStatus('STOPPED');
  updateSelectedMotorDisplay();
  updateAngleDisplay(90);
}

