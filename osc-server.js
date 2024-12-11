const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const serve = require('koa-static');
const Router = require('@koa/router');
const osc = require('node-osc');
const WebSocket = require('ws');
const http = require('http');

const app = new Koa();
const router = new Router();

const HTTP_PORT = 3000;
const OSC_TARGET_HOST = '127.0.0.1';
const OSC_TARGET_PORT = 9000;
const OSC_LISTEN_PORT = 9001;

// Create HTTP server instance
const server = http.createServer(app.callback());

// Create WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ server });

// Create OSC client
const oscClient = new osc.Client(OSC_TARGET_HOST, OSC_TARGET_PORT);

// Create OSC server
const oscServer = new osc.Server(OSC_LISTEN_PORT, '0.0.0.0');

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');

  ws.on('message', (data) => {
    try {
      const { address, message } = JSON.parse(data.toString());
      const args = Array.isArray(message) ? message : [message];
      oscClient.send(address, ...args);
      console.log(`Forwarded via WebSocket: ${address}`, message);
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle incoming OSC messages
oscServer.on('message', (msg, rinfo) => {
  const address = msg[0];
  const args = msg.slice(1);
  console.log(`Received OSC message from ${rinfo.address}:${rinfo.port}`);
  console.log(`Address: ${address}`);
  console.log(`Arguments:`, args);
});

// Enable CORS and body parsing
app.use(cors());
app.use(bodyParser());
app.use(serve(__dirname));

// API Routes
router.get('/status', async (ctx) => {
  ctx.body = { status: 'running' };
});

// Use router middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Start server using the HTTP server instance, not the Koa app directly
server.listen(HTTP_PORT, () => {
  console.log(`HTTP Server running on port http://localhost:${HTTP_PORT}`);
  console.log(`WebSocket Server running on ws://localhost:${HTTP_PORT}`);
  console.log(`Forwarding OSC messages to ${OSC_TARGET_HOST}:${OSC_TARGET_PORT}`);
  console.log(`Listening for OSC messages on port ${OSC_LISTEN_PORT}`);
});