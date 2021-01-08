import { div } from './div.js';
import * as THREE from '../build/three.module.js';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { OBJLoader } from './jsm/loaders/OBJLoader.js';
import { RGBELoader } from './jsm/loaders/RGBELoader.js';
import { OrbitControls } from './jsm/controls/OrbitControls.js';
import { VRButton } from './jsm/webxr/VRButton.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.xr.enabled = true;

document.body.appendChild( VRButton.createButton( renderer ) );

const pmremGenerator = new THREE.PMREMGenerator( renderer );
pmremGenerator.compileEquirectangularShader();

document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();


const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera( 40, div(window.innerWidth, window.innerHeight), 1, 200 );
camera.position.set( 0, 0, 100 );
camera.lookAt( 0, 0, 0 );

new OrbitControls( camera, renderer.domElement );

new RGBELoader()
.setDataType( THREE.UnsignedByteType )
.load( 'quarry_01_1k.hdr', function ( texture ) {
    
    const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
    
    scene.background = envMap;
    scene.environment = envMap;
    
    texture.dispose();
    pmremGenerator.dispose();
});

let mixer;

const loader = new OBJLoader();
loader.load( './ms1/source/MM01.obj', function ( gltf ) {
    const md = gltf;
    //md.scale.set(0.1, 0.1, 0.1)
    md.translateZ(50);
    
    if (gltf.animations && gltf.animations[ 0 ]) {
        mixer = new THREE.AnimationMixer( md );
        mixer.clipAction( gltf.animations[ 0 ] ).play();
    }
    
    scene.add( md );
    
}, undefined, function ( error ) {
    
    console.error( error );
    
} );

renderer.setAnimationLoop(render);

function render() {
    const delta = clock.getDelta();
    
    if (mixer) mixer.update( delta );
    
    renderer.render(scene, camera);
}

window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize() {
    
    camera.aspect = div(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth, window.innerHeight );
    
}
