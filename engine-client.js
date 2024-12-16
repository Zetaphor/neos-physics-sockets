import * as THREE from "/libs/three.module.js";
import Stats from "/libs/stats.module.js";
import * as dat from "/libs/dat.gui.module.js";
import { OrbitControls } from "/libs/OrbitControls.js";
import { PhysicsClient } from "./client.js";
import { ResonitePhysicsOSC } from "/osc-client.js";

export class EngineClient {
  constructor() {
    this.renderWidth = 1600;
    this.renderHeight = 800;
    this.bodies = new Map(); // Map of body ID to THREE.Mesh
    this.osc = new ResonitePhysicsOSC();

    // Initialize Three.js scene
    this.initThree();

    // Initialize physics client
    this.physicsClient = new PhysicsClient();
    this.setupPhysicsEvents();

    // Initialize GUI
    this.initGui();

    // Start render loop
    this.animate();
  }

  initThree() {
    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(24, this.renderWidth / this.renderHeight, 5, 2000);
    this.camera.position.set(0, 20, 90);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.renderWidth, this.renderHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById("canvasContainer").appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 10, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Stats
    this.stats = new Stats();
    document.getElementById("canvasContainer").appendChild(this.stats.dom);

    // Ground plane
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
      console.log('bodyCreated', event.detail);
      const { bodyId, bodyType, position, quaternion } = event.detail;

      // Forward to OSC with correct body type
      this.osc.addedSimulationBody(bodyId, bodyType, position, quaternion);

      // Create visual body after the data is stored
      this.createVisualBody(bodyId, position, quaternion, bodyType);
    });

    this.physicsClient.addEventListener('bodyRemoved', (event) => {
      const { bodyId } = event.detail;
      this.removeVisualBody(bodyId);

      // Forward to OSC
      this.osc.sendRemoveBody(bodyId);
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

    console.log('Creating visual body of type:', bodyType); // Add debug logging

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

    createFolder.add({
      'Create Box': () => {
        this.physicsClient.createBody(
          'box',
          5,
          { x: Math.random() * 10, y: 10 + Math.random() * 10, z: Math.random() * 10 },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 1, y: 1, z: 1 }
        );
      }
    }, 'Create Box');

    createFolder.add({
      'Create Sphere': () => {
        this.physicsClient.createBody(
          'sphere',
          5,
          { x: Math.random() * 10, y: 10 + Math.random() * 10, z: Math.random() * 10 },
          { x: 0, y: 0, z: 0, w: 1 },
          1
        );
      }
    }, 'Create Sphere');

    createFolder.add({
      'Create Cylinder': () => {
        this.physicsClient.createBody(
          'cylinder',
          5,
          { x: Math.random() * 10, y: 10 + Math.random() * 10, z: Math.random() * 10 },
          { x: 0, y: 0, z: 0, w: 1 },
          1
        );
      }
    }, 'Create Cylinder');

    createFolder.add({
      'Reset World': () => {
        this.physicsClient.resetWorld();
      }
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

  animate = () => {
    requestAnimationFrame(this.animate);

    this.controls.update();
    this.stats.update();
    this.renderer.render(this.scene, this.camera);

    // Forward physics state to OSC
    const bodiesData = {};
    for (const [id, mesh] of this.bodies) {
      bodiesData[id] = {
        position: [mesh.position.x, mesh.position.y, mesh.position.z],
        rotation: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w]
      };
    }
    this.osc.sendPhysicsUpdate(bodiesData);
  };
}