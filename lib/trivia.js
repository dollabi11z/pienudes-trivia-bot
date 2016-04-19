'use strict';

var FS             = require('fs');
var AnswerChecker  = require('./answer-checker');
var format         = require('d3-format');
var commaFormatter = format.format(',');
var striptags      = require('striptags');

var question_timeout = 15000;
var timeout          = 180000;
var skip_wait        = 10000;

function Trivia(questions) {
    var buffer = FS.readFileSync(questions);
    this.questions   = JSON.parse(buffer);
    this.q_length    = this.questions.length;
    this.current     = null;
    this.hint_index = 1;
    this.auto        = false;
    this.timer       = null;
    this.timerp      = null;
    this.start       = 0;
}

Trivia.prototype.play = function(bot, auto) {
    if (this.current) {
        return bot.sendChatMsg("Round already started. Type !skip to skip the question.");
    }
    
    var index           = Math.floor(Math.random() * this.q_length);
    this.current        = this.questions[index];
    if (this.current.answer[0] == '"') {
        this.current.answer = this.current.answer.substring(1, this.current.answer.length - 1);
    }
    
    this.current.valid  = this.current.answer.replace(/\(.*\)/, "");
    this.start          = Date.now();
    this.auto           = (auto == "auto" || auto == true) || false;
    if (this.current.valid.substring(0, 4).toLowerCase() == "the ") {
        this.hint_index = 5;
    } else if (this.current.valid.substring(0, 2) == "a ") {
        this.hint_index = 3;
    } else {
        this.hint_index = 1;
    }
    
    this.timer = setTimeout(function() {
        bot.sendChatMsg("Times up! The answer is " + this.current.answer);
        if (this.auto) {
            this.timerp = setTimeout(function() {
                this.play(bot, true);
            }.bind(this), question_timeout);
        }
        this.stop();
    }.bind(this), timeout);
    
    var value           = this.current.value || "$100";
    this.current.points = parseInt(value.replace(/[^0-9.-]+/g, ""));
    this.hint_deduct    = Math.floor(this.current.points / this.current.valid.length);
    
    console.log(this.current);
    bot.sendChatMsg(
        "Category: [color #4888c9]" + this.current.category + "[/color]" +
        ". Value: [color #00FF00]" + value + "[/color]" +
        ". Answer with !a, !h for a hint, or !stop to stop the game.[br]Question: " +
        striptags(this.current.question)
    );
};

Trivia.prototype.stop = function(auto) {
    this.current     = null;
    this.hint_index = 1;
    this.auto        = auto || false;
    this.start       = 0;
    if (this.timer) {
        clearTimeout(this.timer);
    }
    if (this.timerp) {
        clearTimeout(this.timerp);
    }
};

Trivia.prototype.skip = function(bot) {
    if (this.current) {
        var diff = Date.now() - this.start;
        if (diff < skip_wait) {
            return bot.sendChatMsg("To soon to skip. Wait another " + Math.floor((skip_wait / 1000) - (diff / 1000)) + " seconds.");
        }
        
        bot.sendChatMsg("The answer is " + this.current.answer);
        this.stop(this.auto);
        this.timerp = setTimeout(function() {
            this.play(bot, this.auto);
        }.bind(this), question_timeout);
    }
};

Trivia.prototype.hint = function(bot) {
    if (this.current) {
        var answer = this.current.valid;
        var hint   = answer.substr(0, this.hint_index) + answer.substr(this.hint_index, answer.length + this.hint_index).replace(/./g, ".");
        if (this.hint_index <= answer.length) {
            this.hint_index += 1;
            this.current.points -= this.hint_deduct;
            if (this.current.points < 0) {
                this.current.points = 0;
            }
        }
        
        bot.sendChatMsg("Question is now worth [color #00FF00]$" + this.current.points + "[/color][br]Hint: " + hint);
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
                bot.sendChatMsg(data + " - [color #00FF00]$" + commaFormatter(res) + "[/color]");
            }
        }
    });
};

Trivia.prototype.top = function(bot) {
    bot.redis.keys("score:*", function(err, keys) {
        if (err) {
            console.log(err);
            bot.sendChatMsg("Error getting the scores. Try again in a minute.");
        } else {
            bot.redis.mget(keys, function(err, res) {
                if (err) {
                    console.log(err);
                    bot.sendChatMsg("Error getting the scores. Try again in a minute.");
                } else {
                    var scores = [];
                    for(var i = 0; i < keys.length; i++) {
                        scores.push({
                            name: keys[i].replace("score:", ""),
                            value: parseInt(res[i])
                        });
                        
                    }
                    scores.sort(sortScores);
                    scores = scores.slice(0, 5);
                    
                    var msg = [];
                    for(var y = 0; y < scores.length; y++) {
                        msg.push(scores[y].name + " - [color #00FF00]$" + commaFormatter(scores[y].value) + "[/color]")
                    }
                    bot.sendChatMsg(msg.join(", "));
                }
            });
        }
    });
};

Trivia.prototype.answer = function(bot, username, guess) {
    if (!this.current) {
        return;
    }
    
    var check_guess  = guess.toLowerCase();
    check_guess      = check_guess.replace(/&.{0,}?;/, "");
    check_guess      = check_guess.replace(/[\\'"\.,-\/#!$%\^&\*;:{}=\-_`~()\s]/g, "");
    var check_answer = this.current.valid.toLowerCase().replace(/[\\'"\.,-\/#!$%\^&\*;:{}=\-_`~()\s]/g, "");
    check_answer     = check_answer.replace(/^(a(n?)|the)/g, "");
    
    if (AnswerChecker(check_guess, check_answer)) {
        bot.sendChatMsg("[color #00FF00]YOU ARE CORRECT![/color] The answer is " + this.current.answer + "! " + username + " wins $" + this.current.points + "!");
        
        if (this.current.points > 0) {
            username = username.toLowerCase();
            var key  = "score:" + username.toLowerCase().trim();
            bot.redis.incrby(key, this.current.points);
        }
        
        this.stop(this.auto);
        if (this.auto) {
            this.timerp = setTimeout(function() {
                this.play(bot, true);
            }.bind(this), question_timeout);
        }
    } else {
        bot.sendChatMsg("[color #FF0000]" + guess + " is incorrect.[/color]");
    }
};

function sortScores(a,b) {
    if (a.value > b.value)
        return -1;
    else if (a.value < b.value)
        return 1;
    else
        return 0;
}

module.exports = Trivia;