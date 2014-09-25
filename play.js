function Play() {

var audio = new Audio(); // create the HTML5 audio element
var wave = new RIFFWAVE(); // create an empty wave file
var data = []; // yes, it's an array

wave.header.sampleRate = 44100; // set sample rate to 44KHz
wave.header.numChannels = 1;
wave.header.bitsPerSample = 16;

var i = 0;
var freq = Math.PI * 2 * 440 / 44100;
while (i<100000) { 
  data[i++] = Math.round(12007*Math.sin(freq * i));
}

wave.Make(data); // make the wave file
audio.src = wave.dataURI; // set audio source
audio.play(); // we should hear two tones one on each speaker
}
