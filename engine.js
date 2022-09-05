import * as CANNON from "/libs/cannon-es.js";
import { Engine } from "/cannon-engine.js";
import { NeosPhysicsSockets } from "/websockets.js";

const cannonEngine = new Engine();
var size = 1;
var interval;
const world = cannonEngine.getWorld();
// const sockets = new NeosPhysicsSockets();
let sceneMenuFolder;

const bodyTypes = {
  1: "sphere",
  2: "plane",
  4: "box",
  16: "cylinder", // Internaly this is a convexpolyhedron
};

cannonEngine.addEventListener("destroy", function () {
  // sendWorldReset();
  console.log("Reset world");
});

cannonEngine.addEventListener("update", function () {
  for (let i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    if (body.shapes[0].type === 2) continue; // Don't send updates for the ground plane
    // sendPhysicsUpdate(body.id, bodyTypes[body.shapes[0].type], body.position, body.quaternion);
  }
  // updateSimulationBodyCount(world.bodies.length);
});

function setupSceneMenu() {
  sceneMenuFolder = cannonEngine.gui.addFolder("Scenes");
  sceneMenuFolder.open();
  sceneMenuFolder.add({ ["Reset"]: () => cannonEngine.resetScene(0) }, "Reset");
}

function initWorld() {
  // Spheres
  cannonEngine.addScene("Pile", () => {
    const world = setupWorld(cannonEngine);

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

  cannonEngine.buildScene(0);

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
}

setupSceneMenu();
initWorld();
