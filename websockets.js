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
  };

  socketError = (ev) => {
    this.socketReady = false;
    this.receivedWorldPause();
    document.getElementById("websocketOutputContainer").style.display = "none";
    document.getElementById("websocketError").style.display = "block";
  };

  socketClose = (ev) => {
    this.socketReady = false;
    this.receivedWorldPause();
    document.getElementById("websocketOutputContainer").style.display = "none";
    document.getElementById("websocketStatus").innerHTML = "Disconnected";
  };

  socketMessage = (ev) => {
    // if (!ev.data.startsWith("totalBodies")) console.log(ev);
    if (ev.data === "neosPause") this.receivedWorldPause();
    else if (ev.data === "neosResume") this.receivedWorldResume();
    else if (ev.data === "neosReset") this.receivedWorldReset();
    else if (ev.data.startsWith("add")) this.addBodyFromString(ev.data);
    else if (ev.data.startsWith("remove")) this.removeBodyFromString(ev.data);
    else document.getElementById("websocketOutput").innerHTML = ev.data;
  };

  updateSimulationStatus = (status) => {
    document.getElementById("simulationStatus").innerHTML = status;
  };

  updateSimulationBodyCount = (totalBodies) => {
    if (!this.socketReady) return;
    this.websocket.send(`totalBodies|${totalBodies}`);
  };

  sendPhysicsUpdate = (id, bodyType, position, rotation) => {
    if (!this.socketReady) return;
    this.websocket.send(
      `${id}#${bodyType}%[${position.x};${position.y};${position.z}]|[${rotation.w};${rotation.x};${rotation.y};${rotation.z}]`
    );
  };

  sendRemoveBody = (id) => {
    this.websocket.send(`remove|${id}`);
  };

  sendWorldReset = () => {
    if (!this.socketReady) return;
    this.websocket.send("reset");
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

  removeBodyFromString = (input) => {
    // remove|1
    this.dispatchEvent("removeBody", {
      detail: {
        id: parseInt(input.split("|")[1]),
      },
    });
  };

  addBodyFromString = (input) => {
    // addBox|mass|position|rotation|scale
    const inputArgs = input.split("|");
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
    if (bodyType === "cylinder" || bodyType === "sphere") scale = parseFloat(inputArgs[4]);
    else {
      const scaleArgs = inputArgs[4].split(",");
      scale = { x: parseFloat(positionArgs[0]), y: parseFloat(positionArgs[1]), z: parseFloat(positionArgs[2]) };
    }

    this.dispatchEvent(
      new CustomEvent("createBody", {
        detail: {
          type: bodyType,
          mass: mass,
          position: position,
          rotation: rotation,
          scale: scale,
        },
      })
    );
  };
}

export { NeosPhysicsSockets };
