// var url = "ws://localhost:8080/echo";
// var url = "ws://localhost:8080/chat";
var url = "ws://localhost:8080/chat-echo";
// var url = "ws://localhost:8080/chat-id";
var output;
var socketReady = false;

var websocket = null;

function init() {
  output = document.getElementById("output");

  websocket = new WebSocket(url);

  websocket.onopen = function (e) {
    socketReady = true;
    initWorld();
    createSphere();
    createGround();
    startWorld();
    document.getElementById("websocketStatus").innerHTML = "Connected";
  };

  websocket.onmessage = function (e) {
    document.getElementById("websocketOutput").innerHTML = e.data;
  };

  websocket.onerror = function (e) {
    socketReady = false;
    stopWorld();
    document.getElementById("websocketStatus").innerHTML = '<span style="color: red;">ERROR: ' + e.data + "</span>";
  };

  websocket.onclose = function (e) {
    socketReady = false;
    stopWorld();
    document.getElementById("websocketStatus").innerHTML = "Disconnected";
  };
}

function sendPhysicsUpdate(id, position, rotation) {
  if (!socketReady) return;
  websocket.send(
    `${id}|${position.x},${position.y},${position.z}|${rotation.w},${rotation.x},${rotation.y},${rotation.z}`
  );
}

window.addEventListener("load", init, false);
