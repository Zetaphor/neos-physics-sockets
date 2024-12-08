import * as CANNON from "/libs/cannon-es.js";
import * as THREE from "/libs/three.module.js";
import Stats from "/libs/stats.module.js";
import * as dat from "/libs/dat.gui.module.js";
import { OrbitControls } from "/libs/OrbitControls.js";
import { SmoothieChart, TimeSeries } from "/libs/smoothie.js";
import { bodyToMesh } from "/libs/three-conversion-utils.js";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  MeshPhongMaterial,
  ShadowMaterial,
  PCFSoftShadowMap,
} from '/libs/three.module.js';

/**
 * Engine utility class. If you want to learn how to connect cannon.js with three.js, please look at the examples/threejs_* instead.
 */
class Engine extends CANNON.EventTarget {
  renderWidth = 1600;
  renderHeight = 800;
  physicsFrameRate = 60;
  renderFrameRate = 60;
  lastRenderTime = 0;
  lastPhysicsTime = 0;
  sceneFolder;
  scenes = {};
  listeners = {};
  currentScene = 0;

  // array used to keep in sync the visuals with the bodies
  // they will have always the same length
  bodies = [];
  visuals = [];

  gui;
  smoothie;
  smoothieCanvas;
  bodiesStatsPanel;

  renderModes = ["solid", "wireframe"];

  dummy = new THREE.Object3D();

  constructor(options) {
    super(options);

    // Global settings
    this.settings = {
      stepFrequency: 60,
      quatNormalizeSkip: 2,
      quatNormalizeFast: true,
      gx: 0,
      gy: 0,
      gz: 0,
      iterations: 3,
      tolerance: 0.0001,
      k: 1e6,
      d: 3,
      scene: 0,
      paused: false,
      renderPaused: false,
      rendermode: "solid",
      constraints: false,
      contacts: false, // Contact points
      cm2contact: false, // center of mass to contact points
      normals: false, // contact normals
      axes: false, // "local" frame axes
      aabbs: false,
      profiling: false,
      maxSubSteps: 20,
      physicsFrameRate: 60,
      renderFrameRate: 60,
      ...options,
    };

    if (this.settings.stepFrequency % 60 !== 0) {
      throw new Error("stepFrequency must be a multiple of 60.");
    }

    // Init cannon.js
    this.world = new CANNON.World();

    // Init three.js
    this.initThree();

    // Init the geometry caches
    this.initGeometryCaches();

    // Init stats.js
    this.initStats();

    // Init smoothie.js
    this.initSmoothie();

    // Init dat.gui
    this.initGui();

    // Start the loop!
    this.animate();

    // Attach listeners
    // window.addEventListener("resize", this.resize);
  }

