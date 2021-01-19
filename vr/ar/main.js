var scene, camera, renderer, clock, deltaTime, totalTime;

var arToolkitSource, arToolkitContext;

var markerNames, markerArray, currentMarkerName;

var sceneGroup;

var globe;

initialize();
animate();

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
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.top = '0px'
    renderer.domElement.style.left = '0px'
    document.body.appendChild( renderer.domElement );

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
    maxDetectionRate: 30,
    });

    // copy projection matrix to camera when initialization complete
    arToolkitContext.init( function onCompleted(){
        camera.projectionMatrix.copy( arToolkitContext.getProjectionMatrix() );
    });

    ////////////////////////////////////////////////////////////
    // setup markerRoots
    ////////////////////////////////////////////////////////////

    markerNames = ["kanji", "letterA", "letterB", "letterC"];

    markerArray = [];

    for (let i = 0; i < markerNames.length; i++)
    {
        let marker = new THREE.Group();
        scene.add(marker);
        markerArray.push(marker);

        let markerControls = new THREEx.ArMarkerControls(arToolkitContext, marker, {
        type: 'pattern', patternUrl: "data/" + markerNames[i] + ".patt",
        });

        let markerGroup = new THREE.Group();
        const mesh = new THREE.Mesh( new THREE.BoxGeometry( ), new THREE.MeshBasicMaterial( { color: 0x0000ff, opacity: 0.5 } ) );
        mesh.position.setY(0.5);
        markerGroup.add( mesh);
        marker.add(markerGroup);
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
    sceneGroup.add(globe);

    scene.add( sceneGroup );
    currentMarkerName = markerNames[0];

    let pointLight = new THREE.PointLight( 0xffffff, 1, 50 );
    camera.add( pointLight );
}


function update()
{
    //let c = new THREE.Vector3();
    //    let q, s;
    //let count = 0;
    //for (let i = 0; i < markerArray.length; i++) {
    //  if (markerArray[i].visible) {
    //    c.add( markerArray[i].position );
    //      q = markerArray[i].quaternion;
    //      s = markerArray[i].scale;
    //    count++;
    //  }
    //}

    //    if (count > 0) {
    //c.divideScalar(count);

    //sceneGroup.visible = true;
    //sceneGroup.position.copy(c);

    //        globe.lookAt(0, 1, 0);
    //sceneGroup.scale.copy(s);
    //sceneGroup.quaternion.copy(q);
    //    } else {
    //        sceneGroup.visible = false;
    //    }

    /*	let anyMarkerVisible = false;
     for (let i = 0; i < markerArray.length; i++)
     {
     if ( markerArray[i].visible )
     {
     anyMarkerVisible = true;
     markerArray[i].children[0].add( sceneGroup );
     if ( currentMarkerName != markerNames[i] )
     {
     currentMarkerName = markerNames[i];
     // console.log("Switching to " + currentMarkerName);
     }

     let p = markerArray[i].children[0].getWorldPosition();
     let q = markerArray[i].children[0].getWorldQuaternion();
     let s = markerArray[i].children[0].getWorldScale();
     let lerpAmount = 0.5;

     scene.add(sceneGroup);
     sceneGroup.position.lerp(p, lerpAmount);
     sceneGroup.quaternion.slerp(q, lerpAmount);
     sceneGroup.scale.lerp(s, lerpAmount);

     break;
     }
     }

     if ( !anyMarkerVisible )
     {
     // console.log("No marker currently visible.");
     }

     let baseMarker = markerArray[0];

     // update relative positions of markers
     for (let i = 1; i < markerArray.length; i++)
     {
     let currentMarker = markerArray[i];
     let currentGroup  = currentMarker.children[0];
     if ( baseMarker.visible && currentMarker.visible )
     {
     // console.log("updating marker " + i " -> base offset");

     let relativePosition = currentMarker.worldToLocal( baseMarker.position.clone() );
     currentGroup.position.copy( relativePosition );

     let relativeRotation = currentMarker.quaternion.clone().inverse().multiply( baseMarker.quaternion.clone() );
     currentGroup.quaternion.copy( relativeRotation );
     }
     }
     */
    // update artoolkit on every frame
    if ( arToolkitSource.ready !== false )
        arToolkitContext.update( arToolkitSource.domElement );

}


function render()
{
    renderer.render( scene, camera );
}


function animate()
{
    requestAnimationFrame(animate);
    deltaTime = clock.getDelta();
    totalTime += deltaTime;
    update();
    render();
}

