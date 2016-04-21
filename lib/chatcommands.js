var api    = require("./apiclient");
var custom = require("./custom");
var Trivia = require('./trivia');

var trivia = new Trivia('pop_questions.json');

var chatHandlers = {
	
	"trivia": function(bot, username, data) {
		trivia.play(bot, data);
	},
	
	"skip": function(bot) {
	    trivia.skip(bot);
	},
	
	//"stop": function() {
	//    trivia.stop();
	//},
	
	"hint": function(bot) {
	    trivia.hint(bot);
	},
	
	"h": function(bot) {
		trivia.hint(bot);
	},
	
	"answer": function(bot, username, data) {
	    trivia.answer(bot, username, data);
	},
	
	"a": function(bot, username, data) {
        trivia.answer(bot, username, data);
	},
	
	"score": function(bot, username, data) {
	    trivia.score(bot, username, data);
	},
	
	"top": function(bot) {
	    trivia.top(bot);
	}
};

function handle(bot, username, msg, fromIRC) {
	var split = msg.split(" ");
	var command = String(split.splice(0, 1));
	command = command.substring(1, command.length);
	var rest = split.join(" ");

	if (command in chatHandlers)
		return chatHandlers[command](bot, username, rest, fromIRC);

	// Goto custom commands if we can't find one here
	return custom.handle(bot, username, msg, fromIRC);
}

exports.handle = handle;