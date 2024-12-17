import { WebSocketServer } from 'ws';
import * as CANNON from 'cannon-es';
import http from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import serve from 'koa-static';
import Router from '@koa/router';
import { Server as OscServer, Client as OscClient } from 'node-osc';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  HTTP_PORT: 3000,
  OSC: {
    TARGET_HOST: '127.0.0.1',
    TARGET_PORT: 9000,
    LISTEN_PORT: 9001
  },
  PHYSICS: {
    POSITION_SCALE: 0.1,
    FRAME_RATE: 60,
    GRAVITY: -50,
    SLEEP: {
      TIME_LIMIT: 0.5,
      SPEED_LIMIT: 0.1
    }
  }
};

/**
 * Expected message formats:
 *
 * OSC Message:
 * {
 *   address: string,
 *   message: any[] | any
 * }
 *
 * Physics Messages:
 * {
 *   type: 'createBody' | 'removeBody' | 'resetWorld' | 'pause' | 'resume',
 *   bodyData?: {
 *     type: 'box' | 'sphere' | 'cylinder',
 *     mass: number,
 *     position: { x: number, y: number, z: number },
 *     rotation: { x: number, y: number, z: number },
 *     scale: { x: number, y: number, z: number }
 *   },
 *   bodyId?: string
 * }
 */

class UnifiedServer {
  constructor() {
    // Initialize Koa app
    this.setupKoaApp();

    // Initialize OSC
    this.setupOSC();

    // Initialize Physics
    this.setupPhysics();

    // Start the server
    this.start();
  }

  setupKoaApp() {
    this.app = new Koa();
    this.router = new Router();

    // Basic routes
    this.router.get('/status', async (ctx) => {
      ctx.body = { status: 'running' };
    });

    // Middleware
    this.app.use(cors());
    this.app.use(bodyParser());

    // Serve static files from the interface directory
    this.app.use(serve(path.join(__dirname, 'interface')));

    // Redirect root to index.html
    this.router.get('/', async (ctx) => {
      ctx.redirect('/index.html');
    });

    this.app.use(this.router.routes());
    this.app.use(this.router.allowedMethods());

    // Create HTTP server
    this.server = http.createServer(this.app.callback());

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
  }

  setupOSC() {
    // Create OSC client
    this.oscClient = new OscClient(CONFIG.OSC.TARGET_HOST, CONFIG.OSC.TARGET_PORT);

    // Create OSC server
    this.oscServer = new OscServer(CONFIG.OSC.LISTEN_PORT, '0.0.0.0');

    // Handle incoming OSC messages
    this.oscServer.on('message', (msg, rinfo) => {
      const address = msg[0];
      const args = msg.slice(1);
      console.log(`Received OSC message from ${rinfo.address}:${rinfo.port}`);
      console.log(`Address: ${address}`);
      console.log(`Arguments:`, args);
    });
  }

