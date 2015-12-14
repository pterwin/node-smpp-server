var Client = require('../lib/SmppClient.js');
var config = require('../config/config.js');


var client = new Client();
client.addSession('localhost', 10070, 'YOUR_SYSTEM_ID', 'YOUR_PASSWORD' );
