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

    /**
     * Randomize array element order in-place.
     * Using Fisher-Yates shuffle algorithm.
     */
    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }

    return {
        randomPerfectPitch: function(size) {
            var quest = [];

            var notes = [];
            for (var i = -9; i < 3; i++) {
                notes.push(i);
            }
            shuffleArray(notes);

            for (var i = 0; i < size; i++) {
                var pitch = notes[i];
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