  initGui = () => {
    // DAT GUI
    this.gui = new dat.GUI();
    this.gui.domElement.parentNode.style.zIndex = 3;

    // Render folder
    const renderFolder = this.gui.addFolder("Rendering");
    renderFolder.add(this.settings, "renderPaused");
    renderFolder.add(this.settings, "rendermode", { Solid: "solid", Wireframe: "wireframe" }).onChange((mode) => {
      this.setRenderMode(mode);
    });
    renderFolder.add(this.settings, "renderFrameRate", 1, 120).name("Frame Rate").onChange((value) => {
      this.renderFrameRate = value;
    });
    renderFolder.add(this.settings, "contacts");
    renderFolder.add(this.settings, "cm2contact");
    renderFolder.add(this.settings, "normals");
    renderFolder.add(this.settings, "constraints");
    renderFolder.add(this.settings, "axes");
    renderFolder.add(this.settings, "aabbs");

    // Simulation folder
    const simulationFolder = this.gui.addFolder("Simulation");
    // Pause
    simulationFolder.add(this.settings, "paused").onChange((paused) => {
      if (paused) {
        this.smoothie.stop();
      } else {
        this.smoothie.start();
      }
      this.resetCallTime = true;
    });
    simulationFolder.add(this.settings, "stepFrequency", 10, 60 * 10, 10);
    simulationFolder.add(this.settings, "maxSubSteps", 1, 50, 1);
    simulationFolder.add(this.settings, "physicsFrameRate", 1, 120).name("Physics Rate").onChange((value) => {
      this.physicsFrameRate = value;
      this.settings.stepFrequency = value;
    });

    const maxg = 100;
    simulationFolder.add(this.settings, "gx", -maxg, maxg).onChange((gx) => {
      if (isNaN(gx)) {
        return;
      }
      this.world.gravity.set(gx, this.settings.gy, this.settings.gz);
    });
    simulationFolder.add(this.settings, "gy", -maxg, maxg).onChange((gy) => {
      if (isNaN(gy)) {
        return;
      }
      this.world.gravity.set(this.settings.gx, gy, this.settings.gz);
    });
    simulationFolder.add(this.settings, "gz", -maxg, maxg).onChange((gz) => {
      if (isNaN(gz)) {
        return;
      }
      this.world.gravity.set(this.settings.gx, this.settings.gy, gz);
    });
    simulationFolder.add(this.settings, "quatNormalizeSkip", 0, 50, 1).onChange((skip) => {
      if (isNaN(skip)) {
        return;
      }
      this.world.quatNormalizeSkip = skip;
    });
    simulationFolder.add(this.settings, "quatNormalizeFast").onChange((fast) => {
      this.world.quatNormalizeFast = !!fast;
    });
    simulationFolder.add(this.settings, "profiling").onChange((profiling) => {
      if (profiling) {
        this.world.doProfiling = true;
        this.smoothie.start();
        this.smoothieCanvas.style.display = "block";
      } else {
        this.world.doProfiling = false;
        this.smoothie.stop();
        this.smoothieCanvas.style.display = "none";
      }
    });

    // Solver folder
    const solverFolder = this.gui.addFolder("Solver");
    solverFolder.add(this.settings, "iterations", 1, 50, 1).onChange((it) => {
      this.world.solver.iterations = it;
    });
    solverFolder.add(this.settings, "k", 10, 10000000).onChange((k) => {
      this.setGlobalSpookParams(this.settings.k, this.settings.d, 1 / this.settings.stepFrequency);
    });
    solverFolder.add(this.settings, "d", 0, 20, 0.1).onChange((d) => {
      this.setGlobalSpookParams(this.settings.k, this.settings.d, 1 / this.settings.stepFrequency);
    });
    solverFolder.add(this.settings, "tolerance", 0.0, 10.0, 0.01).onChange((t) => {
      this.world.solver.tolerance = t;
    });

    // Scene picker folder
    this.sceneFolder = this.gui.addFolder("Scenes");
    this.sceneFolder.open();
  };

  updateGui = () => {
    // First level
    this.gui.__controllers.forEach((controller) => {
      controller.updateDisplay();
    });

    // Second level
    Object.values(this.gui.__folders).forEach((folder) => {
      folder.__controllers.forEach((controller) => {
        controller.updateDisplay();
      });
    });
  };

  randomMaterialColor = () => {
    var o = Math.round,
      r = Math.random,
      s = 255;
    return "rgb(" + o(r() * s) + "," + o(r() * s) + "," + o(r() * s) + ")";
  };

  setRenderMode = (mode) => {
    if (!this.renderModes.includes(mode)) {
      throw new Error(`Render mode ${mode} not found!`);
    }

    switch (mode) {
      case "solid":
        this.currentMaterial = this.solidMaterial;
        break;
      case "wireframe":
        this.currentMaterial = this.wireframeMaterial;
        break;
    }

    // set the materials
    this.visuals.forEach((visual) => {
      if (visual.material) {
        if (mode === "solid") {
          if (visual.userData.physicsType == 2) {
            visual.material = this.currentMaterial;
          } else visual.material = new THREE.MeshLambertMaterial({ color: this.randomMaterialColor() });
        } else visual.material = this.currentMaterial;
      }
      visual.traverse((child) => {
        if (child.material) {
          child.material = this.currentMaterial;
          if (mode === "solid") {
            if (visual.userData.physicsType == 2 || child.userData.physicsType == 2)
              child.material = this.currentMaterial;
            else child.material = new THREE.MeshLambertMaterial({ color: this.randomMaterialColor() });
          } else child.material = this.currentMaterial;
        }
      });
    });

    this.settings.rendermode = mode;
  };

