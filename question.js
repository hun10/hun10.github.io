var Question = function() {
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    return {
        randomPerfectPitch: function(size) {
            var quest = [];
            for (var i = 0; i < size; i++) {
                quest[i] = getRandomInt(4 - 12, 4);
            }
            return quest;
        }
    };
}();
