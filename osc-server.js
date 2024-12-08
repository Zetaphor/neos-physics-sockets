const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const serve = require('koa-static');
const Router = require('@koa/router');
const osc = require('node-osc');

const app = new Koa();
const router = new Router();

const HTTP_PORT = 3000;
const OSC_TARGET_HOST = '127.0.0.1'; // Change this to your target OSC server IP
const OSC_TARGET_PORT = 9000; // Change this to your target OSC server port

const bodyTypes = {
  "1": "sphere",
  "2": "cylinder",
  "3": "box"
}

// Create OSC client
const oscClient = new osc.Client(OSC_TARGET_HOST, OSC_TARGET_PORT);

// Enable CORS and body parsing
app.use(cors());
app.use(bodyParser());

// Serve static files from the current directory
app.use(serve(__dirname));

// API Routes
router.get('/status', async (ctx) => {
  ctx.body = { status: 'running' };
});

// New route to handle OSC message forwarding
router.post('/send', async (ctx) => {
  const { address, message } = ctx.request.body;

  try {
    // If message is an array, spread it as multiple arguments
    const args = Array.isArray(message) ? message : [message];
    oscClient.send(address, ...args);
    ctx.body = { status: 'success' };
    console.log(`Forwarded: ${address} ${message}`);
  } catch (error) {
    console.error('Error sending OSC message:', error);
    ctx.status = 500;
    ctx.body = { status: 'error', message: error.message };
  }
});

// Use router middleware
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(HTTP_PORT);
console.log(`HTTP Server running on port ${HTTP_PORT}`);
console.log(`Forwarding OSC messages to ${OSC_TARGET_HOST}:${OSC_TARGET_PORT}`);