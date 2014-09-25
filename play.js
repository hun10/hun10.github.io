function Play() {

var audio = new Audio(); // create the HTML5 audio element
var wave = new RIFFWAVE(); // create an empty wave file
var data = []; // yes, it's an array

wave.header.sampleRate = 44100; // set sample rate to 44KHz
wave.header.numChannels = 2; // two channels (stereo)

var i = 0;
while (i<100000) { 
  data[i++] = 128+Math.round(127*Math.sin(i/10)); // left speaker
  data[i++] = 128+Math.round(127*Math.sin(i/200)); // right speaker
}

wave.Make(data); // make the wave file
audio.src = wave.dataURI; // set audio source
audio.play(); // we should hear two tones one on each speaker
}
