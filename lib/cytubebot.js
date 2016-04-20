var api = require("./apiclient")
var commands = require("./chatcommands")
var Database = require("./database")
var fs = require("fs")
var botHandlers = require("./bothandlers")
var logger = require("./logger")
var perms = require("./permissions")
var utils = require("./utils")
var redis = require("redis")

module.exports = {
	init: function(cfg) {
		logger.syslog.log("Setting up bot")
		var bot = new CytubeBot(cfg)
		return bot
	}
};

// Constructor
function CytubeBot(config) {
	var bot = this

	// Begin config things

	// Cytube user info
	this.cytubeServer = config["cytubeServer"]
	this.flair = config["usemodflair"]
	this.pw = config["pw"]
	this.room = config["room"]
	this.roomPassword = config["roompassword"]
	this.username = config["username"]

	// Logging
	this.useLogger = config["enableLogging"]
	this.logger = logger
	if (!this.useLogger)
		this.turnOffLogging()
	// End config things

	// Channel data
	this.userlist = []

	// Bot data
	this.socket = this.getSocketURL(this.cytubeServer)
	this.startTime = new Date().getTime()
	this.db = Database.init(this.logger, this.maxVideoLength)
	this.loggedIn = false
	this.waitingFunctions = []
	this.stats = {
		"managing": false,
		"muted": false,
		"hybridMods": {},
		"userLimit": false,
		"userLimitNum": 10,
		"disallow": []
	}

	this.readPersistentSettings(function(err) {
		if (err)
			bot.writePersistentSettings()

		bot.updatePersistentSettings()
	})

	// Add handlers
	if (this.socket)
		botHandlers.addHandlers(this)
		
	this.redis = redis.createClient(config["redis"]);
};

// Checks if the user has a given permission
// Returns true or false depending if they have that perm
// username - The user we're looking up
// rank - The rank the user should have
// permission - The permission to look up
// callback - The callback function
CytubeBot.prototype.checkPermission = function(username, rank, permission, callback) {
	var permData = {
		username: username,
		rank: rank,
		permission: permission,
		callback: callback
	}

	perms.handle(this, "checkPermission", permData)
};

// Used by various methods
// Sends a delete frame to the server
// uid - The uid of the video to delete
CytubeBot.prototype.deleteVideo = function(uid) {
	if (typeof uid !== "undefined") {
		this.logger.cytubelog.log("!~~~! Sending delete frame for uid: " + uid)
		this.socket.emit("delete", uid)
	}
};

// Gets the Cytube socketIO port
// server - The input from config.json
CytubeBot.prototype.getSocketURL = function(server) {
	var bot = this
	var defaultReg = /(https?:\/\/)?(.*:\d*)/

	if (server.match(defaultReg)) {
		this.logger.syslog.log("!~~~! Found socketIO info in config")
		return require('socket.io-client')(server)
	} else {
		this.logger.syslog.log("!~~~! Looking up socketIO info from server")
		api.APICall(server, "socketlookup", null, function(data) {
			if (data.match(defaultReg)) {
				bot.socket = require('socket.io-client')(data)
				botHandlers.addHandlers(bot)
				bot.start()
			}
		})
	}
	return
};

// Handles addUser frames from the server
// data - addUser data
CytubeBot.prototype.handleAddUser = function(data) {
	var inList = utils.handle(this, "userInUserlist", data["name"])
	if (!inList) {
		this.userlist.push(data)
		this.logger.syslog.log("!~~~! Added User: " + data["name"])
		this.logger.syslog.log("!~~~! Userlist has : " + this.userlist.length + " users")
	}
};

// Handles chatMsg frames from the server
// If the first character of the msg is $, we interpet it as a command.
// We ignore chat from before the bot was started, in order to avoid old
// commands.
CytubeBot.prototype.handleChatMsg = function(data, pm) {
	var bot = this
	var username = data["username"]
	var msg = data["msg"]
	var time = data["time"]

	this.logger.cytubelog.log("!~~~! Chat Message: " + username + ": " + msg)

	var allowed = function() {
		if (bot.stats["disallow"].lastIndexOf(username) === -1)
			return true
		else {
			bot.sendPM(username, "You're not allowed to use the bot")
			return false
		}
	}

	// Ignore server messages
	if (username === "[server]")
		return

	// Filter the message
	msg = utils.handle(this, "filterMsg", msg)
	if (!msg)
		return

	if (this.useIRC && this.loggedIn && msg.indexOf("(") !== 0 && !pm)
		this.irc.sendMessage("(" + username + "): " + msg)

	// Try to avoid old commands from playback
	if (time < this.startTime)
		return

	var handleCommand = msg.indexOf("!") === 0 &&
		username.toLowerCase() !== this.username.toLowerCase() &&
		this.loggedIn &&
		allowed()

	if (handleCommand)
		return commands.handle(this, username, msg)
};

// Used by $permissions
// Handles a change in hybridMods or calls sendHybridModPermissions if no permission
// is given.
// permission - The permission we are changing, or undefined if there is none
// name - name of the user we want to change permissions for, or look up
CytubeBot.prototype.handleHybridModPermissionChange = function(permission, name) {
	var permData = {
		permission: permission,
		name: name
	}

	perms.handle(this, "handleHybridModPermissionChange", permData)
};

