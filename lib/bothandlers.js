// Adds the socket listeners
var addHandlers = function(bot) {
	// Socket handlers
	bot.socket.on("addUser", function(data) {
		bot.handleAddUser(data)
	})

	bot.socket.on("chatMsg", function(data) {
		bot.handleChatMsg(data)
	})

	bot.socket.on("disconnect", function() {
		setTimeout(function() {
			process.exit(0)
		}, 10000)
	})

	bot.socket.on("error", function(err) {
		bot.logger.errlog.log(err)
	})

	bot.socket.on("login", function(data) {
		bot.handleLogin(data)
	})

	bot.socket.on("needPassword", function(data) {
		bot.handleNeedPassword(data)
	})

	bot.socket.on("usercount", function(data) {
		bot.storeUsercount(data)
	})

	bot.socket.on("userLeave", function(data) {
		bot.handleUserLeave(data["name"])
	})

	bot.socket.on("userlist", function(data) {
		bot.handleUserlist(data)
	})
}

exports.addHandlers = addHandlers
