var url = "ws://localhost:8080/chat-echo";
var output;

var websocket = null;
const socketUrl = "ws://localhost:3000/init";
console.log("Loaded");

clientSocket = null;

function connect() {
  output = document.getElementById("output");
  websocket = new WebSocket(socketUrl);

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

function sendMessage() {
  websocket.send("test messages");
}

function createBody() {
  clientSocket = new WebSocket("ws://localhost:3000/" + document.getElementById("createParams").value);

  clientSocket.onopen = function (e) {
    console.log("Connected client");
  };

  clientSocket.onmessage = function (e) {
    console.log("Client message");
  };

  clientSocket.onerror = function (e) {
    console.log("Client error");
  };

  clientSocket.onclose = function (e) {
    console.log("Client disconnected");
  };
}
