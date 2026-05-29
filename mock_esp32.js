/* ======================================================== */
/* MOCK_ESP32.JS // MOCK ROBOT HARDWARE RECEIVER            */
/* ======================================================== */

// This script spins up a WebSocket server on port 81 to mock the ESP32.
// It receives Markov dance step IDs and prints them in a clean terminal HUD
// interface. The real ESP32 maps these IDs to danceMoves[20] locally.

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

  let currentStep = 1;
  let lastStepEnergy = 0.0;
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

      if (msgStr.startsWith("STEP:")) {
        const parts = msgStr.split(":");
        const step = parseInt(parts[1], 10);
        const energy = parts.length > 2 ? parseFloat(parts[2]) : lastStepEnergy;

        if (Number.isInteger(step) && step >= 1 && step <= 20) {
          currentStep = step;
        }

        if (Number.isFinite(energy)) {
          lastStepEnergy = energy;
        }

        renderHUD();
      } else if (msgStr.startsWith("SET:")) {
        console.log(`Legacy SET command ignored by step-mode mock: ${msgStr}`);
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
    console.log(" Expected command format: STEP:<id> or STEP:<id>:<energy>");
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

    const barWidth = 40;
    const filledWidth = Math.round(lastStepEnergy * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const beatBar = "#".repeat(filledWidth) + ".".repeat(emptyWidth);

    let color = "\x1b[36m";
    if (lastStepEnergy > 0.5 && lastStepEnergy <= 0.8) color = "\x1b[32m";
    if (lastStepEnergy > 0.8) color = "\x1b[35m";

    console.log(` Step Energy Bias:      [${color}${beatBar}\x1b[0m]  ${lastStepEnergy.toFixed(2)}`);
    console.log("---------------------------------------------------------------------");
    console.log(` Active Dance Step:     STEP:${String(currentStep).padStart(2, '0')}`);
    console.log(" Local ESP32 Action:    applyMove(stepNumber)");
    console.log("=====================================================================");
    console.log(" Press Ctrl+C to terminate the mock server.");
  }
}
