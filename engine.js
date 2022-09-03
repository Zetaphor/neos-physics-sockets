let world, lastTime;
const fixedTimeStep = 1.0 / 60.0; // seconds
const maxSubSteps = 3;
let runSimulation = false;

var sphereBody, groundBody;

const rotationVec = CANNON.Vec3();

function initWorld() {
  world = new CANNON.World();
  world.gravity.set(0, 0, -9.82); // m/s²
}

function startWorld() {
  runSimulation = true;
  update();
}

function stopWorld() {
  runSimulation = false;
}

function createSphere() {
  const radius = 1; // m
  sphereBody = new CANNON.Body({
    mass: 5, // kg
    position: new CANNON.Vec3(0, 0, 10), // m
    shape: new CANNON.Sphere(radius),
  });
  world.addBody(sphereBody);
}

function createGround() {
  groundBody = new CANNON.Body({
    mass: 0, // mass == 0 makes the body static
  });
  let groundShape = new CANNON.Plane();
  groundBody.addShape(groundShape);
  world.addBody(groundBody);
}

function update(time) {
  if (!runSimulation) return;

  if (lastTime !== undefined) {
    const dt = (time - lastTime) / 1000;
    world.step(fixedTimeStep, dt, maxSubSteps);
  }

  for (let i = 0; i < world.bodies.length; i++) {
    const element = world.bodies[i];
    sendPhysicsUpdate(world.bodies[i].id, world.bodies[i].position, world.bodies[i].quaternion);
  }

  lastTime = time;
  requestAnimationFrame(update);
}
