var logger       = new (require('logger'))('smpp-http-api');
var AmqpMessage  = require('rabbit-driver').AmqpMessage;
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var iconv   = require('iconv-lite');
var detect_message_coding = require('../../lib/Sms').detect_message_coding;
//var uuid = require('uuid');


(function() {
    var SendSMS = function(config, server) {
        var self = this;

        self.channel  = 'node-smpp-server-mo';
        var driver = new RabbitDriver(config, {name: self.channel}, false);

        self.initChannel = function(name, driver) {
            driver.init().then(function() {
                logger.info('initialized rabbit queue', name);
            });
        };

        self.initChannel(self.channel, driver);

        var required_params = ['from', 'to', 'message', 'channel'];

        server.route({
            method: 'GET',
            path:'/sms/test',
            handler: function(request, reply) {
                var params = request.query;                
                var message = unescape(params.message);

                console.log('message recieved from test', message);
                //logger.info('encoding of incoming message', detect_message_coding());
                //logger.info('message received', iconv.decode(message, params.charset).toString());
                reply(params);
            }
        });

        server.route({
            method: 'GET',
            path:'/sms/mo',
            handler: function (request, reply) {
                var params = request.query;
                logger.info('got message', params);

                var channel          = params.channel.toLowerCase();
                var message          = params.message;
                var destination_addr = params.to;
                var source_addr      = params.from;

                for(var i in required_params) {
                    if(!params[required_params[i]]) {
                            return reply("Missing parameter: " + required_params[i]);
                    }
                }

                var sms     = {};
                sms.channel = channel;
                sms.from    = source_addr;
                sms.to      = destination_addr;
                sms.message = message;

                var msg = new AmqpMessage('mo', sms);
                driver.publish(msg);
                logger.info('mo queued', channel, source_addr, destination_addr, message);
                reply('message queued');
            }
        });
    };
    module.exports = SendSMS;
})();