  initStats = () => {
    this.stats = new Stats();

    this.bodiesStatsPanel = this.stats.addPanel(new Stats.Panel("Bodies", "#fffd00", "#838200"));

    const panels = [0, 1, 2, 3]; // 0: fps, 1: ms, 2: mb
    Array.from(this.stats.dom.children).forEach((child, index) => {
      child.style.display = panels.includes(index) ? "inline-block" : "none";
    });
    document.getElementById("canvasContainer").appendChild(this.stats.dom);
    // document.body.appendChild(this.stats.domElement);
  };

  /**
   * Add a scene to the demo app
   * @method addScene
   * @param {String} title Title of the scene
   * @param {Function} initfunc A function this takes one argument, app, and initializes a physics scene. The function runs app.setWorld(body), app.addVisual(body), app.removeVisual(body) etc.
   */
  addScene = (title, initfunc) => {
    if (typeof title !== "string") {
      throw new Error("1st argument of Demo.addScene(title,initfunc) must be a string!");
    }
    if (typeof initfunc !== "function") {
      throw new Error("2nd argument of Demo.addScene(title,initfunc) must be a function!");
    }

    this.scenes[title] = initfunc;
    this.sceneFolder.add({ [title]: () => this.changeScene(title) }, title);
  };

  /**
   * Restarts the current scene
   * @method restartCurrentScene
   */
  restartCurrentScene = () => {
    this.bodies.forEach((body) => {
      body.position.copy(body.initPosition);
      body.velocity.copy(body.initVelocity);
      if (body.initAngularVelocity) {
        body.angularVelocity.copy(body.initAngularVelocity);
        body.quaternion.copy(body.initQuaternion);
      }
    });
  };

  updateVisuals = () => {
    // Copy position data into visuals
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      const visual = this.visuals[i];

      // Interpolated or not?
      let position = body.interpolatedPosition;
      let quaternion = body.interpolatedQuaternion;
      if (this.settings.paused || this.renderPaused) {
        position = body.position;
        quaternion = body.quaternion;
      }

      if (visual.isInstancedMesh) {
        this.dummy.position.copy(position);
        this.dummy.quaternion.copy(quaternion);

        this.dummy.updateMatrix();

        visual.setMatrixAt(body.instanceIndex, this.dummy.matrix);
        visual.instanceMatrix.needsUpdate = true;
      } else {
        visual.position.copy(position);
        visual.quaternion.copy(quaternion);
      }
    }

    // Render contacts
    this.contactMeshCache.restart();
    if (this.settings.contacts) {
      // if ci is even - use body i, else j
      for (let i = 0; i < this.world.contacts.length; i++) {
        const contact = this.world.contacts[i];

        for (let ij = 0; ij < 2; ij++) {
          const mesh = this.contactMeshCache.request();
          const b = ij === 0 ? contact.bi : contact.bj;
          const r = ij === 0 ? contact.ri : contact.rj;
          mesh.position.set(b.position.x + r.x, b.position.y + r.y, b.position.z + r.z);
        }
      }
    }
    this.contactMeshCache.hideCached();

    // Lines from center of mass to contact point
    this.cm2contactMeshCache.restart();
    if (this.settings.cm2contact) {
      for (let i = 0; i < this.world.contacts.length; i++) {
        const contact = this.world.contacts[i];

        for (let ij = 0; ij < 2; ij++) {
          const line = this.cm2contactMeshCache.request();
          const b = ij === 0 ? contact.bi : contact.bj;
          const r = ij === 0 ? contact.ri : contact.rj;
          line.scale.set(r.x, r.y, r.z);
          makeSureNotZero(line.scale);
          line.position.copy(b.position);
        }
      }
    }
    this.cm2contactMeshCache.hideCached();

