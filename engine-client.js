import * as THREE from "/libs/three.module.js";
import Stats from "/libs/stats.module.js";
import * as dat from "/libs/dat.gui.module.js";
import { OrbitControls } from "/libs/OrbitControls.js";
import { PhysicsClient } from "./client.js";

export class EngineClient {
  constructor() {
    this.config = {
      render: {
        width: 1600,
        height: 800
      }
    };

    this.bodies = new Map();

    this.initThree()
      .then(() => {
        this.physicsClient = new PhysicsClient();
        this.setupPhysicsEvents();
        this.initGui();
        this.animate();
      })
      .catch(error => {
        console.error('Failed to initialize engine:', error);
      });
  }

  async initThree() {
    // Scene setup
    this.scene = new THREE.Scene();

    // Camera setup with config
    this.camera = new THREE.PerspectiveCamera(
      24,
      this.config.render.width / this.config.render.height,
      5,
      2000
    );
    this.camera.position.set(0, 20, 90);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup - removed shadow mapping
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.config.render.width, this.config.render.height);

    const container = document.getElementById("canvasContainer");
    if (!container) {
      throw new Error("Canvas container not found");
    }
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.setupControls();
    this.setupStats();
    this.setupGround();
  }

  setupLights() {
    // Single bright ambient light for uniform illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
  }

  setupStats() {
    this.stats = new Stats();

    // Add custom panel for body count with 200ms time span
    this.bodiesStatsPanel = this.stats.addPanel(
      new Stats.Panel("Bodies", "#fffd00", "#838200")
    );

    // Style the stats container - added transform scale
    this.stats.dom.style.cssText = 'position:absolute;top:0;left:0;transform:scale(0.5);transform-origin:top left;';

    // Show all panels (FPS = 0, MS = 1, MB = 2, Bodies = 3)
    const statsPanels = this.stats.dom.children;

    // Style each panel to display side by side
    Array.from(statsPanels).forEach((panel, index) => {
      if (index <= 1 || panel === this.bodiesStatsPanel.dom) {  // Show FPS, MS, and Bodies panels
        panel.style.cssText = 'position:relative !important;float:left;margin-left:0;margin-right:0;';
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });

    // Prevent the click handler that cycles through panels
    this.stats.dom.addEventListener('click', (event) => {
      event.stopPropagation();
    }, true);

    document.getElementById("canvasContainer").appendChild(this.stats.dom);
  }

  setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x808080,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);
  }

  setupPhysicsEvents() {
    this.physicsClient.addEventListener('bodyCreated', (event) => {
      const { bodyId, bodyType, position, quaternion } = event.detail;

      this.createVisualBody(bodyId, position, quaternion, bodyType);
    });

    this.physicsClient.addEventListener('bodyRemoved', (event) => {
      const { bodyId } = event.detail;
      this.removeVisualBody(bodyId);
    });

    this.physicsClient.addEventListener('bodyUpdated', (event) => {
      const { id, position, quaternion } = event.detail;
      this.updateVisualBody(id, position, quaternion);
    });

    this.physicsClient.addEventListener('worldReset', () => {
      this.resetVisuals();
      window.dispatchEvent(new CustomEvent("worldReset"));
    });
  }

  createVisualBody(id, position, quaternion, bodyType) {
    let geometry;
    let material;

    const color = Math.random() * 0xffffff;

    // Always use MeshBasicMaterial for simple rendering
    material = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: this.wireframeEnabled
    });

    // Create appropriate geometry based on body type
    switch (bodyType) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(1, 32, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(1, 1, 2, 32);
        break;
      case 'box':
      default:
        geometry = new THREE.BoxGeometry(2, 2, 2);
        break;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.quaternion.fromArray(quaternion);

    this.scene.add(mesh);
    this.bodies.set(id, mesh);
  }

  removeVisualBody(id) {
    const mesh = this.bodies.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.bodies.delete(id);
    }
  }

  updateVisualBody(id, position, quaternion) {
    const mesh = this.bodies.get(id);
    if (mesh) {
      mesh.position.fromArray(position);
      mesh.quaternion.fromArray(quaternion);
    }
  }

  resetVisuals() {
    // Remove all visual bodies
    for (const [id, mesh] of this.bodies) {
      this.scene.remove(mesh);
    }
    this.bodies.clear();
  }

  initGui() {
    this.gui = new dat.GUI();

    // Create folder
    const createFolder = this.gui.addFolder('Create');
    createFolder.open();

    // Display folder
    const displayFolder = this.gui.addFolder('Display');
    displayFolder.open();

    // World Controls folder
    const worldFolder = this.gui.addFolder('World Controls');
    worldFolder.open();

    // Add wireframe toggle configuration
    const displaySettings = {
      'Wireframe': false,
      'Pause Render': false
    };

    // Simplified wireframe toggle
    displayFolder.add(displaySettings, 'Wireframe').onChange((wireframeEnabled) => {
      this.wireframeEnabled = wireframeEnabled;
      // Update all existing bodies
      for (const mesh of this.bodies.values()) {
        mesh.material.wireframe = wireframeEnabled;
      }
    });

    // Add render pause toggle
    displayFolder.add(displaySettings, 'Pause Render').onChange((pauseRender) => {
      this.renderPaused = pauseRender;
    });

    const createActions = {
      box: {
        mass: 5,
        scale: { x: 1, y: 1, z: 1 }
      },
      sphere: {
        mass: 5,
        scale: 1
      },
      cylinder: {
        mass: 5,
        scale: 1
      }
    };

    this.wireframeEnabled = false;
    this.renderPaused = false;

    // Create buttons
    Object.entries(createActions).forEach(([type, config]) => {
      createFolder.add({
        [`Create ${type}`]: () => {
          this.physicsClient.createBody(
            type,
            config.mass,
            this.getRandomPosition(),
            { x: 0, y: 0, z: 0, w: 1 },
            config.scale
          );
        }
      }, `Create ${type}`);
    });

    // World control buttons
    worldFolder.add({
      'Reset World': () => this.physicsClient.resetWorld()
    }, 'Reset World');

    worldFolder.add({
      'Remove Last': () => {
        const lastId = Array.from(this.bodies.keys()).pop();
        if (lastId !== undefined) {
          this.physicsClient.removeBody(lastId);
        }
      }
    }, 'Remove Last');
  }

  getRandomPosition() {
    return {
      x: Math.random() * 10,
      y: 10 + Math.random() * 10,
      z: Math.random() * 10
    };
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    this.controls.update();

    // Update stats
    this.stats.begin();
    this.bodiesStatsPanel.update(this.bodies.size, 100); // Reduced max value for better scale
    this.stats.end();

    // Only render if not paused
    if (!this.renderPaused) {
      this.renderer.render(this.scene, this.camera);
    }
  };
}