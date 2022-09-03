let world, lastTime;
const fixedTimeStep = 1.0 / 60.0; // seconds
const maxSubSteps = 3;
let runSimulation = false;

const bodyTypes = {
  1: 'sphere',
  2: 'plane',
  4: 'box',
  16: 'cylinder',
};

const rotationVec = CANNON.Vec3();

function buildWorld() {
  initWorld();
  createPlane();
  runSimulation = true;
  update();
}

function initWorld() {
  world = new CANNON.World();
  world.gravity.set(0, 0, -9.82); // m/s²
  updateSimulationStatus("Running");
}

function resumeWorld() {
  lastTime = 0;
  runSimulation = true;
  updateSimulationStatus("Running");
}

function stopWorld() {
  runSimulation = false;
  lastTime = 0;
  updateSimulationStatus("Paused");
}

function resetWorld() {
  for (var i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    body.position.copy(body.initPosition);
    body.velocity.copy(body.initVelocity);
    if (body.initAngularVelocity) {
      body.angularVelocity.copy(body.initAngularVelocity);
      body.quaternion.copy(body.initQuaternion);
    }
  }
}

function createBody(type, mass, position, rotation, scale) {
  if (type === 'box') createBox(mass, position, rotation, scale);
  else if (type === 'sphere') createSphere(mass, position, rotation, scale);
  else if (type === 'cylinder') createCylinder(mass, position, rotation, scale);
}

function removeBody(id) {
  for (let i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    if (world.bodies[i].id === id) {
      world.remove(body);
      break;
    }
  }
}

function createSphere(mass, position, rotation, radius) {
  let sphereBody = new CANNON.Body({
    mass: mass, // kg
    position: position, // m
    shape: new CANNON.Sphere(radius),
    quaternion: rotation
  });
  world.addBody(sphereBody);
  console.log('Create Sphere:', sphereBody);   
}

function createBox(mass, position, rotation, scale) {
  let boxBody = new CANNON.Body({
    mass: mass,
    shape: new CANNON.Box(scale),
    position: position,
    quaternion: rotation
  });
  world.addBody(boxBody);
  console.log('Create Box:', boxBody); 
}

function createCylinder(mass, position, rotation, scale) {
  console.log(mass, position, rotation, scale);
  let cylinderBody = new CANNON.Body({
    mass: mass,
    shape: new CANNON.Cylinder(scale, scale, scale * 2.2, 10),
    position: position,
    quaternion: rotation
  });
  world.addBody(cylinderBody);
  console.log('Create Cylinder:', cylinderBody); 
}

function createPlane() {
  let groundBody = new CANNON.Body({
    mass: 0, // mass == 0 makes the body static
    shape: new CANNON.Plane(),
  });
  groundBody.position.set(0, 0, 0);
  world.addBody(groundBody);
  console.log('Create Plane:', groundBody);   
}

function removeBody(id) {
  world.remove()
}

function update(time) {
  if (!runSimulation) return;

  if (lastTime !== undefined) {
    const dt = (time - lastTime) / 1000;
    world.step(fixedTimeStep, dt, maxSubSteps);
  }

  for (let i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    if (body.shapes[0].type === 2) continue; // Don't send updates for the ground plane
    sendPhysicsUpdate(body.id, bodyTypes[body.shapes[0].type], body.position, body.quaternion);
  }
  updateSimulationBodyCount(world.bodies.length);

  lastTime = time;
  requestAnimationFrame(update);
}
