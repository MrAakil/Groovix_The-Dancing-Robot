/* ======================================================== */
/* MOCK_ESP32.JS // MOCK ROBOT HARDWARE RECEIVER            */
/* ======================================================== */

// This script spins up a WebSocket server on port 81 to mock the ESP32.
// It receives real-time beat energy values and motor angles, and prints
// them in a clean terminal HUD interface.

const http = require('http');

// Dynamically check and import ws, installing it if necessary
let WebSocket;
try {
  WebSocket = require('ws');
  startServer();
} catch (err) {
  console.log("Installing 'ws' package to run the mock ESP32 server...");
  const { execSync } = require('child_process');
  try {
    execSync('npm install ws', { stdio: 'inherit' });
    WebSocket = require('ws');
    console.log("'ws' successfully installed.");
    startServer();
  } catch (installErr) {
    console.error("Failed to install 'ws'. Make sure npm is installed and online.");
    console.log("Alternatively, run: npm install ws && node mock_esp32.js");
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('GROOVIX ESP32 Mock Server Online\n');
  });

  const wss = new WebSocket.Server({ noServer: true });

  // Mock robot hardware values
  const motors = {
    LSHOULDER: 90,
    LARM: 90,
    RSHOULDER: 90,
    RARM: 90
  };
  let lastBeatEnergy = 0.0;
  let connectionCount = 0;

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    connectionCount++;
    clearConsole();
    renderHUD("Client Connected.");

    ws.on('message', (message) => {
      const msgStr = message.toString();

      if (msgStr === "PING") {
        ws.send("PONG");
        return;
      }

      if (msgStr.startsWith("BEAT:")) {
        const energy = parseFloat(msgStr.split(":")[1]);
        lastBeatEnergy = energy;
        renderHUD();
      } 
      else if (msgStr.startsWith("SET:")) {
        const parts = msgStr.split(":");
        const motorName = parts[1];
        const angle = parseInt(parts[2]);
        
        if (motors.hasOwnProperty(motorName)) {
          motors[motorName] = angle;
        }
        renderHUD();
      }
    });

    ws.on('close', () => {
      connectionCount--;
      clearConsole();
      renderHUD("Client Disconnected.");
    });
  });

  server.listen(81, () => {
    clearConsole();
    console.log("====================================================");
    console.log(" GROOVIX ESP32 MOCK SERVER IS RUNNING ON PORT 81    ");
    console.log("====================================================");
    console.log(" Awaiting incoming WebSocket connection from web client...");
    console.log(" Expected URL format: ws://localhost:81");
    console.log("====================================================");
  });

  function clearConsole() {
    process.stdout.write('\x1Bc');
  }

  function renderHUD(systemEvent = "") {
    clearConsole();
    console.log("=====================================================================");
    console.log("   GROOVIX ESP32 MOCK HARDWARE RECEIVER // PORT 81                   ");
    console.log("=====================================================================");
    console.log(` Active Connections: [ ${connectionCount} ]`);
    if (systemEvent) {
      console.log(` System Event: \x1b[33m${systemEvent}\x1b[0m`);
    }
    console.log("---------------------------------------------------------------------");
    
    // Draw beat energy slider
    const barWidth = 40;
    const filledWidth = Math.round(lastBeatEnergy * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const beatBar = "█".repeat(filledWidth) + "░".repeat(emptyWidth);
    
    // ANSI coloring: green to red based on energy
    let color = "\x1b[36m"; // Cyan
    if (lastBeatEnergy > 0.5 && lastBeatEnergy <= 0.8) color = "\x1b[32m"; // Green
    if (lastBeatEnergy > 0.8) color = "\x1b[35m"; // Magenta/Purple
    
    console.log(` Realtime Beat Energy:  [${color}${beatBar}\x1b[0m]  ${lastBeatEnergy.toFixed(2)}`);
    console.log("---------------------------------------------------------------------");
    console.log(" Actuator Positions (Angles 0° - 180°):");
    
    Object.keys(motors).forEach(motorName => {
      const angle = motors[motorName];
      const percent = angle / 180;
      const angleBarWidth = 30;
      const filled = Math.round(percent * angleBarWidth);
      const empty = angleBarWidth - filled;
      
      const motorTag = motorName.padEnd(12, ' ');
      const angleBar = "█".repeat(filled) + "░".repeat(empty);
      
      console.log(`   ${motorTag}  :  [${angleBar}]  ${String(angle).padStart(3, ' ')}°`);
    });
    
    console.log("=====================================================================");
    console.log(" Press Ctrl+C to terminate the mock server.");
  }
}
