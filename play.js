var Synth = function() {
    var audio = new Audio();
    var wave = new RIFFWAVE();

    wave.header.sampleRate = 44100;
    wave.header.numChannels = 1;
    wave.header.bitsPerSample = 16;

    function orchestra(semitone) {
        return 440 * Math.pow(2, semitone / 12);
    }

    function wavelength(frequency) {
        return Math.round(wave.header.sampleRate / frequency);
    }

    function genTone(semitone) {
        var data = [];
        var vol = 32000;
        var lng = wavelength(orchestra(semitone) * 2);
        for (var i = 0; i < lng; i++) {
            data[i] = Math.round(vol * Math.random());
        }
        for (var i = lng; i < wave.header.sampleRate; i++) {
            data[i] = -(data[i - lng] + data[i - lng + 1]) * 0.4985;
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
