import { div } from './div.js';

let forwardMove = 0;
let sidewaysMove = 0;
let turnMove = 0;
let duckMove = 0;
let canPress = false;

import * as THREE from '../build/three.module.js';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { VRButton } from './jsm/webxr/VRButton.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ReinhardToneMapping;
//renderer.outputEncoding = THREE.sRGBEncoding;
//renderer.physicallyCorrectLights = true;
renderer.xr.enabled = true;

document.body.appendChild( VRButton.createButton( renderer ) );
document.body.appendChild( renderer.domElement );


const scene = new THREE.Scene();

const color = 0xFFFFFF;
const intensity = 10;
scene.add(new THREE.AmbientLight(color, intensity));

const dirLight = new THREE.DirectionalLight( 0xffffff, 5 );
dirLight.position.set(0, 1, -8);
scene.add(dirLight);

const floorGeometry = new THREE.PlaneBufferGeometry( 2000, 2000 );
const floorMaterial = new THREE.MeshStandardMaterial( { color: 0x222222 } );
const floor = new THREE.Mesh( floorGeometry, floorMaterial );
floor.rotation.x = - Math.PI / 2;
scene.add( floor );

const grid = new THREE.GridHelper( 200, 20, 0x111111, 0x111111 );
scene.add( grid );				

const clock = new THREE.Clock();

const train = new THREE.Object3D();
scene.add( train );

const camera = new THREE.PerspectiveCamera( 40, div(window.innerWidth, window.innerHeight), 0.1, 100 );
camera.position.set(0, 1.6, 0);
train.add( camera );

let mixer;
let animation;

const loader = new GLTFLoader();

function loadModel(name, height, process) {
    loader.load( `./${name}/scene.gltf`, function ( gltf ) {
        const bbox = new THREE.Box3();
        
        const md = gltf.scene;
        
        bbox.setFromObject(md);
        
        md.scale.divideScalar(bbox.max.y - bbox.min.y);
        md.scale.multiplyScalar(height);
        
        bbox.setFromObject(md);
        
        md.translateY(-bbox.min.y);
        
        scene.add( md );
        
        process(md, gltf.animations);
        
    }, undefined, function ( error ) {
        
        console.error( error );
        
    } );
}

let up = new THREE.Vector3(0, 1, 0);

const positions = [];
const angles = [];
for (let i = 0; i < 3; i++) {
    angles[i] = div(2 * Math.PI, 3) * i;
    positions[i] = new THREE.Vector3(0, 0, -1).applyAxisAngle(up, angles[i]);
}

loadModel("robotic-arm-lowtex", 4, md => {
    md
    .translateOnAxis(positions[2], 4)
    .rotateY(angles[2]);
});

loadModel("lathe-lowtex", 2, md => {
    md
    .translateOnAxis(positions[1], 4)
    .rotateY(-angles[1]);
});

loadModel("ira-low", 4, (md, animations) => {
    md
    .translateOnAxis(positions[0], 8)
    .rotateY(angles[0]);
    
    if (animations && animations[ 0 ]) {
        mixer = new THREE.AnimationMixer( md );
        animation = mixer.clipAction( animations[ 0 ] );
        animation.timeScale = 0;
        animation.play();
    }
    
});

let playButton;

loadModel("play_button", 0.1, md => {
    md
    .translateOnAxis(positions[0], 4)
    .rotateY(angles[0]);
    
    playButton = md;
    
    dirLight.target = md;
});

renderer.setAnimationLoop(render);

let dr = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const sightCenter = new THREE.Vector2(0, 0);

function render() {
    const delta = clock.getDelta();
    
    if (mixer) mixer.update( delta );
    
    
    if (renderer.xr.isPresenting) {
        let xrCamera = renderer.xr.getCamera(camera);
        xrCamera.getWorldDirection(dr);
        raycaster.setFromCamera( sightCenter, xrCamera );
    } else {
        camera.getWorldDirection(dr);
        raycaster.setFromCamera( sightCenter, camera );
    }
    
    if (playButton) {
        const intersects = raycaster.intersectObject(playButton, true);
        canPress = intersects.length > 0;
        
    }
    
    dr.setY(0);
    
    train.translateOnAxis(dr, -delta * forwardMove);
    
    dr.applyAxisAngle(up, div(Math.PI, 2));
    train.translateOnAxis(dr, -delta * sidewaysMove);
    
    camera.rotateY(-turnMove * delta);
    
    const curY = train.position.y;
    const tarY = -duckMove * 0.6;
    
    train.position.setY(curY + (tarY - curY) * delta);
    
    renderer.render(scene, camera);
}

window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize() {
    
    camera.aspect = div(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth , window.innerHeight );
    
}

window.addEventListener( 'keydown', function ( event ) {
    switch ( event.keyCode ) {
            // W
        case 87:
            forwardMove = -2;
            break;
            // S
        case 83:
            forwardMove = 2;
            break;
            // A
        case 65:
            sidewaysMove = -2;
            break;
            // D
        case 68:
            sidewaysMove = 2;
            break;
            // Q
        case 81:
            turnMove = div(-Math.PI, 2);
            break;
            // E
        case 69:
            turnMove = div(Math.PI, 2);
            break;
            // C
        case 67:
            duckMove = 1;
            break;
            // R
        case 82:
            if (animation && canPress) {
                if (animation.isRunning()) {
                    animation.halt(1);
                } else {
                    animation.timeScale = 1;
                    animation.paused = false;
                }
            };
            break;
    }
}, false );

window.addEventListener( 'keyup', function ( event ) {
    switch ( event.keyCode ) {
            // W
        case 87:
            forwardMove = 0;
            break;
            // S
        case 83:
            forwardMove = 0;
            break;
            // A
        case 65:
            sidewaysMove = 0;
            break;
            // D
        case 68:
            sidewaysMove = 0;
            break;
            // Q
        case 81:
            turnMove = 0;
            break;
            // E
        case 69:
            turnMove = 0;
            break;
            // C
        case 67:
            duckMove = 0;
            break;
    }
}, false );
