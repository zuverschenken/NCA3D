Simple flask app for viewing/interacting with neural cellular automatas.

Represents a 3D grid/NCA as a instanced mesh in THREE js for efficient rendering. Inference is performed asynchronously so as to avoid blocking main thread. Unfortunately some of the instructions from my pytorch implementation are not supported for WebGPU/WebGL by ORT, so inference is performed on CPU using WASM.

[here](https://www.kaggle.com/code/maxbr0wn/3d-neural-cellular-automata/edit) is a kaggle notebook showing you how to train your own NCAs.
