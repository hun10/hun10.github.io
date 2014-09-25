var Question = function() {
    var letters = [
        ['A'],
        ['A#', 'Bb'],
        ['B'],
        ['C'],
        ['C#', 'Db'],
        ['D'],
        ['D#', 'Eb'],
        ['E'],
        ['F'],
        ['F#', 'Gb'],
        ['G'],
        ['G#', 'Ab']
    ];

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    return {
        randomPerfectPitch: function(size) {
            var quest = [];
            for (var i = 0; i < size; i++) {
                var pitch = getRandomInt(4 - 24, 4 + 12);
                var normalized = ((pitch % 12) + 12) % 12;
                quest[i] = {
                    pitch: pitch,
                    letters: letters[normalized],
                    play: function() {
                        Synth.play([this.pitch]);
                    },
                    check: function(lit) {
                        for (var j = 0; j < this.letters.length; j++) {
                            if (lit == this.letters[j]) return true;
                        }
                        return false;
                    }
                };
            }
            return quest;
        }
    };
}();
