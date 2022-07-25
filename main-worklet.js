const button = document.createElement('button')
button.innerText = 'Play!'

button.onclick = function() {
    const audioContext = new AudioContext()
    console.log(window.isSecureContext)
    audioContext.audioWorklet.addModule('audio-processor.js').then(() => {
        const randomNoiseNode = new AudioWorkletNode(audioContext, 'audio-processor')
        randomNoiseNode.connect(audioContext.destination)
    })
}

document.body.appendChild(button)
