import * as CANNON from "/libs/cannon-es.js";
import { Engine } from "/cannon-engine.js";
import { NeosPhysicsSockets } from "/websockets.js";

const cannonEngine = new Engine();
let world;
const sockets = new NeosPhysicsSockets();
let sceneMenuFolder;

const bodyTypes = {
  1: "sphere",
  2: "plane",
  4: "box",
  16: "cylinder", // Internaly this is a convexpolyhedron
};

cannonEngine.addEventListener("destroy", function () {
  sockets.sendWorldReset();
  console.log("Reset world");
});

cannonEngine.addEventListener("update", function () {
  // for (let i = 0; i < world.bodies.length; i++) {
  //   const body = world.bodies[i];
  //   if (body.shapes[0].type === 2) continue; // Don't send updates for the ground plane
  //   sockets.sendPhysicsUpdate(body.id, bodyTypes[body.shapes[0].type], body.position, body.quaternion);
  // }
  // updateSimulationBodyCount(world.bodies.length);
});

sockets.addEventListener("reset", function () {
  console.log("Reset world from websocket");
  resetWorld();
});

sockets.addEventListener("createBody", function (body) {
  console.log(createBody(body.type, body.mass, body.position, body.rotation, body.scale));
  console.log("Created body from websocket");
});

sockets.addEventListener("pause", function () {
  pauseWorld();
  console.log("Pause world from websocket");
});

sockets.addEventListener("resume", function () {
  resumeWorld();
  console.log("Resume world from websocket");
});

function createBody(type, mass, position, rotation, scale) {
  if (type === "box")
    createBox(
      mass,
      new CANNON.Vec3(position.x, position.y, position.z),
      new CANNON.quanternion(rotation.x, rotation.y, rotation.z, rotation.w),
      new CANNON.Vec3(scale.x, scale.y, scale.z)
    );
  else if (type === "sphere")
    createSphere(
      mass,
      new CANNON.Vec3(position.x, position.y, position.z),
      new CANNON.quanternion(rotation.x, rotation.y, rotation.z, rotation.w),
      scale
    );
  else if (type === "cylinder")
    createCylinder(
      mass,
      new CANNON.Vec3(position.x, position.y, position.z),
      new CANNON.quanternion(rotation.x, rotation.y, rotation.z, rotation.w),
      scale
    );
}

function createSphere(mass, position, rotation, radius) {
  console.log(mass, position, rotation, radius);

  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({
    mass: mass,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    quaternion: rotation,
  });
  sphereBody.addShape(sphereShape);
  world.addBody(sphereBody);
  cannonEngine.addVisual(sphereBody);

  // let sphereBody = new CANNON.Body({
  //   mass: mass, // kg
  //   position: position, // m
  //   shape: new CANNON.Sphere(radius),
  //   quaternion: rotation,
  //   collisionFilterGroup: 1,
  // });
  // world.addBody(sphereBody);
  // cannonEngine.addVisual(sphereBody);
  console.log("Create Sphere:", sphereBody);
}

function createBox(mass, position, rotation, scale) {
  let boxBody = new CANNON.Body({
    mass: mass,
    shape: new CANNON.Box(new CANNON.Vec3(scale.x, scale.y, scale.z)),
    position: position,
    quaternion: rotation,
    collisionFilterGroup: 1,
  });
  world.addBody(boxBody);
  cannonEngine.addVisual(boxBody);
  console.log("Create Box:", boxBody);
}

function createCylinder(mass, position, rotation, scale) {
  console.log(mass, position, rotation, scale);
  let cylinderBody = new CANNON.Body({
    mass: mass,
    shape: new CANNON.Cylinder(scale, scale, scale * 2.2, 10),
    position: position,
    quaternion: rotation,
    collisionFilterGroup: 1,
  });
  world.addBody(cylinderBody);
  cannonEngine.addVisual(cylinderBody);
  console.log("Create Cylinder:", cylinderBody);
}

function setupCreateMenu() {
  sceneMenuFolder = cannonEngine.gui.addFolder("Create");
  sceneMenuFolder.open();
  sceneMenuFolder.add(
    {
      ["Create Sphere"]: () =>
        createSphere(5, { x: Math.random(10), y: 10, z: Math.random(10) }, { x: 0, y: 0, z: 0, w: 0 }, 1),
    },
    "Create Sphere"
  );
  sceneMenuFolder.add(
    {
      ["Create Cylinder"]: () =>
        createCylinder(5, { x: Math.random(10), y: 10, z: Math.random(10) }, { x: 0, y: 0, z: 0, w: 0 }, 1),
    },
    "Create Cylinder"
  );
  sceneMenuFolder.add(
    {
      ["Create Box"]: () =>
        createBox(
          5,
          { x: Math.random(10), y: 10, z: Math.random(10) },
          { x: 0, y: 0, z: 0, w: 0 },
          { x: 1, y: 1, z: 1 }
        ),
    },
    "Create Box"
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
  world.defaultContactMaterial.contactEquationStiffness = 5e6;

  // Stabilization time in number of timesteps
  world.defaultContactMaterial.contactEquationRelaxation = 10;

  // Since we have many bodies and they don't move very much, we can use the less accurate quaternion normalization
  world.quatNormalizeFast = true;
  world.quatNormalizeSkip = 3; // ...and we do not have to normalize every step.

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
