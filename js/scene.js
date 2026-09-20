/**
 * scene.js
 * Three.js bootstrap: scene, camera, renderer, OrbitControls, lighting, ground grid and shadow catcher. No CMOS-specific geometry lives here.
 */

// =====================================================================
// THREE.JS SETUP
// =====================================================================
var host = document.getElementById('canvas-host');
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
scene.fog = new THREE.Fog(0x0a0d12, 55, 130);

var W = function(){ return host.clientWidth; };
var H = function(){ return host.clientHeight; };

var camPersp = new THREE.PerspectiveCamera(42, W()/H(), 0.1, 500);
var INITIAL_POS = new THREE.Vector3(19, 15, 22);
var INITIAL_TARGET = new THREE.Vector3(-0.5, 1.9, 0);
var TOP_VIEW_POS = new THREE.Vector3(-0.5, 38, 0.05); // straight overhead, tiny Z offset avoids gimbal-lock flip
camPersp.position.copy(INITIAL_POS);

var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
host.appendChild(renderer.domElement);

var activeCamera = camPersp;
var controls = new THREE.OrbitControls(activeCamera, renderer.domElement);
controls.target.copy(INITIAL_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 85;
controls.maxPolarAngle = Math.PI;   // full orbit — including looking up from underneath
controls.minPolarAngle = 0;
controls.update();

function resize(){
  var w = W(), h = H();
  camPersp.aspect = w/h; camPersp.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);

// lights
scene.add(new THREE.AmbientLight(0x2a3140, 1.1));
var key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(16, 24, 12);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -22; key.shadow.camera.right = 22;
key.shadow.camera.top = 22; key.shadow.camera.bottom = -22;
key.shadow.camera.far = 85;
key.shadow.bias = -0.0015;
scene.add(key);
var fill = new THREE.DirectionalLight(0x5fa8d9, 0.35);
fill.position.set(-14, 10, -10);
scene.add(fill);
var rim = new THREE.DirectionalLight(0x5fd9c4, 0.25);
rim.position.set(0, 6, -18);
scene.add(rim);

// grid + ground shadow catcher
var grid = new THREE.GridHelper(60, 40, 0x1c2530, 0x141a22);
grid.position.y = -0.02;
scene.add(grid);
var shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(90,90),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
shadowPlane.rotation.x = -Math.PI/2;
shadowPlane.position.y = -0.01;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

