import { ARButton } from "./ARButton.js";

var scene, camera, renderer, clock, deltaTime, totalTime;

var arToolkitSource, arToolkitContext;

var markerNames, markerArray, currentMarkerName;

var sceneGroup;

var globe;

const prevMarkerState = [];
const markerGroup = [];

initialize();
renderer.setAnimationLoop( animate );

function initialize()
{
    scene = new THREE.Scene();

    let ambientLight = new THREE.AmbientLight( 0xcccccc, 0.5 );
    scene.add( ambientLight );

    camera = new THREE.Camera();
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({
        antialias : true,
    alpha: true
    });
    renderer.setClearColor(new THREE.Color('lightgrey'), 0)
    renderer.setSize( 800, 600 );
    renderer.xr.enabled = true;
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.top = '0px'
    renderer.domElement.style.left = '0px'
    document.body.appendChild( renderer.domElement );
    document.body.appendChild( ARButton.createButton( renderer, { requiredFeatures: [ 'hit-test' ] }) );

    clock = new THREE.Clock();
    deltaTime = 0;
    totalTime = 0;

    ////////////////////////////////////////////////////////////
    // setup arToolkitSource
    ////////////////////////////////////////////////////////////

    arToolkitSource = new THREEx.ArToolkitSource({
        sourceType : 'webcam',
    });

    function onResize()
    {
        arToolkitSource.onResize()
        arToolkitSource.copySizeTo(renderer.domElement)
        if ( arToolkitContext.arController !== null )
        {
            arToolkitSource.copySizeTo(arToolkitContext.arController.canvas)
        }
    }

    arToolkitSource.init(function onReady(){
        onResize()
    });

    // handle resize event
    window.addEventListener('resize', function(){
        onResize()
    });

    ////////////////////////////////////////////////////////////
    // setup arToolkitContext
    ////////////////////////////////////////////////////////////

    // create atToolkitContext
    arToolkitContext = new THREEx.ArToolkitContext({
    cameraParametersUrl: 'data/camera_para.dat',
    detectionMode: 'mono',
    maxDetectionRate: 60,
    });

    // copy projection matrix to camera when initialization complete
    arToolkitContext.init( function onCompleted(){
        camera.projectionMatrix.copy( arToolkitContext.getProjectionMatrix() );
    });

    ////////////////////////////////////////////////////////////
    // setup markerRoots
    ////////////////////////////////////////////////////////////

    markerNames = ["kanji", "letterA", "letterC", "letterB"];

    markerArray = [];

    for (let i = 0; i < markerNames.length; i++)
    {
        let marker = new THREE.Group();
        scene.add(marker);
        markerArray.push(marker);

        let markerControls = new THREEx.ArMarkerControls(arToolkitContext, marker, {
        type: 'pattern', patternUrl: "data/" + markerNames[i] + ".patt",
        });

        markerGroup[i] = new THREE.Group();
        const mesh = new THREE.Mesh( new THREE.BoxGeometry( ), new THREE.MeshBasicMaterial( { color: 0x0000ff, opacity: 0.5, wireframe: true } ) );
        mesh.position.setY(0.5);
        markerGroup[i].add( mesh);
        scene.add(markerGroup[i]);
    }

    ////////////////////////////////////////////////////////////
    // setup scene
    ////////////////////////////////////////////////////////////

    sceneGroup = new THREE.Group();

    var canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext("2d");
    var texture = new THREE.CanvasTexture(canvas);
    var material = new THREE.MeshBasicMaterial( { map: texture } );

    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "green";
    ctx.font = "80px sans-serif";
    ctx.fillText("Info", 50, 90);
    texture.needsUpdate = true;

    const material1 = new THREE.MeshBasicMaterial( { map: texture } );

    const geometry1 = new THREE.PlaneGeometry( 2, 2 );
    globe = new THREE.Mesh( geometry1, material1 );

    globe.position.y = 1;
    globe.position.z = -1;
    sceneGroup.add(globe);

    scene.add( sceneGroup );
    currentMarkerName = markerNames[0];

    let pointLight = new THREE.PointLight( 0xffffff, 1, 50 );
    camera.add( pointLight );
}

function alignPrevMarkers(base, target) {
    let relativeRotation = target.quaternion.clone().normalize().multiply( base.quaternion.clone().normalize().invert() );

    let relativeScale = target.scale.clone().divide( base.scale.clone() );

    for (let i = 0; i < markerArray.length; i++) {
        if (prevMarkerState[i]) {
            prevMarkerState[i].position.sub(base.position.clone());
            prevMarkerState[i].position.applyQuaternion(relativeRotation.clone().normalize());
            prevMarkerState[i].position.add(target.position.clone());
            prevMarkerState[i].quaternion.premultiply(relativeRotation.clone().normalize());
            prevMarkerState[i].scale.multiply(relativeScale.clone());
        }
    }
}

function update()
{
    for (let i = 0; i < markerArray.length; i++) {
        const marker = markerArray[i];
        if (marker.visible) {
            globe.visible = false;
            if (prevMarkerState[i]) {
                alignPrevMarkers(prevMarkerState[i], markerArray[i]);
                break;
            } else {
                prevMarkerState[i] = {
                    position: marker.position.clone(),
                    quaternion: marker.quaternion.clone(),
                    scale: marker.scale.clone()
                };
            }
        } else {
            globe.visible = true;
        }
    }

    // update relative positions of markers
    for (let i = 0; i < markerArray.length; i++)
    {
        if (prevMarkerState[i]) {
            markerGroup[i].position.copy( prevMarkerState[i].position );
            markerGroup[i].quaternion.copy( prevMarkerState[i].quaternion );
            markerGroup[i].scale.copy( prevMarkerState[i].scale );
        }
    }
    // update artoolkit on every frame
    if ( arToolkitSource.ready !== false )
        arToolkitContext.update( arToolkitSource.domElement );

}


function render()
{
    renderer.render( scene, camera );
}


function animate( timestamp, frame )
{
    deltaTime = clock.getDelta();
    totalTime += deltaTime;

    

    update();
    render();
}
