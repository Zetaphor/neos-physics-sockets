const Koa = require("koa");
const http = require("http");
const WebSocket = require("ws");
const url = require("url");

const app = new Koa();
let localMasterWebsocket = null;
let neosMasterWebsocket = null;
let connectionsReady = false;

app.use((ctx) => {
  ctx.set("Access-Control-Allow-Origin", "*");
  ctx.body = "none";
  // if (ctx.url.startsWith("/master")) ctx.body = `success`;
});

const wss = new WebSocket.Server({ noServer: true });

const server = http.createServer(app.callback());

server.on("upgrade", function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  wss.on("connection", function connction(ws) {
    console.log("Socket connection:", ws.clientId);
  });

  wss.handleUpgrade(request, socket, head, function done(ws) {
    console.log(pathname);
    if (pathname === "/localMaster") {
      ws.clientId = "localMaster";
      console.log("Initialized local master socket");
      ws.send("Initialized local master socket");
      localMasterWebsocket = ws;
      if (localMasterWebsocket !== null && neosMasterWebsocket !== null) connectionsReady = true;

      ws.on("message", function (msg) {
        if (!connectionsReady) return;
        const message = msg.toString();
        // console.log("Local master message:", message);
        if (message.startsWith("addedBody|")) {
          neosMasterWebsocket.send(message);
          console.log("Added body:", message);
        } else if (message.startsWith("bodiesUpdate|")) {
          const bodiesData = JSON.parse(message.split("bodiesUpdate|")[1]);
          if (Object.keys(bodiesData).length) {
            for (const client of wss.clients) {
              if (client.clientId === "localMaster" || client.clientId === "neosMaster") continue;
              // Need to handle removal of object and closing of sockets here?
              if (typeof bodiesData[client.clientId] !== "undefined") {
                let changed = false;
                if (bodiesData[client.clientId].position !== client.customData.prevPosition) {
                  client.customData.prevPosition = bodiesData[client.clientId].position;
                  changed = true;
                }
                if (bodiesData[client.clientId].rotation !== client.customData.prevRotation) {
                  client.customData.prevRotation = bodiesData[client.clientId].rotation;
                  changed = true;
                }
                if (changed) {
                  client.send(`update|[${client.customData.prevPosition}]^[${client.customData.prevRotation}]`);
                }
              }
            }
          }
        }
      });
    } else if (pathname === "/neosMaster") {
      ws.clientId = "neosMaster";
      console.log("Initialized Neos master socket");
      ws.send("Initialized Neos master socket");
      neosMasterWebsocket = ws;
      if (localMasterWebsocket !== null && neosMasterWebsocket !== null) connectionsReady = true;

      ws.on("message", function (msg) {
        if (!connectionsReady) return;
        const message = msg.toString();
        console.log("Neos master message:", message);
      });
    } else if (pathname.startsWith("/createBodySocket/")) {
      if (!connectionsReady) return;
      // createBodySocket/id/type
      pathParts = pathname.split("/");
      ws.clientId = pathParts[2];
      ws.customData = {
        type: pathParts[3],
        prevPosition: "",
        prevRotation: "",
      };
      console.log("Sending body socket data");
      localMasterWebsocket.send(`Created body socket #${pathParts[2]} of type ${pathParts[3]}`);
      console.log(`Created body #${pathParts[2]} of type ${pathParts[3]}`);
    }
  });
});

console.log("Server listening");
server.listen(3000);