    this.distanceConstraintMeshCache.restart();
    this.p2pConstraintMeshCache.restart();
    if (this.settings.constraints) {
      this.world.constraints.forEach((constraint) => {
        switch (true) {
          // Lines for distance constraints
          case constraint instanceof CANNON.DistanceConstraint: {
            constraint.equations.forEach((equation) => {
              const { bi, bj } = equation;

              const line = this.distanceConstraintMeshCache.request();

              // Remember, bj is either a Vec3 or a Body.
              const vector = bj.position || bj;

              line.scale.set(vector.x - bi.position.x, vector.y - bi.position.y, vector.z - bi.position.z);
              makeSureNotZero(line.scale);
              line.position.copy(bi.position);
            });

            break;
          }

          // Lines for point to point constraints
          case constraint instanceof CANNON.PointToPointConstraint: {
            constraint.equations.forEach((equation) => {
              const { bi, bj } = equation;

              const relLine1 = this.p2pConstraintMeshCache.request();
              const relLine2 = this.p2pConstraintMeshCache.request();
              const diffLine = this.p2pConstraintMeshCache.request();
              if (equation.ri) {
                relLine1.scale.set(equation.ri.x, equation.ri.y, equation.ri.z);
              }
              if (equation.rj) {
                relLine2.scale.set(equation.rj.x, equation.rj.y, equation.rj.z);
              }
              // BUG this is not exposed anymore in the ContactEquation, this sections needs to be updated
              if (equation.penetrationVec) {
                diffLine.scale.set(-equation.penetrationVec.x, -equation.penetrationVec.y, -equation.penetrationVec.z);
              }
              makeSureNotZero(relLine1.scale);
              makeSureNotZero(relLine2.scale);
              makeSureNotZero(diffLine.scale);
              relLine1.position.copy(bi.position);
              relLine2.position.copy(bj.position);

              if (equation.bj && equation.rj) {
                equation.bj.position.vadd(equation.rj, diffLine.position);
              }
            });
            break;
          }
        }
      });
    }
    this.p2pConstraintMeshCache.hideCached();
    this.distanceConstraintMeshCache.hideCached();

    // Normal lines
    this.normalMeshCache.restart();
    if (this.settings.normals) {
      for (let i = 0; i < this.world.contacts.length; i++) {
        const constraint = this.world.contacts[i];

        const bi = constraint.bi;
        const bj = constraint.bj;
        const line = this.normalMeshCache.request();

        const constraintNormal = constraint.ni;
        const body = bi;
        line.scale.set(constraintNormal.x, constraintNormal.y, constraintNormal.z);
        makeSureNotZero(line.scale);
        line.position.copy(body.position);
        constraint.ri.vadd(line.position, line.position);
      }
    }
    this.normalMeshCache.hideCached();

    // Frame axes for each body
    this.axesMeshCache.restart();
    if (this.settings.axes) {
      for (let i = 0; i < this.bodies.length; i++) {
        const body = this.bodies[i];

        const mesh = this.axesMeshCache.request();
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      }
    }
    this.axesMeshCache.hideCached();