  setupPhysics() {
    this.physicsServer = new PhysicsServer(this.wss, this.oscClient);

    this.wss.on('connection', (ws) => {
      console.log('Websocket client connected');
      this.physicsServer.addClient(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);

          // Validate message structure
          if (typeof message !== 'object' || message === null) {
            throw new Error('Invalid message format');
          }

          // Handle OSC messages
          if (message.address) {
            if (typeof message.address !== 'string') {
              throw new Error('Invalid OSC address format');
            }
            const args = Array.isArray(message.message) ? message.message : [message.message];
            this.oscClient.send(message.address, ...args);
          }
          // Handle physics messages
          else if (message.type) {
            this.physicsServer.handleClientMessage(ws, message);
          }
          else {
            throw new Error('Message missing required fields');
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.physicsServer.removeClient(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  start() {
    this.server.listen(CONFIG.HTTP_PORT, () => {
      console.log(`Unified server running on port ${CONFIG.HTTP_PORT}`);
      console.log(`WebSocket server running on ws://localhost:${CONFIG.HTTP_PORT}`);
      console.log(`OSC forwarding to ${CONFIG.OSC.TARGET_HOST}:${CONFIG.OSC.TARGET_PORT}`);
      console.log(`Listening for OSC messages on port ${CONFIG.OSC.LISTEN_PORT}`);
    });
  }

  shutdown() {
    // Close WebSocket connections
    this.wss.clients.forEach(client => {
      client.close();
    });

    // Close OSC connections
    this.oscServer.close();
    this.oscClient.close();

    // Close HTTP server
    this.server.close();

    // Stop physics loop
    this.physicsServer.shutdown();
  }
}

class PhysicsServer {
  constructor(wss, oscClient) {
    this.oscClient = oscClient;
    this.clients = new Set();
    this.world = this.setupWorld();
    this.bodies = new Map();
    this.lastTime = process.hrtime.bigint();
    this.physicsFrameRate = CONFIG.PHYSICS.FRAME_RATE;
    this.paused = false;

    // Start physics loop
    this.startPhysicsLoop();
  }

  setupWorld() {
    const world = new CANNON.World();
    world.gravity.set(0, CONFIG.PHYSICS.GRAVITY, 0);

    // Enable sleeping
    world.allowSleep = true;
    world.sleepTimeLimit = CONFIG.PHYSICS.SLEEP.TIME_LIMIT;
    world.sleepSpeedLimit = CONFIG.PHYSICS.SLEEP.SPEED_LIMIT;

    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(
      defaultMaterial,
      defaultMaterial,
      {
        friction: 0.7,
        restitution: 0.3,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      }
    );

    world.addContactMaterial(defaultContactMaterial);
    world.defaultContactMaterial = defaultContactMaterial;
    world.solver.iterations = 5;

    // Add ground plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0,
      material: defaultMaterial
    });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    return world;
  }

  addClient(ws) {
    this.clients.add(ws);
    // Send initial state with special type
    ws.send(JSON.stringify({
      type: 'initialState',
      bodies: Object.fromEntries(
        Array.from(this.bodies.entries()).map(([id, body]) => [
          id,
          {
            type: body.userData?.type || 'box',
            position: [body.position.x, body.position.y, body.position.z],
            quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w]
          }
        ])
      )
    }));
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  handleClientMessage(ws, data) {
    if (!data.type) {
      console.error('Invalid message format: missing type');
      return;
    }

    switch (data.type) {
      case 'createBody':
        if (!data.bodyData) {
          console.error('Invalid createBody message: missing bodyData');
          return;
        }
        this.createBody(data.bodyData);
        break;
      case 'removeBody':
        this.removeBody(data.bodyId);
        break;
      case 'resetWorld':
        this.resetWorld();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      default:
        console.warn(`Unknown message type: ${data.type}`);
    }
  }

  createBody({ type, mass, position, rotation, scale }) {
    if (!type || !position || mass == null) {
      console.error('Invalid body creation parameters');
      return;
    }

    let body;

    switch (type) {
      case 'box':
        body = this.createBox(mass, position, rotation, scale);
        break;
      case 'sphere':
        body = this.createSphere(mass, position, rotation, scale);
        break;
      case 'cylinder':
        body = this.createCylinder(mass, position, rotation, scale);
        break;
    }

    if (body) {
      body.userData = { type };
      this.bodies.set(body.id, body);
      this.broadcastBodyCreated(body, type);
    }
  }

  createBox(mass, position, rotation, scale) {
    const shape = new CANNON.Box(new CANNON.Vec3(scale.x, scale.y, scale.z));
    const body = new CANNON.Body({
      mass,
      material: this.world.defaultMaterial,
      angularDamping: 0.5,
      linearDamping: 0.3,
      allowSleep: true,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 0.5
    });

    body.addShape(shape);
    body.position.set(position.x, position.y, position.z);
    this.world.addBody(body);
    return body;
  }

  createSphere(mass, position, rotation, radius) {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass,
      material: this.world.defaultMaterial,
      angularDamping: 0.5,
      linearDamping: 0.3,
      allowSleep: true,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 0.5
    });

    body.addShape(shape);
    body.position.set(position.x, position.y, position.z);
    this.world.addBody(body);
    return body;
  }

  createCylinder(mass, position, rotation, scale) {
    const shape = new CANNON.Cylinder(scale, scale, scale * 2.2, 10);
    const body = new CANNON.Body({
      mass,
      material: this.world.defaultMaterial,
      angularDamping: 0.5,
      linearDamping: 0.3,
      allowSleep: true,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 0.5
    });

    body.addShape(shape);
    body.position.set(position.x, position.y, position.z);
    this.world.addBody(body);
    return body;
  }

  removeBody(bodyId) {
    const body = this.bodies.get(bodyId);
    if (body) {
      this.world.removeBody(body);
      this.bodies.delete(bodyId);
      this.broadcastBodyRemoved(bodyId);
    }
  }

  resetWorld() {
    // Remove all bodies except ground
    [...this.bodies.values()].forEach(body => {
      this.world.removeBody(body);
    });
    this.bodies.clear();
    this.broadcastWorldReset();
  }

  pause() {
    this.paused = true;
    this.broadcastPause();
  }

  resume() {
    this.paused = false;
    this.broadcastResume();
  }

  startPhysicsLoop() {
    const stepPhysics = () => {
      if (!this.paused) {
        const currentTime = process.hrtime.bigint();
        const deltaTime = Number(currentTime - this.lastTime) / 1e9; // Convert to seconds
        this.lastTime = currentTime;

        this.world.step(1 / this.physicsFrameRate, deltaTime, 3);
        this.broadcastWorldState();
      }

      setTimeout(stepPhysics, 1000 / this.physicsFrameRate);
    };

    stepPhysics();
  }

  broadcastWorldState() {
    const worldState = this.getWorldState();

    // Send WebSocket broadcast as before
    this.broadcast({
      type: 'worldState',
      bodies: worldState
    });

    // Send each body's state via OSC
    Object.entries(worldState).forEach(([bodyId, state]) => {

      this.oscClient.send(`/body/${bodyId}/transform`,
        parseFloat(state.position[0]) * CONFIG.PHYSICS.POSITION_SCALE,
        parseFloat(state.position[1]) * CONFIG.PHYSICS.POSITION_SCALE,
        parseFloat(state.position[2]) * CONFIG.PHYSICS.POSITION_SCALE,
        parseFloat(state.quaternion[0]),
        parseFloat(state.quaternion[1]),
        parseFloat(state.quaternion[2]),
        parseFloat(state.quaternion[3])
      );
    });
  }

  sendWorldState(ws) {
    const worldState = this.getWorldState();
    ws.send(JSON.stringify({
      type: 'worldState',
      bodies: worldState
    }));
  }

  getWorldState() {
    const state = {};
    this.bodies.forEach((body, id) => {
      state[id] = {
        position: [body.position.x, body.position.y, body.position.z],
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
        type: body.userData?.type || 'box'
      };
    });
    return state;
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastBodyCreated(body, bodyType) {
    this.broadcast({
      type: 'bodyCreated',
      bodyId: body.id,
      bodyType: bodyType,
      position: [body.position.x, body.position.y, body.position.z],
      quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w]
    });

    this.oscClient.send('/body/create',
      parseInt(body.id),
      bodyType
    );
  }

  broadcastBodyRemoved(bodyId) {
    this.broadcast({
      type: 'bodyRemoved',
      bodyId
    });

    this.oscClient.send('/body/remove', parseInt(bodyId));
  }

  broadcastWorldReset() {
    this.broadcast({ type: 'worldReset' });
    this.oscClient.send('/world/reset');
  }

  broadcastPause() {
    this.broadcast({ type: 'pause' });
    this.oscClient.send('/world/pause');
  }

  broadcastResume() {
    this.broadcast({ type: 'resume' });
    this.oscClient.send('/world/resume');
  }

  shutdown() {
    this.paused = true;
    this.clients.clear();
    this.bodies.clear();
    // Clear any pending timeouts/intervals
  }
}

// Create and start the unified server
const server = new UnifiedServer();