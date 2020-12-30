import * as THREE from '../build/three.module.js';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { RGBELoader } from './jsm/loaders/RGBELoader.js';
import { OrbitControls } from './jsm/controls/OrbitControls.js';
import { VRButton } from './jsm/webxr/VRButton.js';

const WIDTH = 600;

const divRender = document.getElementById('render')
const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( WIDTH, WIDTH );
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.xr.enabled = true;

document.body.appendChild( VRButton.createButton( renderer ) );

const pmremGenerator = new THREE.PMREMGenerator( renderer );
pmremGenerator.compileEquirectangularShader();

//renderer.toneMapping = THREE.ACESFilmicToneMapping;
//renderer.toneMappingExposure = 1;
//renderer.outputEncoding = THREE.sRGBEncoding;

divRender.appendChild( renderer.domElement );

const scene = new THREE.Scene();


//scene.background = new THREE.Color( 0xdeebed );
//const ambientLight = new THREE.AmbientLight( 0xdeebed, 0.4 );
//scene.add( ambientLight );
//const directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
//directionalLight.position.set( - 1000, 1200, 1500 );
//scene.add( directionalLight );

const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera( 40, 1, 1, 200 );
camera.position.set( 0, 0, 100 );
camera.lookAt( 0, 0, 0 );

new OrbitControls( camera, renderer.domElement );

const loader = new GLTFLoader();
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

loader.setPath('./m2/').load( 'scene.gltf', function ( gltf ) {
    const md = gltf.scene;
    md.scale.set(0.1, 0.1, 0.1)
    
    if (gltf.animations[ 0 ]) {
        mixer = new THREE.AnimationMixer( md );
        mixer.clipAction( gltf.animations[ 0 ] ).play();
    }
    
    scene.add( md );
    //render();
    
}, undefined, function ( error ) {
    
    console.error( error );
    
} );

renderer.setAnimationLoop(render);

function render() {
    //requestAnimationFrame(render);
    
    const delta = clock.getDelta();
    
    if (mixer) mixer.update( delta );
    
    renderer.render(scene, camera);
}
