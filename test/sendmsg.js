var config       = require('../config/config');
var AmqpMessage  = require('rabbit-driver').AmqpMessage;
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var process = require('process');

var channel = process.argv[2];
var message = process.argv[3];

var driver = new RabbitDriver(config, {name: channel}, false);
driver.init().then(function() {
    console.log('sender initialized');
    var msg = new AmqpMessage('mo', {
        message_payload    : message,
        source_network_type: 1,
        dest_network_type  : 1,
    });
    console.log('message sent');
    driver.publish(msg);
});
