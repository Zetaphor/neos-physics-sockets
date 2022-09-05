class NeosPhysicsSockets extends EventTarget {
  url = "ws://localhost:8080/chat-echo";
  output;
  socketReady = false;
  websocket = null;
  constructor() {
    super();
    this.output = document.getElementById("output");
    this.websocket = new WebSocket(this.url);
    this.websocket.onopen = this.socketOpen;
    this.websocket.onmessage = this.socketMessage;
    this.websocket.onerror = this.socketError;
    this.websocket.onclose = this.socketClose;
  }

  socketOpen = (ev) => {
    this.socketReady = true;
    document.getElementById("websocketStatus").innerHTML = "Connected";
    document.getElementById("websocketOutputContainer").style.display = "block";
    buildWorld();
  };

  socketError = (ev) => {
    this.socketReady = false;
    this.stopWorld();
    document.getElementById("websocketError").style.display = "block";
  };

  socketClose = (ev) => {
    this.socketReady = false;
    this.stopWorld();
    document.getElementById("websocketStatus").innerHTML = "Disconnected";
  };

  socketMessage = (ev) => {
    if (ev.data === "pause") this.stopWorld();
    else if (ev.data === "resume") resumeWorld();
    else if (ev.data === "reset") resetWorld();
    else if (ev.data.startsWith("add")) addBodyFromString(ev.data);
    else if (ev.data.startsWith("remove")) removeBodyFromString(ev.data);
    else document.getElementById("websocketOutput").innerHTML = ev.data;
  };

  stopWorld() {
    this.dispatchEvent(new CustomEvent("stop"));
  }

  updateSimulationStatus = (status) => {
    document.getElementById("simulationStatus").innerHTML = status;
  };

  updateSimulationBodyCount = (totalBodies) => {
    document.getElementById("simulationTotalBodies").innerHTML = totalBodies;
  };

  sendPhysicsUpdate = (id, bodyType, position, rotation) => {
    if (!this.socketReady) return;
    this.websocket.send(
      `${id}#${bodyType}%[${position.x};${position.y};${position.z}]|[${rotation.w};${rotation.x};${rotation.y};${rotation.z}]`
    );
  };

  sendWorldReset = () => {
    if (!this.socketReady) return;
    this.websocket.send("reset");
  };

  receivedWorldReset = () => {
    this.dispatchEvent(new CustomEvent("reset"));
  };

  addBodyFromString = (input) => {
    // addBox|mass|position|rotation|scale
    inputArgs = input.split("|");
    const bodyType = inputArgs[0].split("add")[1].toLowerCase();
    const mass = parseFloat(inputArgs[1]);

    const positionArgs = inputArgs[2].split(",");
    const position = { x: parseFloat(positionArgs[0]), y: parseFloat(positionArgs[1]), z: parseFloat(positionArgs[2]) };

    const rotationArgs = inputArgs[3].split(",");
    const rotation = {
      x: parseFloat(rotationArgs[0]),
      y: parseFloat(rotationArgs[1]),
      z: parseFloat(rotationArgs[2]),
      w: parseFloat(rotationArgs[3]),
    };

    let scale = 0;
    console.log(inputArgs);
    if (bodyType === "cylinder" || bodyType === "sphere") scale = parseFloat(inputArgs[4]);
    else {
      const scaleArgs = inputArgs[4].split(",");
      scale = { x: parseFloat(positionArgs[0]), y: parseFloat(positionArgs[1]), z: parseFloat(positionArgs[2]) };
    }

    this.dispatchEvent(new CustomEvent("createBody"), {
      type: bodyType,
      mass: mass,
      position: position,
      rotation: rotation,
      scale: scale,
    });
  };

  offlineStart = () => {
    document.getElementById("simulationControls").style.display = "block";
    document.getElementById("simluationStatusContainer").style.display = "block";
    initWorld();
  };
}

export { NeosPhysicsSockets };
