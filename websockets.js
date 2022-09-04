var url = "ws://localhost:8080/chat-echo";
var output;
var socketReady = false;

var websocket = null;

function init() {
  output = document.getElementById("output");

  websocket = new WebSocket(url);

  websocket.onopen = function (e) {
    socketReady = true;
    document.getElementById("websocketStatus").innerHTML = "Connected";
    document.getElementById("websocketOutputContainer").style.display = "block";    
    document.getElementById("simulationControls").style.display = "block";
    document.getElementById("simluationStatusContainer").style.display = "block";
    buildWorld();
  };

  websocket.onmessage = function (e) {
    if (e.data === "pause") stopWorld();
    else if (e.data === "resume") resumeWorld();    
    else if (e.data === "reset") resetWorld();
    else if (e.data.startsWith("add")) addBodyFromString(e.data);
    else if (e.data.startsWith("remove")) removeBodyFromString(e.data);
    else document.getElementById("websocketOutput").innerHTML = e.data;
  };

  websocket.onerror = function (e) {
    socketReady = false;
    stopWorld();
    document.getElementById("websocketError").style.display = "block";
  };

  websocket.onclose = function (e) {
    socketReady = false;
    stopWorld();
    document.getElementById("websocketStatus").innerHTML = "Disconnected";
  };
}

function updateSimulationStatus(status) {
  document.getElementById("simulationStatus").innerHTML = status;
}

function updateSimulationBodyCount(totalBodies) {
  document.getElementById("simulationTotalBodies").innerHTML = totalBodies;  
}

function sendPhysicsUpdate(id, bodyType, position, rotation) {
  if (!socketReady) return;
  websocket.send(
    `${id}#${bodyType}%[${position.x};${position.y};${position.z}]|[${rotation.w};${rotation.x};${rotation.y};${rotation.z}]`
  );
}

function addBodyFromString(input) {
  // addBox|mass|position|rotation|scale
  inputArgs = input.split('|');
  const bodyType = inputArgs[0].split('add')[1].toLowerCase();
  const mass = parseFloat(inputArgs[1]);

  const positionArgs = inputArgs[2].split(',');
  const position = new CANNON.Vec3(parseFloat(positionArgs[0]), parseFloat(positionArgs[1]), parseFloat(positionArgs[2]));

  const rotationArgs = inputArgs[3].split(',');
  const rotation = new CANNON.Quaternion(parseFloat(rotationArgs[0]), parseFloat(rotationArgs[1]), parseFloat(rotationArgs[2]), parseFloat(rotationArgs[3]));

  let scale = 0;
  console.log(inputArgs);
  if (bodyType === 'cylinder' || bodyType === 'sphere') scale = parseFloat(inputArgs[4]);
  else {
    const scaleArgs = inputArgs[4].split(',');
    scale = new CANNON.Vec3(parseFloat(scaleArgs[0]), parseFloat(scaleArgs[1]), parseFloat(scaleArgs[2]));
  }
  
  createBody(bodyType, mass, position, rotation, scale); 
}

function removeBodyFromString(input) {
  removeBody(parseFloat(input.split('|')[1]));
  console.log('removeBody', input);
}

function sendRemoveBodyById(id) {
  websocket.send(`remove|${id}`);
}

window.addEventListener("load", init, false);
