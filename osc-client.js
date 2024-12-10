class ResonitePhysicsOSC extends EventTarget {
  port = 3333;
  host = "localhost";
  oscReady = false;
  bodyStates = new Map(); // Track the last state of each body

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
      // We'll use a simple HTTP request to check if the OSC server is running
      const response = await fetch(`http://${this.host}:3000/status`);
      if (response.ok) {
        this.oscReady = true;
        this.updateStatus("Connected");
        document.getElementById("oscOutputContainer").style.display = "block";
        document.getElementById("resoniteMasterListen").style.display = "block";
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
    document.getElementById("oscError").style.display = "block";
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

      // Only send updates if something changed
      if (positionChanged || rotationChanged) {
        // Send as raw values: /body/id/position x y z
        // if (positionChanged) {
        //   this.sendOSCMessage(`/body/${id}/position`, ...data.position);
        // }
        // // Send as raw values: /body/id/rotation x y z w
        // if (rotationChanged) {
        //   this.sendOSCMessage(`/body/${id}/rotation`, ...data.rotation);
        // }

        // Update the stored state
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
    if (!this.oscReady) return;

    try {
      // We'll send OSC messages through our HTTP server which will forward them via OSC
      await fetch(`http://${this.host}:3000/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          message: messages // Send all arguments as an array
        })
      });
    } catch (error) {
      console.error("Failed to send OSC message:", error);
      this.handleError();
    }
  }
}

export { ResonitePhysicsOSC };