var neosMasterSocket = null;

window.connectNeosSocket = function () {
  neosMasterSocket = new WebSocket("ws://localhost:3000/neosMaster");
  neosMasterSocket.onopen = neosSocketOpen;
  neosMasterSocket.onmessage = neosSocketMessage;
  neosMasterSocket.onerror = neosSocketError;
  neosMasterSocket.onclose = neosSocketClose;
  document.getElementById("neosMasterListen").remove();
  document.getElementById("neosOutputContainer").style.display = "block";
};

function neosSocketOpen(ev) {
  console.log("Neos socket connected");
}

function neosSocketError(ev) {
  console.log("Neos socket error");
}

function neosSocketClose(ev) {
  console.log("Neos socket close");
}

function neosSocketMessage(ev) {
  console.log("Neos socket message:", ev.data);
  document.getElementById("neosSocketOutput").innerText = ev.data;
}
