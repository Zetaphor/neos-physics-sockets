var resoniteMasterSocket = null;

window.connectResoniteSocket = function () {
  resoniteMasterSocket = new WebSocket("ws://localhost:3000/resoniteMaster");
  resoniteMasterSocket.onopen = resoniteSocketOpen;
  resoniteMasterSocket.onmessage = resoniteSocketMessage;
  resoniteMasterSocket.onerror = resoniteSocketError;
  resoniteMasterSocket.onclose = resoniteSocketClose;
  document.getElementById("resoniteMasterListen").remove();
  document.getElementById("resoniteOutputContainer").style.display = "block";
};

function resoniteSocketOpen(ev) {
  console.log("Resonite socket connected");
}

function resoniteSocketError(ev) {
  console.log("Resonite socket error");
}

function resoniteSocketClose(ev) {
  console.log("Resonite socket close");
}

function resoniteSocketMessage(ev) {
  console.log("Resonite socket message:", ev.data);
  document.getElementById("resoniteSocketOutput").innerText = ev.data;
}

window.createTestBody = function () {
  let testSocket = new WebSocket("ws://localhost:3000/createBodySocket/1/box");
  testSocket.onopen = function () {
    console.log("Test socket open");
  };
  testSocket.onmessage = function (ev) {
    console.log("Test socket message:", ev.data);
  };
  testSocket.onerror = function () {
    console.log("Test socket error");
  };
  testSocket.onclose = function () {
    console.log("Test socket close");
  };
};
