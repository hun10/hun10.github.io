var Synth = function() {
    var sample = [];
    var sampleWaveLength = 100;
    for (var i = 0; i < 441000; i++) {
        if (i < sampleWaveLength) {
            sample[i] = 32000 * Math.random();
        } else {
            sample[i] = -0.4985 * (sample[i - sampleWaveLength] + sample[i - sampleWaveLength + 1]);
        }
    }

    function integrate(a, b) {
        var fa = Math.floor(a);
        var fb = Math.floor(b);
        var lv = sample[fa] * (a - fa);
        var uv = 0;
        for (var i = fa; i < fb; i++) {
            uv += sample[i];
        }
        uv += sample[fb] * (b - fb);
        return (uv - lv) / (b - a);
    }

    var audio = new Audio();
    var wave = new RIFFWAVE();

    wave.header.sampleRate = 44100;
    wave.header.numChannels = 1;
    wave.header.bitsPerSample = 16;

    function orchestra(semitone) {
        return 440 * Math.pow(2, semitone / 12);
    }

    function wavelength(frequency) {
        return wave.header.sampleRate / frequency;
    }

    function genTone(semitone) {
        var data = [];
        var vol = 32000;
        var lng = wavelength(orchestra(semitone)) / 2;
        var delta = sampleWaveLength / lng;
        data[0] = 0;
        for (var i = 1; i < wave.header.sampleRate; i++) {
            data[i] = integrate(i * delta, i * delta + delta);
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

    function genChord(seq) {
        var data = genTone(seq[0]);
        for (var i = 1; i < seq.length; i++) {
            var tmp = genTone(seq[i]);
            for (var j = 0; j < data.length; j++) {
                data[j] += tmp[j];
            }
        }
        for (var j = 0; j < data.length; j++) {
            data[j] /= seq.length;
        }
        return data;
    }

    return {
        play: function(seq) {
            wave.Make(genToneSeq(seq));
            audio.src = wave.dataURI;
            audio.play();
        },
        chord: function(seq) {
            wave.Make(genChord(seq));
            audio.src = wave.dataURI;
            audio.play();
        }
    };
}();
