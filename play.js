var Synth = function() {
    var audio = new Audio();
    var wave = new RIFFWAVE();

    wave.header.sampleRate = 44100;
    wave.header.numChannels = 1;
    wave.header.bitsPerSample = 16;

    function w(semitone) {
        return Math.PI * 2 * 440 * Math.pow(2, semitone / 12) / 44100;
    }

    function genTone(semitone) {
        var data = [];
        var freq = w(semitone);
        for (var i = 0; i < wave.header.sampleRate / 4; i++) {
            data[i] = Math.round(32000 * Math.sin(freq * i));
        }
        return data;
    }

    function genToneSeq(seq) {
        var data = [];
        for (var i = 0; i < seq.length; i++) {
            data.push.apply(data, genTone(seq[i]));
        }
        return data;
    }

    return {
        play: function(seq) {
            wave.Make(genToneSeq(seq));
            audio.src = wave.dataURI;
            audio.play();
        }
    };
}();

function Play() {
    Synth.play([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}
