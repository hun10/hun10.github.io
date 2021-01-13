let forwardMove = 0;
let sidewaysMove = 0;

window.addEventListener( 'keydown', function ( event ) {
  switch ( event.keyCode ) {
    // W
    case 87:
      forwardMove = -1;
      break;
    // S
    case 83:
      forwardMove = 1;
      break;
    // A
    case 65:
      sidewaysMove = -1;
      break;
    // D
    case 68:
      sidewaysMove = 1;
      break;
  }
}, false );

window.addEventListener( 'keyup', function () {
  forwardMove = 0;
  sidewaysMove = 0;
}, false );

import { div } from './div.js';
import * as THREE from '../build/three.module.js';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { VRButton } from './jsm/webxr/VRButton.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.xr.enabled = true;

document.body.appendChild( VRButton.createButton( renderer ) );
document.body.appendChild( renderer.domElement );


const scene = new THREE.Scene();

const color = 0xFFFFFF;
const intensity = 10;
scene.add(new THREE.AmbientLight(color, intensity));

scene.add(new THREE.DirectionalLight( 0xffffff, 5 ));

const floorGeometry = new THREE.PlaneBufferGeometry( 2000, 2000 );
const floorMaterial = new THREE.MeshStandardMaterial( { color: 0x222222 } );
const floor = new THREE.Mesh( floorGeometry, floorMaterial );
floor.rotation.x = - Math.PI / 2;
scene.add( floor );

const grid = new THREE.GridHelper( 200, 20, 0x111111, 0x111111 );
// grid.material.depthTest = false; // avoid z-fighting
scene.add( grid );				

const clock = new THREE.Clock();

const train = new THREE.Object3D();
train.position.set(0, 1.6, 0);
scene.add( train );

const camera = new THREE.PerspectiveCamera( 40, div(window.innerWidth, window.innerHeight), 1, 2000 );
train.add( camera );

let mixer;

const loader = new GLTFLoader();
loader.load( './m2/scene.gltf', function ( gltf ) {
    const md = gltf.scene;
    md.scale.divideScalar(50);

    const bbox = new THREE.Box3().setFromObject(md);

    md.translateZ(-10);
    md.translateY(-bbox.min.y);
    
    if (gltf.animations && gltf.animations[ 0 ]) {
        mixer = new THREE.AnimationMixer( md );
        mixer.clipAction( gltf.animations[ 0 ] ).play();
    }
    
    scene.add( md );
    
}, undefined, function ( error ) {
    
    console.error( error );
    
} );

renderer.setAnimationLoop(render);

let dr = new THREE.Vector3();
let up = new THREE.Vector3(0, 1, 0);

function render() {
    const delta = clock.getDelta();
    
    if (mixer) mixer.update( delta );
    
    
    if (renderer.xr.isPresenting) {
        let xrCamera = renderer.xr.getCamera(camera);
        xrCamera.getWorldDirection(dr);

        dr.setY(0);

        train.translateOnAxis(dr, -delta * forwardMove);

        dr.applyAxisAngle(up, Math.PI / 2);
        train.translateOnAxis(dr, -delta * sidewaysMove);
    }

    renderer.render(scene, camera);
}

window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize() {
    
    camera.aspect = div(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth , window.innerHeight );
    
}
