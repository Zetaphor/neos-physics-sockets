const Koa = require("koa");
const http = require("http");
const WebSocket = require("ws");
const url = require("url");

const app = new Koa();
let masterWebsocket = null;

app.use((ctx) => {
  ctx.set("Access-Control-Allow-Origin", "*");
  if (ctx.url.startsWith("/init")) {
    ctx.body = `success`;
  } else {
    ctx.body = "error";
  }
});

const wss = new WebSocket.Server({ noServer: true, clientTracking: false });

const server = http.createServer(app.callback());

server.on("upgrade", function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  wss.on("connection", function connction(ws) {
    console.log("Socket connection:", ws.clientId);
  });

  wss.handleUpgrade(request, socket, head, function done(ws) {
    if (pathname === "/init") {
      ws.clientId = "master";
      ws.customData = {};
      console.log("Initialized master socket");
      ws.send("Initialized master socket");
      masterWebsocket = ws;
    } else if (pathname.startsWith("/createBody/")) {
      // createBody/id/bodyType
      pathParts = pathname.split("/");
      ws.clientId = pathParts[2];
      ws.customData = {
        type: pathParts[3],
        lastData: "",
      };
      masterWebsocket.send(`Created body #${pathParts[2]} of type ${pathParts[3]}`);
      console.log(`Created body #${pathParts[2]} of type ${pathParts[3]}`);

      // ws.on("message", function (message) {
      //   if (ws.clientId === "master") {
      //     console.log("Master client update", message);
      //   }
      // });
    }
  });
});

console.log("Server listening");
server.listen(3000);
