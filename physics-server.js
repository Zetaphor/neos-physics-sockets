import { WebSocketServer } from 'ws';
import * as CANNON from 'cannon-es';
import http from 'http';

class PhysicsServer {
  constructor(port = 3000) {
    this.port = port;
    this.clients = new Set();
    this.world = this.setupWorld();
    this.bodies = new Map(); // Track bodies by ID
    this.lastTime = process.hrtime.bigint();
    this.physicsFrameRate = 60;

    // Create HTTP server with CORS headers
    this.server = http.createServer((req, res) => {
      // Add CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle OPTIONS request for CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Handle normal requests
      if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'running' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();

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

    // Configure contact materials
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

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      // Send initial world state
      this.sendWorldState(ws);
    });
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
      default:
        console.error('Invalid body type:', type);
        return;
    }

    if (body) {
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
    const shape = new CANNON.Cylinder(scale, scale, scale * 2, 16);
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

  broadcastBodyCreated(body, type) {
    this.broadcast({
      type: 'bodyCreated',
      bodyId: body.id,
      bodyType: type,
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

  start() {
    this.server.listen(this.port, () => {
      console.log(`Physics server running on port ${this.port}`);
    });
  }
}

// Create and start the server
const server = new PhysicsServer();
server.start();