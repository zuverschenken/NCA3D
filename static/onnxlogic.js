
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.min.js";
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

ort.env.wasm.numThreads = 3;
ort.env.wasm.proxy = true;//enable async inference
let versionCount = 0;

let ndim = 24;
const boardSize = 32;
let session;
let boardState;
let coloursSet;

function convertZYXToIndex(zyx){
    let index = (boardSize * boardSize) * zyx[0];
    index += boardSize * zyx[1];
    index += zyx[2];
    return index;
}

function convertIndexToZYX(index){
    let z = Math.floor(index / (boardSize * boardSize));
    let remainder = index % (boardSize * boardSize);
    let y = Math.floor(remainder / (boardSize));
    let x = index % boardSize;
    return [z, y, x];
}

export async function  initState(animalName){

    versionCount ++;
    session = await ort.InferenceSession.create(`./static/onnx_models/${animalName}.onnx`);
    const colorPath = `./static/colour_sets/${modelConfigs[animalName]['colors']}.json`;//each shape has its own set of colours for creating tumors for that shape
    ndim = modelConfigs[animalName]['ndim'];

    fetch(colorPath)
      .then(response => response.json()) 
      .then(data => {
          coloursSet = data;
      })
      .catch(error => {
        console.error('Error fetching JSON:', error);
      });    
	
    //initial board state totally unalive/black/nonactivated
    let state = new Float32Array( 1 * ndim * boardSize * boardSize * boardSize);
    for(let i = 0; i < state.length; i++){
        state[i] = 0.0;
    }

    //place the genesis dot. according to original paper it is black and has all other values set to 1. I set rgb values to 1 as well.
    const middleIndex = (boardSize * 0.5) + (boardSize * boardSize * 0.5) + (boardSize * boardSize * boardSize * 0.5);

    for(let i = 0; i < ndim; i++){
        state[ middleIndex + (i * boardSize * boardSize * boardSize)] = 1;
    }
    boardState = new ort.Tensor('float32', state,  [1,ndim,boardSize,boardSize,boardSize]);
    //what gets returned to the main loop to be rendered is just the rgba of each cell
    let updatedColors = state.slice(0, (boardSize * boardSize * boardSize * 4));
    return updatedColors;
}

//takes a coordinate and returns a simple, boxy deformation (list of coords) centred there
function simpleDeform(deform_zyx, size){
    let deforms = [];
    for(let z = Math.max(deform_zyx[0] - size, 0); z < Math.min(deform_zyx[0] + size + 1, boardSize); z++){
        for(let y = Math.max(deform_zyx[1] - size, 0); y < Math.min(deform_zyx[1] + size + 1, boardSize); y++){
            for(let x = Math.max(deform_zyx[2] - size, 0); x < Math.min(deform_zyx[2] + size + 1, boardSize); x++){
                deforms.push([z,y,x]);
            }
        }
    }
    return deforms;
}


export async function updateState(deformSize, deformId=undefined, tumorId=undefined, setterFunc) {

    const currentVersion = versionCount;

    //if the user wants a perturbation, apply it before getting the new board state
    //I only trained on 4*4*4 perturbations.
    if(deformId){
        const deform_zyx = convertIndexToZYX(deformId);
        let deforms = simpleDeform(deform_zyx, deformSize);
        for(let i = 0; i < deforms.length; i ++){
            let deform_i = convertZYXToIndex(deforms[i]);
            for(let j = 0; j < ndim; j++){
                boardState.cpuData[deform_i + (j * boardSize * boardSize * boardSize)] = 0;
            }
        }
    }else if(tumorId){
        const tumor_zyx = convertIndexToZYX(tumorId);
        let deforms = simpleDeform(tumor_zyx, deformSize);
        for(let i = 0; i < deforms.length; i ++){
            //choose a random colour for each cube in our tumor
            let eachColour = coloursSet[Math.floor(Math.random() * coloursSet.length)];
            let deform_i = convertZYXToIndex(deforms[i]);
            boardState.cpuData[deform_i] = eachColour[0]; //r
            boardState.cpuData[deform_i + (1 * boardSize * boardSize * boardSize)] = eachColour[1];//G
            boardState.cpuData[deform_i + (2 * boardSize * boardSize * boardSize)] = eachColour[2];//b
            boardState.cpuData[deform_i + (3 * boardSize * boardSize * boardSize)] = 1;
        }
    }

    //run current state through model to get an update
    const feed = { input: boardState};
    let results = session.run(feed);

    //since inference is handled async, we don't return anything. instead tell the main loop there's a new update when we're done.
    results.then((res) => {
    if(currentVersion != versionCount){
        console.log(`ASYNCH MISMATCH!: we don't want your old promises!`);
        return
    }else{
        boardState = new ort.Tensor('float32', res.output.data, [1, ndim, boardSize, boardSize, boardSize]);
        let updatedColors = res.output.data.slice(0, (boardSize * boardSize * boardSize * 4));
        setterFunc(updatedColors);
    }
    });


}

