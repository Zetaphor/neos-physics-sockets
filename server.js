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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const HTTP_PORT = 3000;
const OSC_TARGET_HOST = '127.0.0.1';
const OSC_TARGET_PORT = 9000;
const OSC_LISTEN_PORT = 9001;

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
    this.app.use(serve(__dirname));
    this.app.use(this.router.routes());
    this.app.use(this.router.allowedMethods());

    // Create HTTP server
    this.server = http.createServer(this.app.callback());

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
  }

  setupOSC() {
    // Create OSC client
    this.oscClient = new OscClient(OSC_TARGET_HOST, OSC_TARGET_PORT);

    // Create OSC server
    this.oscServer = new OscServer(OSC_LISTEN_PORT, '0.0.0.0');

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
    this.physicsServer = new PhysicsServer(this.wss);

    // Handle WebSocket connections for both physics and OSC
    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.physicsServer.addClient(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);

          // Handle OSC messages
          if (message.address) {
            const args = Array.isArray(message.message) ? message.message : [message.message];
            this.oscClient.send(message.address, ...args);
            console.log(`Forwarded via WebSocket: ${message.address}`, message.message);
          }
          // Handle physics messages
          else {
            this.physicsServer.handleClientMessage(ws, message);
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
    this.server.listen(HTTP_PORT, () => {
      console.log(`Unified server running on port ${HTTP_PORT}`);
      console.log(`WebSocket server running on ws://localhost:${HTTP_PORT}`);
      console.log(`OSC forwarding to ${OSC_TARGET_HOST}:${OSC_TARGET_PORT}`);
      console.log(`Listening for OSC messages on port ${OSC_LISTEN_PORT}`);
    });
  }
}

class PhysicsServer {
  constructor(wss) {
    this.clients = new Set();
    this.world = this.setupWorld();
    this.bodies = new Map();
    this.lastTime = process.hrtime.bigint();
    this.physicsFrameRate = 60;
    this.paused = false;

    // Start physics loop
    this.startPhysicsLoop();
  }

  setupWorld() {
    const world = new CANNON.World();
    world.gravity.set(0, -50, 0);

    // Enable sleeping
    world.allowSleep = true;
    world.sleepTimeLimit = 0.5;
    world.sleepSpeedLimit = 0.1;

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
    this.sendWorldState(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'createBody':
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
    }
  }

  createBody({ type, mass, position, rotation, scale }) {
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
      this.bodies.set(body.id, body);
      this.broadcastBodyCreated(body);
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
    this.broadcast({
      type: 'worldState',
      bodies: worldState
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
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w]
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

  broadcastBodyCreated(body) {
    this.broadcast({
      type: 'bodyCreated',
      bodyId: body.id,
      position: [body.position.x, body.position.y, body.position.z],
      quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w]
    });
  }

  broadcastBodyRemoved(bodyId) {
    this.broadcast({
      type: 'bodyRemoved',
      bodyId
    });
  }

  broadcastWorldReset() {
    this.broadcast({ type: 'worldReset' });
  }

  broadcastPause() {
    this.broadcast({ type: 'pause' });
  }

  broadcastResume() {
    this.broadcast({ type: 'resume' });
  }
}

// Create and start the unified server
const server = new UnifiedServer();