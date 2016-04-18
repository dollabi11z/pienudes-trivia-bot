var FuzzySet, goodConfidence, keymax, pseudoPowerSet;

FuzzySet = require('fuzzyset.js');

goodConfidence = 0.65;

module.exports = function(guess, answer) {
    var result;
    result = keymax(pseudoPowerSet(guess.split(' ')), function(element) {
        var match;
        match = FuzzySet([answer]).get(element);
        if (match === null) {
            return 0;
        } else {
            return match[0][0];
        }
    });
    return result.maxScore >= goodConfidence;
};

keymax = function(set, keyfunc) {
    var element, idx, maxElement, maxScore, score;
    maxElement = null;
    maxScore = 0;
    for (idx in set) {
        element = set[idx];
        score = keyfunc(element);
        if (score > maxScore) {
            maxElement = element;
            maxScore = score;
        }
    }
    return {
        maxElement: maxElement,
        maxScore: maxScore
    };
};

pseudoPowerSet = function(words) {
    var len, set, start;
    set = [];
    len = 1;
    while (len <= words.length) {
        start = 0;
        while (start <= words.length - len) {
            set.push(words.slice(start, start + len).join(' '));
            start++;
        }
        len++;
    }
    return set;
};
