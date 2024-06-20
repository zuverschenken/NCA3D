import * as THREE from 'three';
import {OrbitControls} from 'three/examples/controls/OrbitControls.js';//'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/libs/stats.module.js';
import { GUI } from 'three/examples/libs/lil-gui.module.min.js';

import { updateState, initState } from './onnxlogic.js';

const container = document.getElementById('three-canvas');
const uiContainer = document.getElementById('ui-container');


const showStats = true;

//global vars for NCA

const aliveThreshold = 0.1;//cells with aliveness greater than this will be displayed (aliveness < 0.1 means that a cell is not alive in simulation)
const grownThreshold = 0.8;//cells with aliveness less than this will be rendered at small scale (ideally we would make them transparent, but can't change alpha with instanced rendering)

let guicfg =  { deformSize: 2,
    desiredAnimal: "chicken",
    restart: function(){
        desiredAnimalChanged = true;
    }, 
};

//keep track of if user requested deformation

let tumor = false;
let deform = false;
//save the deformation the user requested for next state update request

let deformId;
let tumorId;

let newUpdateReady = false;
let updatedColorsGlobal = null;
let desiredAnimalChanged = false;

//THREE global vars
let camera, scene, renderer, controls, stats;
let mesh;
let originalPositions;
let originalPositionsb;

const amount = 32;
const count = Math.pow( amount, 3 );
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2( 1, 1 );
const color = new THREE.Color();

const hidingPosition = new THREE.Matrix4();
hidingPosition.setPosition(1000, 1000, 1000);//cells at positions that are currently < aliveThreshold have their positions set so that they are banished beyond the far clipping plane


function updateColors(state){
    for (let i = 0; i < count; i++){
        let r = state[i];
        let g = state[i + (1 * count)];
        let b = state[i + (2 * count)];
        let a = state[i + (3 * count)];

        let inverse = (count - 1) - i;
        //hide dead cells. Swap in small cells for low alpha alive cells.
        if ( a > aliveThreshold){//if the instance is 'alive', move it to its proper position
            if(a > grownThreshold){
                mesh.setColorAt(i, new THREE.Color(r, g, b));
                mesh.setMatrixAt(i, originalPositions[i]);
            }else{
                mesh.setColorAt(i, new THREE.Color(r, g, b));
                mesh.setMatrixAt(i, originalPositionsb[i]);
            }
        }else{
            mesh.setMatrixAt(i, hidingPosition);
        }
    /*highlight center of 32*32*32 grid in red
    mesh.setColorAt(16912, new THREE.Color(250, 0, 0));
    mesh.setMatrixAt(16912, originalPositions[16912]);
    */
    mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;    
    }
}


