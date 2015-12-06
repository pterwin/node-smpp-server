var Server = require('./lib/SmppServer.js');
var config = require('./config/config.js');
var server = new Server(config);
server.start();

