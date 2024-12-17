export class PhysicsClient extends EventTarget {
  constructor() {
    super();
    this.bodies = new Map();
    this.checkServer();
  }

  async checkServer() {
    try {
      const response = await fetch('http://localhost:3000/status');
      if (response.ok) {
        console.log('Physics server is running');
        this.connect();
      } else {
        console.error('Physics server returned error:', response.status);
        setTimeout(() => this.checkServer(), 1000);
      }
    } catch (error) {
      console.error('Could not connect to physics server:', error);
      setTimeout(() => this.checkServer(), 1000);
    }
  }

  connect() {
    this.ws = new WebSocket('ws://localhost:3000');

    this.ws.onopen = () => {
      console.log('Connected to physics server');
      this.dispatchEvent(new CustomEvent('connected'));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleServerMessage(data);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from physics server');
      this.dispatchEvent(new CustomEvent('disconnected'));
      // Attempt to reconnect after a delay
      setTimeout(() => this.checkServer(), 1000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.ws.close();
    };
  }

  handleServerMessage(data) {
    switch (data.type) {
      case 'initialState':
        // Create all existing bodies from initial state
        Object.entries(data.bodies).forEach(([id, state]) => {
          this.bodies.set(id, {
            type: state.type,
            position: state.position,
            quaternion: state.quaternion
          });

          this.dispatchEvent(new CustomEvent('bodyCreated', {
            detail: {
              bodyId: id,
              bodyType: state.type,
              position: state.position,
              quaternion: state.quaternion
            }
          }));
        });
        break;

      case 'worldState':
        // Only update positions of existing bodies
        this.updateBodies(data.bodies);
        break;

      case 'bodyCreated':
        if (!this.bodies.has(data.bodyId)) {
          this.bodies.set(data.bodyId, {
            type: data.bodyType,
            position: data.position,
            quaternion: data.quaternion
          });
          this.dispatchEvent(new CustomEvent('bodyCreated', { detail: data }));
        }
        break;

      case 'bodyRemoved':
        this.bodies.delete(data.bodyId);
        this.dispatchEvent(new CustomEvent('bodyRemoved', { detail: data }));
        break;

      case 'worldReset':
        this.bodies.clear();
        this.dispatchEvent(new CustomEvent('worldReset'));
        break;

      case 'pause':
        this.dispatchEvent(new CustomEvent('pause'));
        break;

      case 'resume':
        this.dispatchEvent(new CustomEvent('resume'));
        break;
    }
  }

  updateBodies(bodiesState) {
    Object.entries(bodiesState).forEach(([id, state]) => {
      this.dispatchEvent(new CustomEvent('bodyUpdated', {
        detail: {
          id: parseInt(id),
          position: state.position,
          quaternion: state.quaternion
        }
      }));
    });
  }

  createBody(type, mass, position, rotation, scale) {
    // Ensure type is one of the valid types
    if (!['box', 'sphere', 'cylinder'].includes(type)) {
      console.error('Invalid body type:', type);
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'createBody',
      bodyData: { type, mass, position, rotation, scale }
    }));
  }

  removeBody(bodyId) {
    this.ws.send(JSON.stringify({
      type: 'removeBody',
      bodyId
    }));
  }

  resetWorld() {
    this.ws.send(JSON.stringify({ type: 'resetWorld' }));
  }

  pause() {
    this.ws.send(JSON.stringify({ type: 'pause' }));
  }

  resume() {
    this.ws.send(JSON.stringify({ type: 'resume' }));
  }

  getBody(id) {
    return this.bodies.get(id);
  }
}