import { div } from './div.js';

let forwardMove = 0;
let sidewaysMove = 0;
let turnMove = 0;
let turnDownMove = 0;
let duckMove = 0;
let canPress = false;
let glow = 0;

import * as THREE from '../build/three.module.js';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { VRButton } from './jsm/webxr/VRButton.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.outputEncoding = THREE.sRGBEncoding;
//renderer.physicallyCorrectLights = true;
renderer.xr.enabled = true;

document.body.appendChild( VRButton.createButton( renderer ) );
document.body.appendChild( renderer.domElement );


const scene = new THREE.Scene();

scene.add( new THREE.HemisphereLight( 0x808080, 0x606060 ) );

const dirLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
dirLight.position.set(0, 6, -8);
scene.add(dirLight);

const texLoader = new THREE.TextureLoader();

const floorGeometry = new THREE.PlaneGeometry( 2000, 2000 );
const floorTex = texLoader.load("floor.jpg");
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set( 2000, 2000 );
const floorMaterial = new THREE.MeshStandardMaterial( { map: floorTex } );
const floor = new THREE.Mesh( floorGeometry, floorMaterial );
floor.rotation.x = - Math.PI / 2;
scene.add( floor );

const clock = new THREE.Clock();

const train = new THREE.Object3D();
scene.add( train );

const camera = new THREE.PerspectiveCamera( 40, div(window.innerWidth, window.innerHeight), 0.1, 100 );
camera.position.set(0, 1.6, 0);

const dotGeometry = new THREE.Geometry();
dotGeometry.vertices.push(new THREE.Vector3());
const dot = new THREE.Points(dotGeometry);
dot.material.sizeAttenuation = false;
dot.material.size = 4;
dot.material.color.setRGB ( 30, 0, 0 );
scene.add( dot );

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
const lights = [];
for (let i = 0; i < 3; i++) {
    angles[i] = div(2 * Math.PI, 3) * i;
    positions[i] = new THREE.Vector3(0, 0, -1).applyAxisAngle(up, angles[i]);

    lights[i] = new THREE.DirectionalLight( 0xffffff, 0.5 );
    lights[i].position.set(0, 3, 0);
    scene.add(lights[i]);
}

loadModel("robotic-arm-lowtex", 4, md => {
    md
    .translateOnAxis(positions[2], 4)
    .rotateY(angles[2]);

    lights[2].target = md;
});

loadModel("lathe-lowtex", 2, md => {
    md
    .translateOnAxis(positions[1], 4)
    .rotateY(-angles[1]);

    lights[1].target = md;
});

loadModel("ira-low", 4, (md, animations) => {
    md
    .translateOnAxis(positions[0], 8)
    .rotateY(angles[0]);

    lights[0].target = md;

    if (animations && animations[ 0 ]) {
        mixer = new THREE.AnimationMixer( md );
        animation = mixer.clipAction( animations[ 0 ] );
        animation.timeScale = 0;
        animation.play();
    }

});

const runImg = texLoader.load("run.png");
const stopImg = texLoader.load("stop.png");

let playButton;
let buttonSprite;

loadModel("play_button", 0.1, md => {
    md
    .translateOnAxis(positions[0], 4)
    .rotateY(angles[0]);

    const material = new THREE.SpriteMaterial( { map: runImg } );
    buttonSprite = new THREE.Sprite( material );
    buttonSprite.scale.setY(0.5);
    buttonSprite
    .translateOnAxis(positions[0], 4)
    .translateY(0.5)
    .rotateY(angles[0]);
    buttonSprite.visible = false;
    scene.add(buttonSprite);

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

    let xrCamera;
    if (renderer.xr.isPresenting) {
        xrCamera = renderer.xr.getCamera(camera);
    } else {
        xrCamera = camera;
    }

    xrCamera.getWorldDirection(dr);
    raycaster.setFromCamera( sightCenter, xrCamera );

    if (playButton) {
        const intersects = raycaster.intersectObject(playButton, true);
        canPress = intersects.length > 0;

        if (canPress) {
            if (animation.isRunning()) {
                buttonSprite.material.map = stopImg;
            } else {
                buttonSprite.material.map = runImg;
            }
            glow += delta;
            glow %= 2 * Math.PI;
            buttonSprite.material.color.setRGB(1,1,1).multiplyScalar(20 * (1.5 + Math.sin(glow * 6)));
        }
        buttonSprite.visible = canPress;
    }

    dr.setY(0);
    dr.normalize();

    train.translateOnAxis(dr, -delta * forwardMove);

    dr.applyAxisAngle(up, div(Math.PI, 2));
    train.translateOnAxis(dr, -delta * sidewaysMove);

    camera.rotateOnWorldAxis(up, -turnMove * delta);
    camera.rotateX(turnDownMove * delta);

    const curY = train.position.y;
    const tarY = -duckMove * 0.6;

    train.position.setY(curY + (tarY - curY) * delta);

    scene.updateMatrixWorld();
    if ( xrCamera.parent === null ) xrCamera.updateMatrixWorld();

    if (renderer.xr.isPresenting) {
        xrCamera = renderer.xr.getCamera(camera);
    }

    dot.position.set(0, 0, -0.11);
    dot.position.unproject(xrCamera);
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
            // G
        case 71:
            turnDownMove = div(-Math.PI, 4);
            break;
            // T
        case 84:
            turnDownMove = div(Math.PI, 4);
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
            // G
        case 71:
            turnDownMove = 0;
            break;
            // T
        case 84:
            turnDownMove = 0;
            break;
    }
}, false );
