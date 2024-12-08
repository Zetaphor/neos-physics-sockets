class ResonitePhysicsOSC extends EventTarget {
  port = 3333;
  host = "localhost";
  oscReady = false;

  constructor() {
    super();
    this.output = document.getElementById("output");
    this.setupOSC();
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
    this.sendOSCMessage("/bodiesUpdate", JSON.stringify(bodiesData));
  };

  sendRemoveBody = (id) => {
    this.sendOSCMessage("/remove", id);
  };

  sendWorldReset = () => {
    if (!this.oscReady) return;
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

  addedSimulationBody(id, type) {
    this.sendOSCMessage("/addedBody", `${id}&${type}`);
  }

  async sendOSCMessage(address, message = "") {
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
          message
        })
      });
    } catch (error) {
      console.error("Failed to send OSC message:", error);
      this.handleError();
    }
  }
}

export { ResonitePhysicsOSC };