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

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.config.render.width, this.config.render.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 10, 10);
    dirLight.castShadow = true;

    // Shadow camera config
    Object.assign(dirLight.shadow.camera, {
      near: 0.1,
      far: 40,
      right: 15,
      left: -15,
      top: 15,
      bottom: -15
    });

    dirLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(dirLight);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
  }

  setupStats() {
    this.stats = new Stats();
    const container = document.getElementById("canvasContainer");
    container.appendChild(this.stats.dom);
  }

  setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshPhongMaterial({
      color: 0x808080,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
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

    // Default material with random color
    material = new THREE.MeshPhongMaterial({
      color: Math.random() * 0xffffff
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;

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
    const createFolder = this.gui.addFolder('Create');
    createFolder.open();

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

    createFolder.add({
      'Reset World': () => this.physicsClient.resetWorld()
    }, 'Reset World');

    createFolder.add({
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
    this.stats.update();
    this.renderer.render(this.scene, this.camera);
  };
}