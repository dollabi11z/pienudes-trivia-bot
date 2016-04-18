'use strict';

var FS            = require('fs');
var AnswerChecker = require('./answer-checker');

var msg_no_active    = "There is no active question! Type !trivia to play, !skip to skip the question, or !stop to stop playing.";
var question_timeout = 5000;

function Trivia(questions) {
    var buffer = FS.readFileSync(questions);
    this.questions   = JSON.parse(buffer);
    this.q_length    = this.questions.length;
    this.current     = null;
    this.hint_length = 1;
    this.auto        = false;
}

Trivia.prototype.play = function(bot, auto) {
    if (this.current) {
        return bot.sendChatMsg("Round already started. Type !skip to skip the question.");
    }
    
    var index           = Math.floor(Math.random() * this.q_length);
    this.current        = this.questions[index];
    this.current.valid  = this.current.answer.replace(/\(.*\)/, "");
    this.hint_length    = 1;
    this.auto           = (auto == "auto" || auto == true) || false;
    
    var value = this.current.value || "$100";
    console.log(this.current);
    bot.sendChatMsg(
        "Category: [color #4888c9]" + this.current.category + "[/color]" +
        ". Value: [color #00FF00]" + value + "[/color]" +
        ". Answer with !a or !answer. Type !hint for a hint.[br]Question: " +
        this.current.question
    );
};

Trivia.prototype.stop = function() {
    this.current     = null;
    this.hint_length = 1;
    this.auto        = false;
};

Trivia.prototype.skip = function(bot) {
    if (this.current) {
        bot.sendChatMsg("The answer is " + this.current.answer);
        this.current = null;
        setTimeout(function() {
            this.play(bot, this.auto);
        }.bind(this), question_timeout);
    } else {
        bot.sendChatMsg(msg_no_active);
    }
};

Trivia.prototype.hint = function(bot) {
    var answer, hint;
    if (this.current) {
        answer = this.current.valid;
        hint   = answer.substr(0, this.hint_length) + answer.substr(this.hint_length, answer.length + this.hint_length).replace(/./g, ".");
        if (this.hint_length <= answer.length) {
            this.hint_length += 1;
        }
        
        bot.sendChatMsg(hint);
    } else {
        bot.sendChatMsg(msg_no_active);
    }
};

Trivia.prototype.score = function(bot, username, data) {
    data = data || username;
    var key  = "score:" + data.toLowerCase().trim();
    
    bot.redis.get(key, function(err, res) {
        if (err) {
            console.log(err);
            bot.sendChatMsg("Error getting the score. Try again in a minute.");
        } else {
            if (!res) {
                bot.sendChatMsg(data + " has no score yet!");
            } else {
                bot.sendChatMsg(data + " - $" + res);
            }
        }
    });
};

Trivia.prototype.answer = function(bot, username, guess) {
    if (!this.current) {
        return bot.sendChatMsg(msg_no_active);
    }
    
    var checkAnswer, checkGuess, value;
    checkGuess  = guess.toLowerCase();
    checkGuess  = checkGuess.replace(/&.{0,}?;/, "");
    checkGuess  = checkGuess.replace(/[\\'"\.,-\/#!$%\^&\*;:{}=\-_`~()\s]/g, "");
    checkAnswer = this.current.valid.toLowerCase().replace(/[\\'"\.,-\/#!$%\^&\*;:{}=\-_`~()\s]/g, "");
    checkAnswer = checkAnswer.replace(/^(a(n?)|the)/g, "");
    
    if (AnswerChecker(checkGuess, checkAnswer)) {
        value = this.current.value || "$100";
        bot.sendChatMsg("[color #00FF00]YOU ARE CORRECT![/color] The answer is " + this.current.answer + "! " + username + " wins " + value + "!");
        
        this.current     = null;
        this.hint_length = 1;
        username = username.toLowerCase();
        value    = value.replace(/[^0-9.-]+/g, "");
    
        var key  = "score:" + username.toLowerCase().trim();
        bot.redis.incrby(key, parseInt(value));
        
        if (this.auto) {
            setTimeout(function() {
                this.play(bot, true);
            }.bind(this), question_timeout);
        }
    } else {
        bot.sendChatMsg("[color #FF0000]" + guess + " is incorrect.[/color]");
    }
};

module.exports = Trivia;