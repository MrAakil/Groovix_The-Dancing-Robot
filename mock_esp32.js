/* ======================================================== */
/* MOCK_ESP32.JS // MOCK ROBOT HARDWARE RECEIVER            */
/* ======================================================== */

// This script spins up a WebSocket server on port 81 to mock the ESP32.
// It receives servo angle signals and prints them in a clean terminal HUD.

const http = require('http');

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

  const motorAngles = {
    LSHOULDER_V: 90,
    LSHOULDER_H: 90,
    LFOREARM: 90,
    RSHOULDER_V: 90,
    RSHOULDER_H: 90,
    RFOREARM: 90,
    HEAD_YAW: 90,
  };
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

      if (msgStr.startsWith("SET:")) {
        const parts = msgStr.split(":");
        const motorName = parts[1];
        const angle = parseInt(parts[2], 10);

        if (Object.prototype.hasOwnProperty.call(motorAngles, motorName) && Number.isInteger(angle)) {
          motorAngles[motorName] = Math.max(0, Math.min(180, angle));
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
    console.log(" Expected command format: SET:<motor>:<angle>");
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

    console.log(" Active Servo Targets:");
    console.log("---------------------------------------------------------------------");
    Object.entries(motorAngles).forEach(([motorName, angle]) => {
      const barWidth = 30;
      const filledWidth = Math.round((angle / 180) * barWidth);
      const emptyWidth = barWidth - filledWidth;
      const angleBar = "#".repeat(filledWidth) + ".".repeat(emptyWidth);
      console.log(` ${motorName.padEnd(14)} [\x1b[36m${angleBar}\x1b[0m] ${String(angle).padStart(3)} deg`);
    });
    console.log("---------------------------------------------------------------------");
    console.log(" Local ESP32 Action:    servo.write(angle) per received motor signal");
    console.log("=====================================================================");
    console.log(" Press Ctrl+C to terminate the mock server.");
  }
}