async function init(animalName) {
    originalPositions = new Array(count);//stores matrix of positions in the grid so that instances can be moved back here from the hidingPosition after they become alive
    originalPositionsb = new Array(count);

    camera = new THREE.PerspectiveCamera (45, container.clientWidth / container.clientHeight, 0.1, 250);
    camera.position.set( amount, amount, -amount );
    camera.lookAt( 0, 0, 0 );

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);
    const light = new THREE.HemisphereLight( 0xffffff, 0x888888, 3 );
    light.position.set( 0, 1, 0 );
    scene.add( light );

    const geometry = new THREE.BoxGeometry(1,1,1);
    //const geometry = new THREE.IcosahedronGeometry( 0.7, 3 ); alternative geometry

    const material = new THREE.MeshPhongMaterial( { color: 0xffffff } );

    //create the instances that make up our z*y*x grid
    mesh = new THREE.InstancedMesh( geometry, material, count);

    let i = 0;
    const offset = ( amount - 1 ) / 2;

    const matrix = new THREE.Matrix4();
    
    for ( let x = 0; x < amount; x ++ ) {
        for ( let y = 0; y < amount; y ++ ) {
            for ( let z = 0; z < amount; z ++ ) {

                //matrixb will store matrix for the mini/growing version of this instance
                const matrixb = new THREE.Matrix4();
                matrixb.makeScale(0.4, 0.4, 0.4);

                const posx = offset - x;
                const posy = offset - y;
                const posz = offset - z;
                
                matrix.setPosition(posx, posy, posz);
                matrixb.setPosition(posx, posy, posz);

                let inverse = (count - 1) - i;
                mesh.setMatrixAt( inverse, matrix );
                mesh.setColorAt( inverse, color );
                const originalMatrix = new THREE.Matrix4();
                mesh.getMatrixAt(inverse, originalMatrix); 
                originalPositions[inverse] = originalMatrix;
                originalPositionsb[inverse] = matrixb;
                i ++;


            }
        }
    }

    scene.add( mesh );

    
    //get first state from ONNX model
    let initialState = await initState(animalName);
    updatedColorsGlobal = initialState;
    updateColors(initialState);
    newUpdateReady = true;


    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setAnimationLoop( animate );
    container.appendChild(renderer.domElement);

    controls = new OrbitControls( camera, renderer.domElement );
    controls.enableDamping = true;
    controls.enableZoom = true;
    controls.enablePan = false;

    if(showStats){
        stats = new Stats();
        document.body.appendChild( stats.dom );
    }

    const gui = new GUI( {container: uiContainer }) ;
    gui.add( mesh, 'count', 0, count).name('n instances');
    gui.add( guicfg, 'deformSize', 0, 8).step(1).name('brush size');
    gui.add( guicfg, 'desiredAnimal', Object.keys(modelConfigs)).onChange(value => {
        console.log('changing animal:');
        console.log(value);
        desiredAnimalChanged = true;
    }).name('animal');
    gui.add(guicfg, 'restart');

    window.addEventListener( 'resize', onWindowResize );
    document.addEventListener( 'mousemove', onMouseMove );

}

function onWindowResize() {

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( container.clientWidth, container.clientHeight );

}

function onMouseMove( event ) {
    let x;
    let y;

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;    
    mouse.x = (x / container.clientWidth) * 2 - 1;
    mouse.y = -(y / container.clientHeight) * 2 + 1;



}

function setColorsUpdate(newColors){
    newUpdateReady = true;
    updatedColorsGlobal = newColors;
}


async function animate() {

    controls.update();
    raycaster.setFromCamera( mouse, camera );
    const intersection = raycaster.intersectObject( mesh );

    let intersectInstanceId;
    if ( intersection.length > 0 ) {//TODO: ray cast behaviour inconsistent. Consider iterating through intersections to get first ALIVE cube instead of just first cube
        intersectInstanceId = intersection[ 0 ].instanceId;
        mesh.getColorAt( intersectInstanceId, color );
        mesh.setColorAt( intersectInstanceId, color.setHex( 0xa83832 ) );
        mesh.instanceColor.needsUpdate = true;
    }

    if(deform && intersectInstanceId){
        deformId = intersectInstanceId;
    }else if(tumor && intersectInstanceId){
        tumorId = intersectInstanceId;
    }
    deform = false;
    tumor = false;

    //if there's a new update ready, apply its colours to the scene and then ask for the next update
    if(newUpdateReady){
        updateColors(updatedColorsGlobal);    
        newUpdateReady = false;
        //if the user wants to change to different animal, initialise that state
        if(desiredAnimalChanged){
            desiredAnimalChanged = false;
            let initialState = await initState(guicfg["desiredAnimal"]);
            updatedColorsGlobal = initialState;
            updateColors(initialState);
            camera.position.set( amount, amount, -amount );
            camera.lookAt( 0, 0, 0 );
            newUpdateReady = true;
        }else{
            updateState(guicfg['deformSize'], deformId, tumorId, setColorsUpdate);
            deformId = null;
            tumorId = null;

        }

    }

    renderer.render( scene, camera );
    if(showStats){
        stats.update();
    }

}

//START
init(Object.keys(modelConfigs)[0]);



document.addEventListener('keydown', function(event) {
    if (event.key === 'e') { 
    deform = true;
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'r') { 
    tumor = true;
    }
});

document.addEventListener('contextmenu', function(event) {
    deform = true;
});

