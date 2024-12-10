import * as CANNON from "/libs/cannon-es.js";
import { Engine } from "/cannon-engine.js";
import { ResonitePhysicsOSC } from "/osc-client.js";

const cannonEngine = new Engine();
let world;
const osc = new ResonitePhysicsOSC();
let sceneMenuFolder;

const bodyTypes = {
  1: "sphere",
  2: "plane",
  4: "box",
  16: "cylinder", // Internaly this is a convexpolyhedron
};

window.addEventListener("worldReset", function () {
  osc.sendWorldReset();
  console.log("Reset world");
});

window.addEventListener("worldUpdate", function () {
  let bodiesData = {};
  for (let i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    if (body.shapes[0].type === 2) continue; // Don't send updates for the ground plane
    const bodyType = bodyTypes[body.shapes[0].type];
    bodiesData[body.id] = {
      type: bodyType,
      position: [body.position.x, body.position.y, body.position.z],
      rotation: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
    };
  }
  osc.sendPhysicsUpdate(bodiesData);
});

osc.addEventListener("resetWorld", function () {
  console.log("Reset world from websocket");
  resetWorld();
});

osc.addEventListener("pauseWorld", function () {
  pauseWorld();
  console.log("Pause world from websocket");
});

osc.addEventListener("resumeWorld", function () {
  resumeWorld();
  console.log("Resume world from websocket");
});

function createBody(type, mass, position, rotation, scale) {
  let newBodyId = -1;
  if (type === "box") newBodyId = createBox(mass, position, rotation, scale);
  else if (type === "sphere") newBodyId = createSphere(mass, position, rotation, scale);
  else if (type === "cylinder") newBodyId = createCylinder(mass, position, rotation, scale);

  // Get the created body to access its current position and rotation
  const body = world.bodies.find(b => b.id === newBodyId);
  if (body) {
    osc.addedSimulationBody(
      newBodyId,
      type,
      [body.position.x, body.position.y, body.position.z],
      [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w]
    );
  }
}

function createSphere(mass, position, rotation, radius) {
  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({ mass: mass });
  sphereBody.position.set(position.x, position.y, position.z);
  sphereBody.addShape(sphereShape);
  // sphereBody.quaternion.set(rotation);
  world.addBody(sphereBody);
  cannonEngine.addVisual(sphereBody);
  console.log("Create Sphere:", sphereBody);
  return sphereBody.id;
}

function createBox(mass, position, rotation, scale) {
  const boxShape = new CANNON.Box(new CANNON.Vec3(scale.x, scale.y, scale.z));
  let boxBody = new CANNON.Body({ mass: mass });
  boxBody.position.set(position.x, position.y, position.z);
  // boxBody.quaternion.set(rotation);
  boxBody.addShape(boxShape);
  world.addBody(boxBody);
  cannonEngine.addVisual(boxBody);
  console.log("Create Box:", boxBody);
  return boxBody.id;
}

function createCylinder(mass, position, rotation, scale) {
  const cylinderShape = new CANNON.Cylinder(scale, scale, scale * 2.2, 10);
  let cylinderBody = new CANNON.Body({ mass: mass });
  cylinderBody.position.set(position.x, position.y, position.z);
  cylinderBody.addShape(cylinderShape);
  // cylinderBody.quaternion.set(rotation);
  world.addBody(cylinderBody);
  cannonEngine.addVisual(cylinderBody);
  console.log("Create Cylinder:", cylinderBody);
  return cylinderBody.id;
}

function removeBody(bodyId) {
  const body = world.bodies.find(b => b.id === bodyId);
  if (body) {
    cannonEngine.removeVisual(body);
    world.removeBody(body);
    osc.sendRemoveBody(bodyId);
    console.log("Removed body:", bodyId);
  }
}

