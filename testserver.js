const Koa = require("koa");
const http = require("http");
const WebSocket = require("ws");
const url = require("url");

const app = new Koa();

const connectedClients = {};

app.use((ctx) => {
  ctx.set("Access-Control-Allow-Origin", "*");
  console.log("Url:", ctx.url);
  if (ctx.url.startsWith("/create/")) {
    ctx.body = `ws://localhost:3000/${new Date().getTime()}`;
  } else if (ctx.url === "/clients") {
    ctx.body = "Messaging all clients";
    for (const clientId in connectedClients) {
      if (Object.hasOwnProperty.call(connectedClients, clientId)) {
        const client = connectedClients[clientId];
        client.send("I see you " + clientId);
      }
    }
  }
});

const ws = new WebSocket.Server({ noServer: true, clientTracking: false });

const server = http.createServer(app.callback());

server.on("upgrade", function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;
  ws.handleUpgrade(request, socket, head, function done(ws) {
    ws.send("Connected");
    connectedClients[pathname.split("/")[1]] = ws;
  });
});

console.log("Server listening");
server.listen(3000);
