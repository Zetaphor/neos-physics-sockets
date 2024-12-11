class ResonitePhysicsOSC extends EventTarget {
  port = 3333;
  host = "localhost";
  oscReady = false;
  bodyStates = new Map(); // Track the last state of each body
  positionScale = 0.1; // Scale factor - adjust this value as needed
  messageCount = 0;
  ws = null;

  constructor() {
    super();
    this.output = document.getElementById("output");
    this.setupOSC();
  }

  // Helper to check if vectors are different (with small epsilon for floating point comparison)
  vectorChanged(a, b, epsilon = 0.0001) {
    if (!a || !b) return true;
    return a.some((val, idx) => Math.abs(val - b[idx]) > epsilon);
  }

  async setupOSC() {
    try {
      // Check if server is running
      const response = await fetch(`http://${this.host}:3000/status`);
      if (response.ok) {
        // Initialize WebSocket connection
        this.ws = new WebSocket(`ws://${this.host}:3000`);

        this.ws.onopen = () => {
          this.oscReady = true;
          this.updateStatus("Connected");
        };

        this.ws.onclose = () => {
          this.handleError();
        };

        this.ws.onerror = () => {
          this.handleError();
        };
      }
    } catch (error) {
      this.handleError();
    }
  }

  updateStatus(status) {
    document.getElementById("oscStatus").innerHTML = status;
  }

  handleError = () => {
    this.oscReady = false;
    this.receivedWorldPause();
    document.getElementById("oscOutputContainer").style.display = "none";
    document.getElementById("resoniteMasterDebug").style.display = "none";
  };

  updateSimulationStatus = (status) => {
    document.getElementById("simulationStatus").innerHTML = status;
  };

  updateSimulationBodyCount = (totalBodies) => {
    if (!this.oscReady) return;
    this.sendOSCMessage("/totalBodies", totalBodies);
  };

  sendPhysicsUpdate = (bodiesData) => {
    if (!this.oscReady) return;

    Object.entries(bodiesData).forEach(([id, data]) => {
      const lastState = this.bodyStates.get(id);
      const positionChanged = !lastState || this.vectorChanged(data.position, lastState.position);
      const rotationChanged = !lastState || this.vectorChanged(data.rotation, lastState.rotation);

      if (positionChanged || rotationChanged) {
        const scaledPosition = data.position.map(val => val * this.positionScale);
        // Send as raw values: /body/update id, x y z, x y z w

        this.sendOSCMessage(`/body/update`, parseInt(this.messageCount), parseInt(id), ...scaledPosition, ...data.rotation);
        this.messageCount++;

        // Store original unscaled values
        this.bodyStates.set(id, {
          type: data.type,
          position: [...data.position],
          rotation: [...data.rotation]
        });
      }
    });
  };

  sendRemoveBody = (id) => {
    if (!this.oscReady) return;
    // Send as raw value: /body/remove id
    this.sendOSCMessage("/body/remove", parseInt(id));
    this.bodyStates.delete(id);
  };

  sendWorldReset = () => {
    if (!this.oscReady) return;
    this.bodyStates.clear(); // Clear stored states
    this.sendOSCMessage("/reset");
  };

  receivedWorldReset = () => {
    this.dispatchEvent(new CustomEvent("resetWorld"));
  };

  receivedWorldResume() {
    this.dispatchEvent(new CustomEvent("resumeWorld"));
  }

  receivedWorldPause() {
    this.dispatchEvent(new CustomEvent("pauseWorld"));
  }

  addedSimulationBody(id, type, position, rotation) {
    // Send as raw values: /body/create id type
    this.sendOSCMessage("/body/create", parseInt(id), type);

    // Initialize the body state tracking
    this.bodyStates.set(id, {
      type,
      position: [...position],
      rotation: [...rotation]
    });
  }

  async sendOSCMessage(address, ...messages) {
    if (!this.oscReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      this.ws.send(JSON.stringify({
        address,
        message: messages
      }));
    } catch (error) {
      console.error("Failed to send OSC message:", error);
      this.handleError();
    }
  }
}

export { ResonitePhysicsOSC };