// Handles login frame from the server
// data - The login data
CytubeBot.prototype.handleLogin = function(data) {
	var bot = this
	if (!data["success"])
		return this.logger.syslog.log("!~~~! Failed to login")

	// Be sure we have the correct capitalization
	// Some cytube functions require proper capitalization
	this.username = data["name"]

	this.socket.emit("requestPlaylist")

	// Start the connection to the IRC server
	if (this.useIRC)
		this.irc.start()

	this.logger.syslog.log("!~~~! Now handling commands")
	this.loggedIn = true
	this.readTimes(function(data) {
		//bot.sendChatMsg("Now handling commands\nTimes restarted: " + data)
	})
};

// Handles needPassword frames from the server
// needPasswords are sent when the room we are trying to join has a password
CytubeBot.prototype.handleNeedPassword = function() {
	if (this.roomPassword) {
		this.logger.cytube.log("!~~~! Room has password; sending password")
		this.socket.emit("channelPassword", this.roomPassword)
		this.roomPassword = null
	} else {
		this.logger.cytubelog.log("\n!~~~! No room password in config.json or password is wrong. Killing bot!\n")
		process.exit(1)
	}
};


// Reads the persistent settings or has the callback write the defaults
// callback - callback function, used to write the persistent settings
// if they don't exist
CytubeBot.prototype.readPersistentSettings = function(callback) {
	var bot = this
	fs.readFile("persistent.json", function(err, data) {
		if (err) {
			return callback(true)
		} else {
			bot.stats = JSON.parse(data)
			bot.logger.syslog.log("!~~~! Read persistent settings")
			callback(false)
		}
	})
};

// Reads the number of times the bot has been restarted
// callback - The callback function
CytubeBot.prototype.readTimes = function(callback) {
	fs.readFile("times", function(err, data) {
		if (err) {
			return callback("Error reading times")
		} else {
			callback(data)
		}
	})
};

// Sends a chatMsg frame to the server
// If we are using modflair it will try and send meta for it
// message - message to be sent
CytubeBot.prototype.sendChatMsg = function(message, override) {
	// Rank is used to send the modflair
	var rank = 0

	// If we're muted or not done initializing, there's no point in continuing
	if ((this.stats["muted"] && !override) || !this.loggedIn)
		return

	this.logger.cytubelog.log("!~~~! Sending chatMsg: " + message)
	rank = utils.handle(this, "getUser", this.username.toLowerCase())
	if (typeof rank !== "undefined")
		rank = rank["rank"]

	if (!this.flair)
		this.socket.emit("chatMsg", {
			msg: message,
			meta: {}
		})
	else {
		this.socket.emit("chatMsg", {
			msg: message,
			meta: {
				"modflair": rank
			}
		})
	}
};

// Sends the hybridmod permissions for name
// name - name to send hybridmod permissions for
CytubeBot.prototype.sendHybridModPermissions = function(name) {
	if (name)
		this.sendChatMsg(name + ": " + this.stats["hybridMods"][name])
};

// Used by $shuffle
// Emits a shufflePlaylist frame
CytubeBot.prototype.shufflePlaylist = function() {
	this.socket.emit("shufflePlaylist")
};

// Used to start the process of joining a channel
// Called after we have initialized the bot and set socket listeners
CytubeBot.prototype.start = function() {
	var bot = this

	this.logger.syslog.log("Starting bot")
	this.socket.emit("initChannelCallbacks")
	this.socket.emit("joinChannel", {
		name: this.room
	})
	this.socket.emit("login", {
		name: this.username,
		pw: this.pw
	})
};

// Turns off log writing
CytubeBot.prototype.turnOffLogging = function() {
	this.logger.errlog.enabled = false
	this.logger.cytubelog.enabled = false
	this.logger.syslog.enabled = false
	this.logger.errlog.close()
	this.logger.cytubelog.close()
	this.logger.syslog.close()
};

// Updates the persistent settings
CytubeBot.prototype.updatePersistentSettings = function() {
	var changed = false
	if (!this.stats["hybridMods"]) {
		changed = true
		this.stats["hybridMods"] = {}
	}
	if (typeof this.stats["userLimit"] === "undefined") {
		changed = true
		this.stats["userLimit"] = false
		this.stats["userLimitNum"] = 10
	}
	if (typeof this.stats["disallow"] === "undefined") {
		changed = true
		this.stats["disallow"] = {}
	}

	if (Object.prototype.toString.call(this.stats["disallow"]) === "[object Object]") {
		var tempDisallow = []
		for (var key in this.stats["disallow"]) {
			if (this.stats["disallow"].hasOwnProperty(key)) {
				tempDisallow.push(key)
			}
		}
		this.stats["disallow"] = tempDisallow
		changed = true
	}

	if (changed)
		this.writePersistentSettings()
};

// Writes the persistent settings
// Used by various methods
CytubeBot.prototype.writePersistentSettings = function() {
	var bot = this
	this.logger.syslog.log("!~~~! Writing persistent settings")
	var stringyJSON = JSON.stringify(this.stats)
	fs.writeFile("persistent.json", stringyJSON, function(err) {
		if (err) {
			bot.logger.errlog.log(err)
			process.exit(1)
		}
	})
};