    // AABBs
    this.bboxMeshCache.restart();
    if (this.settings.aabbs) {
      for (let i = 0; i < this.bodies.length; i++) {
        const body = this.bodies[i];
        if (body.updateAABB) {
          if (body.aabbNeedsUpdate) {
            body.updateAABB();
          }

          // Todo: cap the infinite AABB to scene AABB, for now just dont render
          if (
            isFinite(body.aabb.lowerBound.x) &&
            isFinite(body.aabb.lowerBound.y) &&
            isFinite(body.aabb.lowerBound.z) &&
            isFinite(body.aabb.upperBound.x) &&
            isFinite(body.aabb.upperBound.y) &&
            isFinite(body.aabb.upperBound.z) &&
            body.aabb.lowerBound.x - body.aabb.upperBound.x != 0 &&
            body.aabb.lowerBound.y - body.aabb.upperBound.y != 0 &&
            body.aabb.lowerBound.z - body.aabb.upperBound.z != 0
          ) {
            const mesh = this.bboxMeshCache.request();
            mesh.scale.set(
              body.aabb.lowerBound.x - body.aabb.upperBound.x,
              body.aabb.lowerBound.y - body.aabb.upperBound.y,
              body.aabb.lowerBound.z - body.aabb.upperBound.z
            );
            mesh.position.set(
              (body.aabb.lowerBound.x + body.aabb.upperBound.x) * 0.5,
              (body.aabb.lowerBound.y + body.aabb.upperBound.y) * 0.5,
              (body.aabb.lowerBound.z + body.aabb.upperBound.z) * 0.5
            );
          }
        }
      }
    }
    this.bboxMeshCache.hideCached();
  };

  changeScene = (name) => {
    this.dispatchEvent({ type: "destroy" });
    window.dispatchEvent(new CustomEvent("worldReset"));

    // unbind all listeners
    Object.keys(this.listeners).forEach((event) => {
      this.listeners[event].forEach((callback) => {
        this.removeEventListener(event, callback);
      });
    });
    this.listeners = {};

    this.settings.paused = false;
    this.settings.renderPaused = false;
    this.updateGui();
    this.buildScene(name);
  };

  buildScene = (name) => {
    // Remove current bodies
    this.bodies.forEach((body) => this.world.removeBody(body));

    // Remove all visuals
    this.removeAllVisuals();

    // Remove all constraints
    while (this.world.constraints.length) {
      this.world.removeConstraint(this.world.constraints[0]);
    }

    // Run the user defined "build scene" function
    this.scenes[name]();

    // Read the newly set data to the gui
    this.settings.iterations = this.world.solver.iterations;
    this.settings.gx = this.world.gravity.x + 0.0;
    this.settings.gy = this.world.gravity.y + 0.0;
    this.settings.gz = this.world.gravity.z + 0.0;
    this.settings.quatNormalizeSkip = this.world.quatNormalizeSkip;
    this.settings.quatNormalizeFast = this.world.quatNormalizeFast;
    this.updateGui();

    this.restartGeometryCaches();
    this.currentScene = name;
  };

  initGeometryCaches = () => {
    // Material
    this.materialColor = 0xaaaaaa;
    this.solidMaterial = new THREE.MeshLambertMaterial({ color: this.materialColor });
    //THREE.ColorUtils.adjustHSV( solidMaterial.color, 0, 0, 0.9 );
    this.wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this.currentMaterial = this.solidMaterial;
    const contactDotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    this.triggerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

    const contactPointGeometry = new THREE.SphereGeometry(0.1, 6, 6);
    this.contactMeshCache = new GeometryCache(this.scene, () => {
      return new THREE.Mesh(contactPointGeometry, contactDotMaterial);
    });

    this.cm2contactMeshCache = new GeometryCache(this.scene, () => {
      const geometry = new THREE.Geometry();
      geometry.vertices.push(new THREE.Vector3(0, 0, 0));
      geometry.vertices.push(new THREE.Vector3(1, 1, 1));
      return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    });

    const bboxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const bboxMaterial = new THREE.MeshBasicMaterial({
      color: this.materialColor,
      wireframe: true,
    });
    this.bboxMeshCache = new GeometryCache(this.scene, () => {
      return new THREE.Mesh(bboxGeometry, bboxMaterial);
    });

    this.distanceConstraintMeshCache = new GeometryCache(this.scene, () => {
      const geometry = new THREE.Geometry();
      geometry.vertices.push(new THREE.Vector3(0, 0, 0));
      geometry.vertices.push(new THREE.Vector3(1, 1, 1));
      return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    });

    this.p2pConstraintMeshCache = new GeometryCache(this.scene, () => {
      const geometry = new THREE.Geometry();
      geometry.vertices.push(new THREE.Vector3(0, 0, 0));
      geometry.vertices.push(new THREE.Vector3(1, 1, 1));
      return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    });

    this.normalMeshCache = new GeometryCache(this.scene, () => {
      const geometry = new THREE.Geometry();
      geometry.vertices.push(new THREE.Vector3(0, 0, 0));
      geometry.vertices.push(new THREE.Vector3(1, 1, 1));
      return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    });

    this.axesMeshCache = new GeometryCache(this.scene, () => {
      const mesh = new THREE.Object3D();
      const origin = new THREE.Vector3(0, 0, 0);
      const gX = new THREE.Geometry();
      const gY = new THREE.Geometry();
      const gZ = new THREE.Geometry();
      gX.vertices.push(origin);
      gY.vertices.push(origin);
      gZ.vertices.push(origin);
      gX.vertices.push(new THREE.Vector3(1, 0, 0));
      gY.vertices.push(new THREE.Vector3(0, 1, 0));
      gZ.vertices.push(new THREE.Vector3(0, 0, 1));
      const lineX = new THREE.Line(gX, new THREE.LineBasicMaterial({ color: 0xff0000 }));
      const lineY = new THREE.Line(gY, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
      const lineZ = new THREE.Line(gZ, new THREE.LineBasicMaterial({ color: 0x0000ff }));
      mesh.add(lineX);
      mesh.add(lineY);
      mesh.add(lineZ);
      return mesh;
    });
  };

  restartGeometryCaches = () => {
    this.contactMeshCache.restart();
    this.contactMeshCache.hideCached();

    this.cm2contactMeshCache.restart();
    this.cm2contactMeshCache.hideCached();

    this.distanceConstraintMeshCache.restart();
    this.distanceConstraintMeshCache.hideCached();

    this.normalMeshCache.restart();
    this.normalMeshCache.hideCached();
  };

  animate = () => {
    requestAnimationFrame(this.animate);

    const currentTime = performance.now();

    // Check if enough time has passed for physics update
    if (!this.settings.paused) {
      const physicsFrameTime = 1000 / this.settings.physicsFrameRate;
      if (currentTime - this.lastPhysicsTime >= physicsFrameTime) {
        this.updatePhysics();
        this.lastPhysicsTime = currentTime;
      }
    }

    // Check if enough time has passed for render update
    if (!this.settings.renderPaused) {
      const renderFrameTime = 1000 / this.settings.renderFrameRate;
      if (currentTime - this.lastRenderTime >= renderFrameTime) {
        this.updateVisuals();
        this.renderer.render(this.scene, this.camera);
        this.lastRenderTime = currentTime;
      }
    }

    this.bodiesStatsPanel.update(this.bodies.length, 150);
    this.controls.update();
    this.stats.update();
    window.dispatchEvent(new CustomEvent("worldUpdate"));
  };

  lastCallTime = 0;
  resetCallTime = false;
  updatePhysics = () => {
    const timeStep = 1 / this.settings.physicsFrameRate;

    const now = performance.now() / 1000;

    if (!this.lastCallTime) {
      this.world.step(timeStep);
      this.lastCallTime = now;
      return;
    }

    let timeSinceLastCall = now - this.lastCallTime;
    if (this.resetCallTime) {
      timeSinceLastCall = 0;
      this.resetCallTime = false;
    }

    this.world.step(timeStep, timeSinceLastCall, this.settings.maxSubSteps);

    this.lastCallTime = now;
  };

  resize = () => {
    this.camera.aspect = this.renderWidth / this.renderHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.renderHeight, this.renderWidth);
  };

  initThree = () => {
    // Camera
    this.camera = new THREE.PerspectiveCamera(24, this.renderWidth / this.renderHeight, 5, 2000);

    this.camera.position.set(0, 20, 90);
    this.camera.lookAt(0, 0, 0);

    // Scene
    this.scene = new THREE.Scene();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.renderWidth, this.renderHeight);
    document.getElementById("canvasContainer").appendChild(this.renderer.domElement);

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(this.ambientLight);

    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 1.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.dampingFactor = 0.2;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 500;

    // Enable shadow mapping in the renderer
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    // Add ambient light for base illumination
    const ambientLight = new AmbientLight(0x404040, 1.5); // soft white light
    this.scene.add(ambientLight);

    // Add directional light for shadows
    const dirLight = new DirectionalLight(0xffffff, 1);
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

    // Update the ground plane material to receive shadows
    this.groundMaterial = new THREE.MeshPhongMaterial({
      color: 0x808080,  // Subtle gray color
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
    });
  };

  initSmoothie = () => {
    this.smoothieCanvas = document.createElement("canvas");
    this.smoothieCanvas.width = this.renderWidth;
    this.smoothieCanvas.height = this.renderHeight;
    this.smoothieCanvas.style.opacity = 0.7;
    this.smoothieCanvas.style.position = "absolute";
    this.smoothieCanvas.style.top = "0px";
    this.smoothieCanvas.style.zIndex = 1;
    document.getElementById("canvasContainer").appendChild(this.smoothieCanvas);

    this.smoothie = new SmoothieChart({
      labelOffsetY: 50,
      maxDataSetLength: 100,
      millisPerPixel: 2,
      grid: {
        strokeStyle: "none",
        fillStyle: "none",
        lineWidth: 1,
        millisPerLine: 250,
        verticalSections: 6,
      },
      labels: {
        fillStyle: "rgb(180, 180, 180)",
      },
    });
    this.smoothie.streamTo(this.smoothieCanvas);

    // Create time series for each profile label
    const lines = {};
    const colors = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [255, 0, 255],
      [0, 255, 255],
    ];

    Object.keys(this.world.profile).forEach((label, i) => {
      const color = colors[i % colors.length];
      lines[label] = new TimeSeries({
        label,
        fillStyle: `rgb(${color[0]},${color[1]},${color[2]})`,
        maxDataLength: 500,
      });
    });

    // Add a random value to each line every second
    this.world.addEventListener("postStep", () => {
      Object.keys(this.world.profile).forEach((label) => {
        lines[label].append(this.world.time * 1000, this.world.profile[label]);
      });
    });

    // Add to SmoothieChart
    Object.keys(this.world.profile).forEach((label, i) => {
      const color = colors[i % colors.length];
      this.smoothie.addTimeSeries(lines[label], {
        strokeStyle: `rgb(${color[0]},${color[1]},${color[2]})`,
        lineWidth: 2,
      });
    });

    // Pause it
    this.world.doProfiling = false;
    this.smoothie.stop();
    this.smoothieCanvas.style.display = "none";
  };

  setGlobalSpookParams(k, d, h) {
    // Set for all constraints
    for (let i = 0; i < this.world.constraints.length; i++) {
      const constraint = this.world.constraints[i];
      for (let j = 0; j < constraint.equations.length; j++) {
        const equation = constraint.equations[j];
        equation.setSpookParams(k, d, h);
      }
    }

    // Set for all contact materals
    for (let i = 0; i < this.world.contactmaterials.length; i++) {
      const contactMaterial = this.world.contactmaterials[i];
      contactMaterial.contactEquationStiffness = k;
      contactMaterial.frictionEquationStiffness = k;
      contactMaterial.contactEquationRelaxation = d;
      contactMaterial.frictionEquationRelaxation = d;
    }

    this.world.defaultContactMaterial.contactEquationStiffness = k;
    this.world.defaultContactMaterial.frictionEquationStiffness = k;
    this.world.defaultContactMaterial.contactEquationRelaxation = d;
    this.world.defaultContactMaterial.frictionEquationRelaxation = d;
  }

  getWorld() {
    return this.world;
  }

  addVisual(body) {
    if (!(body instanceof CANNON.Body)) {
      throw new Error("The argument passed to addVisual() is not a body");
    }

    // if it's a particle paint it red, if it's a trigger paint it as green, if it's a plane paint it grey, otherwise random color
    let material = this.currentMaterial.clone();
    const isParticle = body.shapes.every((s) => s instanceof CANNON.Particle);
    if (isParticle) {
      material = this.particleMaterial;
    } else if (body.isTrigger) {
      material = this.triggerMaterial;
    } else if (body.type === CANNON.Body.STATIC && body.shapes[0] instanceof CANNON.Plane) {
      material = this.groundMaterial;
    } else if (body.type === CANNON.Body.STATIC) {
      material = this.currentMaterial;
    } else {
      material.color.set(this.randomMaterialColor());
    }

    // get the correspondant three.js mesh
    const mesh = bodyToMesh(body, material);
    mesh.userData.physicsType = body.type;

    this.bodies.push(body);
    this.visuals.push(mesh);

    this.scene.add(mesh);
  }

  addVisuals(bodies) {
    bodies.forEach((body) => {
      this.addVisual(body);
    });
  }

  addVisualsInstanced(bodies) {
    if (
      !Array.isArray(bodies) ||
      !bodies.every((body) => body instanceof CANNON.Body && body.type === bodies[0].type)
    ) {
      throw new Error("The argument passed to addVisualsInstanced() is not an array of bodies of the same type");
    }

    // all bodies are the same, so pick the first
    const body = bodies[0];

    // if it's a particle paint it red, otherwise just gray
    const material = body.shapes.every((s) => s instanceof CANNON.Particle)
      ? this.particleMaterial
      : this.currentMaterial;

    // get the three.js mesh correspondant of the first body since they're of the same type
    const meshGroup = bodyToMesh(body, material);

    // extract the mesh from the group
    let mesh;
    meshGroup.traverse((child) => {
      if (child.isMesh) mesh = child;
    });

    // the clone is there because of this issue
    // https://github.com/mrdoob/three.js/issues/17701
    const instancedMesh = new THREE.InstancedMesh(mesh.geometry.clone(), mesh.material.clone(), bodies.length);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // will be updated every frame

    // Add bodies
    bodies.forEach((body, i) => {
      this.bodies.push(body);
      this.visuals.push(instancedMesh);
      body.instanceIndex = i;
    });

    this.scene.add(instancedMesh);
  }

  removeVisual(body) {
    const index = this.bodies.findIndex((b) => b.id === body.id);

    if (index === -1) {
      return;
    }

    const visual = this.visuals[index];

    this.bodies.splice(index, 1);
    this.visuals.splice(index, 1);

    this.scene.remove(visual);
  }

  removeAllVisuals() {
    while (this.bodies.length) {
      this.removeVisual(this.bodies[0]);
    }
  }

  addEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    } else {
      this.listeners[event] = [callback];
    }

    super.addEventListener(event, callback);
  }
}

class GeometryCache {
  geometries = [];
  gone = [];

  constructor(scene, createFunc) {
    this.scene = scene;
    this.createFunc = createFunc;
  }

  request = () => {
    const geometry = this.geometries.length > 0 ? this.geometries.pop() : this.createFunc();

    this.scene.add(geometry);
    this.gone.push(geometry);
    return geometry;
  };

  restart = () => {
    while (this.gone.length) {
      this.geometries.push(this.gone.pop());
    }
  };

  hideCached = () => {
    this.geometries.forEach((geometry) => {
      this.scene.remove(geometry);
    });
  };
}

function makeSureNotZero(vector) {
  if (vector.x === 0) {
    vector.x = 1e-6;
  }
  if (vector.y === 0) {
    vector.y = 1e-6;
  }
  if (vector.z === 0) {
    vector.z = 1e-6;
  }
}

export { Engine };