function setupCreateMenu() {
  sceneMenuFolder = cannonEngine.gui.addFolder("Create");
  sceneMenuFolder.open();
  sceneMenuFolder.add(
    {
      ["Create Sphere"]: () =>
        createBody(
          "sphere",
          5,
          { x: Math.random(10), y: Math.random(10) + 10, z: Math.random(10) },
          { x: 0, y: 0, z: 0, w: 1 },
          1
        ),
    },
    "Create Sphere"
  );
  sceneMenuFolder.add(
    {
      ["Create Cylinder"]: () =>
        createBody(
          "cylinder",
          5,
          { x: Math.random(10), y: Math.random(10) + 10, z: Math.random(10) },
          { x: 0, y: 0, z: 0, w: 1 },
          1
        ),
    },
    "Create Cylinder"
  );
  sceneMenuFolder.add(
    {
      ["Create Box"]: () =>
        createBody(
          "box",
          5,
          { x: Math.random(10), y: Math.random(10) + 10, z: Math.random(10) },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 1, y: 1, z: 1 }
        ),
    },
    "Create Box"
  );
  sceneMenuFolder.add(
    {
      ["Remove Last"]: () => {
        // Find last non-ground body
        const bodies = world.bodies;
        for (let i = bodies.length - 1; i >= 0; i--) {
          if (bodies[i].shapes[0].type !== 2) { // Not ground plane
            removeBody(bodies[i].id);
            break;
          }
        }
      },
    },
    "Remove Last"
  );
}

function pauseWorld() {
  cannonEngine.paused = true;
}

function resumeWorld() {
  cannonEngine.paused = false;
}

function resetWorld() {
  cannonEngine.changeScene("Empty");
}

function setupWorld(cannonEngine) {
  const world = cannonEngine.getWorld();
  world.gravity.set(0, -50, 0);

  // Max solver iterations: Use more for better force propagation, but keep in mind that it's not very computationally cheap!
  world.solver.iterations = 5;

  // Tweak contact properties.
  // Contact stiffness - use to make softer/harder contacts
  world.defaultContactMaterial.contactEquationStiffness = 1e7;

  // Stabilization time in number of timesteps
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  // Since we have many bodies and they don't move very much, we can use the less accurate quaternion normalization
  // world.quatNormalizeFast = true;
  // world.quatNormalizeSkip = 3; // ...and we do not have to normalize every step.

  // Static ground plane
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);
  cannonEngine.addVisual(groundBody);

  return world;
}

function addEmptyScene() {
  cannonEngine.addScene("Empty", () => {
    world = setupWorld(cannonEngine);
  });

  cannonEngine.changeScene("Empty");
}

function addDemoScene() {
  cannonEngine.addScene("Pile", () => {
    world = setupWorld(cannonEngine);
    let interval;

    // Plane -x
    const planeShapeXmin = new CANNON.Plane();
    const planeXmin = new CANNON.Body({ mass: 0 });
    planeXmin.addShape(planeShapeXmin);
    planeXmin.quaternion.setFromEuler(0, Math.PI / 2, 0);
    planeXmin.position.set(-5, 0, 0);
    world.addBody(planeXmin);

    // Plane +x
    const planeShapeXmax = new CANNON.Plane();
    const planeXmax = new CANNON.Body({ mass: 0 });
    planeXmax.addShape(planeShapeXmax);
    planeXmax.quaternion.setFromEuler(0, -Math.PI / 2, 0);
    planeXmax.position.set(5, 0, 0);
    world.addBody(planeXmax);

    // Plane -z
    const planeShapeZmin = new CANNON.Plane();
    const planeZmin = new CANNON.Body({ mass: 0 });
    planeZmin.addShape(planeShapeZmin);
    planeZmin.quaternion.setFromEuler(0, 0, 0);
    planeZmin.position.set(0, 0, -5);
    world.addBody(planeZmin);

    // Plane +z
    const planeShapeZmax = new CANNON.Plane();
    const planeZmax = new CANNON.Body({ mass: 0 });
    planeZmax.addShape(planeShapeZmax);
    planeZmax.quaternion.setFromEuler(0, Math.PI, 0);
    planeZmax.position.set(0, 0, 5);
    world.addBody(planeZmax);

    const size = 1;
    const bodies = [];
    let i = 0;
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      if (cannonEngine.settings.paused) return;
      if (cannonEngine.currentScene !== "Pile") return;
      // Sphere
      i++;
      const sphereShape = new CANNON.Sphere(size);
      const sphereBody = new CANNON.Body({
        mass: 5,
        position: new CANNON.Vec3(-size * 2 * Math.sin(i), size * 2 * 7, size * 2 * Math.cos(i)),
      });
      sphereBody.addShape(sphereShape);
      world.addBody(sphereBody);
      cannonEngine.addVisual(sphereBody);
      bodies.push(sphereBody);

      if (bodies.length > 80) {
        const bodyToKill = bodies.shift();
        cannonEngine.removeVisual(bodyToKill);
        world.removeBody(bodyToKill);
      }
    }, 100);
  });
}

addEmptyScene();
addDemoScene();
setupCreateMenu();
