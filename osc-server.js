const { Server, Client } = require('node-osc');
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const serve = require('koa-static');
const Router = require('@koa/router');
const path = require('path');

const app = new Koa();
const router = new Router();

const OSC_PORT = 3333;
const HTTP_PORT = 3000;

// Create OSC server and client
const oscServer = new Server(OSC_PORT, '0.0.0.0');
const oscClient = new Client('127.0.0.1', OSC_PORT);

// Enable CORS and body parsing
app.use(cors());
app.use(bodyParser());

// Serve static files from the current directory
app.use(serve(__dirname));

// Handle incoming OSC messages
oscServer.on('message', function (msg) {
  const [address, ...args] = msg;
  console.log(`Received OSC message:`, address, args);

  // You can add specific handlers for different OSC messages here
  switch (address) {
    case '/reset':
      // Handle reset
      break;
    case '/pause':
      // Handle pause
      break;
    case '/resume':
      // Handle resume
      break;
    // Add other cases as needed
  }
});

// API Routes
router.get('/status', async (ctx) => {
  ctx.body = { status: 'running' };
});

router.post('/send', async (ctx) => {
  const { address, message } = ctx.request.body;
  oscClient.send(address, message);
  ctx.body = { status: 'sent' };
});

// Use router middleware
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(HTTP_PORT);
console.log(`OSC Server running on port ${OSC_PORT}`);
console.log(`HTTP Server running on port ${HTTP_PORT}`);