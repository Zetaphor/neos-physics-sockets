class NeosPhysicsSockets {
  url = "ws://localhost:8080/chat-echo";
  output;
  socketReady = false;
  websocket = null;

  constructor() {
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
    document.getElementById("simulationControls").style.display = "block";
    document.getElementById("simluationStatusContainer").style.display = "block";
    buildWorld();
  };

  socketError = (ev) => {
    this.socketReady = false;
    stopWorld();
    document.getElementById("websocketError").style.display = "block";
  };

  socketClose = (ev) => {
    this.socketReady = false;
    stopWorld();
    document.getElementById("websocketStatus").innerHTML = "Disconnected";
  };

  socketMessage = (ev) => {
    if (ev.data === "pause") stopWorld();
    else if (ev.data === "resume") resumeWorld();
    else if (ev.data === "reset") resetWorld();
    else if (ev.data.startsWith("add")) addBodyFromString(ev.data);
    else if (ev.data.startsWith("remove")) removeBodyFromString(ev.data);
    else document.getElementById("websocketOutput").innerHTML = ev.data;
  };

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

  addBodyFromString = (input) => {
    // addBox|mass|position|rotation|scale
    inputArgs = input.split("|");
    const bodyType = inputArgs[0].split("add")[1].toLowerCase();
    const mass = parseFloat(inputArgs[1]);

    const positionArgs = inputArgs[2].split(",");
    const position = new CANNON.Vec3(
      parseFloat(positionArgs[0]),
      parseFloat(positionArgs[1]),
      parseFloat(positionArgs[2])
    );

    const rotationArgs = inputArgs[3].split(",");
    const rotation = new CANNON.Quaternion(
      parseFloat(rotationArgs[0]),
      parseFloat(rotationArgs[1]),
      parseFloat(rotationArgs[2]),
      parseFloat(rotationArgs[3])
    );

    let scale = 0;
    console.log(inputArgs);
    if (bodyType === "cylinder" || bodyType === "sphere") scale = parseFloat(inputArgs[4]);
    else {
      const scaleArgs = inputArgs[4].split(",");
      scale = new CANNON.Vec3(parseFloat(scaleArgs[0]), parseFloat(scaleArgs[1]), parseFloat(scaleArgs[2]));
    }

    createBody(bodyType, mass, position, rotation, scale);
  };

  offlineStart = () => {
    document.getElementById("simulationControls").style.display = "block";
    document.getElementById("simluationStatusContainer").style.display = "block";
    initWorld();
  };
}

export { NeosPhysicsSockets };
