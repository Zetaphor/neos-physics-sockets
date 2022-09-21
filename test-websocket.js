var url = "ws://localhost:8080/chat-echo";
var output;

var websocket = null;
const socketUrlInput = document.getElementById("socketUrl");
console.log("Loaded");

function connect() {
  output = document.getElementById("output");
  websocket = new WebSocket(socketUrlInput.value);

  websocket.onopen = function (e) {
    document.getElementById("websocketStatus").innerHTML = "Connected";
    document.getElementById("websocketOutputContainer").style.display = "block";
  };

  websocket.onmessage = function (e) {
    console.log("Message:", e.data);
    document.getElementById("websocketOutput").innerHTML = e.data;
  };

  websocket.onerror = function (e) {
    document.getElementById("websocketError").style.display = "block";
  };

  websocket.onclose = function (e) {
    document.getElementById("websocketStatus").innerHTML = "Disconnected";
  };
}

function disconnect() {
  console.log("Disconnect");
  websocket.disconnect();
}

async function createSocket() {
  let response = await fetch("http://localhost:3000/create/12");

  if (response.ok) {
    const socketUrl = await response.text();
    console.log("Response:", socketUrl);
    socketUrlInput.value = socketUrl;
  } else {
    console.error("HTTP-Error: " + response.status);
  }
}
