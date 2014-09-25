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
        for (var i = 0; i < wave.header.sampleRate / 3; i++) {
            data[i] = Math.round(32000 * (Math.sin(freq * i)
                                  + 0.25 * Math.sin(freq * 2 * i)
                                  + 0.5 * Math.sin(freq * 3 * i)) / 1.75);
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
