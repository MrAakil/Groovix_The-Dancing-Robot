GROOVIX HAND GESTURE MOTOR CONTROL
===================================

Purpose
-------
The Groovix website has been enhanced with hand gesture-based motor control using MediaPipe Hand Pose Detection.
Instead of audio-driven dance moves, users can now control each of the 7 motors by extending different fingers
and moving their hand left/right to adjust motor angles from 0-180 degrees.

Motor Configuration
-------------------
The system controls 7 motors:
1. LSHOULDER_V  - Left Shoulder Vertical
2. LSHOULDER_H  - Left Shoulder Horizontal  
3. LFOREARM     - Left Forearm
4. RSHOULDER_V  - Right Shoulder Vertical
5. RSHOULDER_H  - Right Shoulder Horizontal
6. RFOREARM     - Right Forearm
7. HEAD_YAW     - Head Yaw (Left/Right rotation)

Gesture Control Mapping
-----------------------

MOTOR SELECTION (extend a single finger):
- THUMB (extended)       → Controls LSHOULDER_V (Motor 1)
- INDEX (extended)       → Controls LSHOULDER_H (Motor 2)
- MIDDLE (extended)      → Controls LFOREARM (Motor 3)
- RING (extended)        → Controls RSHOULDER_V (Motor 4)
- PINKY (extended)       → Controls RSHOULDER_H (Motor 5)
- THUMB + INDEX (both)   → Controls HEAD_YAW (Motor 6)

ANGLE CONTROL (hand horizontal movement):
- Hand moved LEFT        → Angle 0-90 degrees (left position)
- Hand at CENTER         → Angle ~90 degrees (neutral)
- Hand moved RIGHT       → Angle 90-180 degrees (right position)

How It Works
------------

1. CONNECT HARDWARE
   - Connect to ESP32 via WebSocket (existing connection portal)
   - Or use "LOCAL SIMULATOR" for testing without hardware

2. START GESTURE CONTROL
   - Click "START GESTURE CONTROL" button in the Hand Gesture Motor Control card
   - Allow camera access when prompted
   - The camera feed displays in real-time with hand skeleton overlay

3. SELECT A MOTOR
   - Extend a single finger (thumb, index, middle, ring, or pinky)
   - OR extend thumb + index together to control the head
   - The selected motor name displays in the UI

4. MOVE YOUR HAND
   - Move your hand LEFT to control lower angles (0-90 degrees)
   - Move your hand RIGHT to control higher angles (90-180 degrees)
   - The current angle displays in real-time

5. STOP GESTURE CONTROL
   - Click "STOP GESTURE CONTROL" button
   - Camera feed stops and motor selection resets

Technical Details
-----------------

GESTURE DETECTION:
- Uses MediaPipe Hands for real-time hand pose detection
- Detects 21 hand landmarks per hand (wrist, fingers, joints)
- Runs at ~30 FPS for responsive control
- Supports 2 hands simultaneously

FINGER DETECTION:
- Determines if a finger is extended by comparing tip to PIP (Proximal Interphalangeal) joint
- Extension threshold: tip Y-position < PIP Y-position - 0.02 (normalized coordinates)

ANGLE CALCULATION:
- Maps hand X-position (0.0 to 1.0) to servo angle (0-180 degrees)
- Left region (x < 0.3)    → Maps to 0-90 degrees
- Center region (0.3-0.7)  → Maps to 80-100 degrees  
- Right region (x > 0.7)   → Maps to 90-180 degrees

COMMUNICATION:
- Sends `SET:MOTOR_NAME:ANGLE` commands via existing WebSocket connection
- Only sends when angle changes > 5 degrees (reduces noise)
- Motor updates are sent in real-time to ESP32

FILES ADDED/MODIFIED
--------------------

NEW FILES:
- gesture_control.js       - Hand detection and gesture recognition module

