import * as CANNON from "/libs/cannon-es.js";
import { Engine } from "/cannon-engine.js";

const cannonEngine = new Engine();
let world;
let sceneMenuFolder;

const bodyTypes = {
  1: "sphere",
  2: "plane",
  4: "box",
  16: "cylinder", // Internaly this is a convexpolyhedron
};

window.addEventListener("worldReset", function () {
  console.log("Reset world");
});

window.addEventListener("worldUpdate", function () {
  // let bodiesData = {};
  // for (let i = 0; i < world.bodies.length; i++) {
  //   const body = world.bodies[i];
  //   if (body.shapes[0].type === 2) continue;
  //   const bodyType = bodyTypes[body.shapes[0].type];
  //   bodiesData[body.id] = {
  //     type: bodyType,
  //     position: [body.position.x, body.position.y, body.position.z],
  //     rotation: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
  //   };
  // }
  // osc.sendPhysicsUpdate(bodiesData);
});

function createBody(type, mass, position, rotation, scale) {
  let newBodyId = -1;
  if (type === "box") newBodyId = createBox(mass, position, rotation, scale);
  else if (type === "sphere") newBodyId = createSphere(mass, position, rotation, scale);
  else if (type === "cylinder") newBodyId = createCylinder(mass, position, rotation, scale);
}

function createSphere(mass, position, rotation, radius) {
  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({
    mass: mass,
    material: world.defaultMaterial,
    angularDamping: 0.5,
    linearDamping: 0.3,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 0.5
  });
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
  let boxBody = new CANNON.Body({
    mass: mass,
    material: world.defaultMaterial,
    angularDamping: 0.5,
    linearDamping: 0.3,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 0.5
  });
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
  let cylinderBody = new CANNON.Body({
    mass: mass,
    material: world.defaultMaterial,
    angularDamping: 0.5,
    linearDamping: 0.3,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 0.5
  });
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

  // Enable sleeping
  world.allowSleep = true;
  world.sleepTimeLimit = 0.5;  // Time before body falls asleep (seconds)
  world.sleepSpeedLimit = 0.1; // Speed limit below which body can sleep

  const defaultMaterial = new CANNON.Material('default');

  // Increase friction significantly
  const defaultContactMaterial = new CANNON.ContactMaterial(
    defaultMaterial,
    defaultMaterial,
    {
      friction: 0.7,          // Increased from 0.3 to 0.7
      restitution: 0.3,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4
    }
  );

  world.addContactMaterial(defaultContactMaterial);
  world.defaultContactMaterial = defaultContactMaterial;

  // Max solver iterations: Use more for better force propagation, but keep in mind that it's not very computationally cheap!
  world.solver.iterations = 5;

  // Static ground plane
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({
    mass: 0,
    material: defaultMaterial
  });
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

      // Send creation event
      // osc.addedSimulationBody(
      //   sphereBody.id,
      //   "sphere",
      //   [sphereBody.position.x, sphereBody.position.y, sphereBody.position.z],
      //   [sphereBody.quaternion.x, sphereBody.quaternion.y, sphereBody.quaternion.z, sphereBody.quaternion.w]
      // );

      if (bodies.length > 80) {
        const bodyToKill = bodies.shift();
        cannonEngine.removeVisual(bodyToKill);
        world.removeBody(bodyToKill);
        // Send removal event
        // osc.sendRemoveBody(bodyToKill.id);
      }
    }, 100);
  });
}

addEmptyScene();
addDemoScene();
setupCreateMenu();