MODIFIED FILES:
- index.html               - Added MediaPipe library scripts, gesture UI card
- script.js                - Added gesture control initialization and event listeners
- style.css                - Added gesture control card and UI styling

API/Functions
-------------

Gesture Control Module (gesture_control.js):

1. initGestureControl()
   - Initializes MediaPipe Hands model and camera
   - Returns: Promise<boolean> - success/failure status

2. detectHandGestures()
   - Called on each camera frame
   - Detects hands, landmarks, finger states
   - Determines selected motor and angle

3. sendMotorCommand(motorName, angle)
   - Sends SET command via WebSocket
   - motorName: string (e.g., 'LSHOULDER_V')
   - angle: number (0-180)

4. stopGestureControl()
   - Stops camera and resets gesture state

5. updateGestureStatus(status)
   - Updates UI status indicator

Browser API Requirements
------------------------

The gesture control system requires:
- Modern browser with WebGL support (for MediaPipe)
- Camera/Webcam access permission
- HTTPS or localhost (for camera access)
- WebSocket connection to ESP32

Browser Compatibility:
- Chrome/Edge 80+
- Firefox 78+
- Safari 15+ (limited, camera may require HTTPS)

Troubleshooting
---------------

Issue: Camera doesn't start
→ Check browser permissions for camera access
→ Ensure using HTTPS or localhost
→ Try a different browser

Issue: Hand detection not working
→ Ensure adequate lighting
→ Keep hands fully visible in frame
→ Move closer to camera (30-60 cm optimal)

Issue: Angle control is jittery
→ Increase hand movement for larger angle changes
→ System filters changes < 5 degrees for stability

Issue: Commands not reaching ESP32
→ Verify WebSocket connection is active (green light in header)
→ Check ESP32 IP address is correct
→ Verify WebSocket port 81 is accessible

Issue: Finger detection not responding
→ Ensure finger is fully extended and visible
→ Try holding gesture for 1-2 seconds
→ Check lighting conditions

ESP32 Integration
-----------------

The ESP32 receives standard SET commands:

    SET:LSHOULDER_V:90
    SET:LSHOULDER_H:75
    SET:LFOREARM:120
    etc.

Existing ESP32 code that handles SET commands will work unchanged.
The gesture control module uses the same WebSocket protocol as the Markov dance system.

Future Enhancements
-------------------

Potential improvements:
1. Dual-hand control for simultaneous motor adjustment
2. Gesture velocity mapping (faster movement = faster angle change)
3. Palm gesture detection for preset pose selection
4. Finger curl detection for on/off toggle
5. Hand height tracking for additional control axis
6. Recorded gesture sequences/macros
7. Calibration UI for personal hand size adjustment

Testing Checklist
-----------------

□ Browser loads without console errors
□ Camera permission dialog appears
□ Hand skeleton visualization displays correctly
□ Single finger extended selects correct motor
□ Thumb + Index selection controls HEAD_YAW
□ Hand movement left/right changes angle 0-180
□ Angle values match hand position smoothly
□ Motor commands appear in WebSocket log
□ Multiple motors can be controlled sequentially
□ Hand detection works in different lighting
□ System stops cleanly when button clicked
□ UI status updates appropriately
□ Works with ESP32 hardware connected
□ Works with local simulator

Example Usage Sequence
----------------------

1. Open website in browser
2. Enter ESP32 IP (or use LOCAL SIMULATOR)
3. Click "ESTABLISH HARDWARE LINK"
4. Click "START GESTURE CONTROL"
5. Allow camera access
6. Extend thumb → select LSHOULDER_V
7. Move hand left → angle goes to 0-50 degrees
8. Move hand right → angle goes to 130-180 degrees
9. Extend index finger → select LSHOULDER_H (motor changes immediately)
10. Repeat for other motors
11. Extend both thumb + index → control head motor
12. Click "STOP GESTURE" when done

That's it! The robot responds in real-time to hand gestures.
