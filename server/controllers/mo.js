var logger       = new (require('logger'))('smpp-http-api');
var AmqpMessage  = require('rabbit-driver').AmqpMessage;
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;


(function() {
    var SendSMS = function(config, server) {
        var self = this;
        self.channels = {};


        self.initChannel = function(name, driver) {
            driver.init().then(function() {
                logger.info('Initialized mo queue', name);
            });
        };

        for(var i in config.server.clients) {
            var chan = config.server.clients[i].system_id.toLowerCase();
            self.channels[chan] = {
                driver: new RabbitDriver(config, {name: chan}, false)
            };
        }

        for(var j in self.channels) {
            self.initChannel(j, self.channels[j].driver);
        }

        var required_params = ['from', 'to', 'message'];

        server.route({
            method: 'GET',
            path:'/sms/mo?',
            handler: function (request, reply) {
                var params = request.query;
                logger.info('got message', params);

                var channel          = params.channel.toLowerCase();
                var message          = params.message;
                var destination_addr = params.to;
                var source_addr      = source_addr;

                for(var i in required_params) {
                    if(!params[required_params[i]]) {
                            return reply("Missing parameter: " + required_params[i]);
                    }
                }

                var defaults = {
                    source_addr_ton    : 1,
                    source_addr_npi    : 1,
                    dest_addr_ton      : 5,
                    dest_addr_npi      : 0,
                    source_network_type: 1,
                    dest_network_type  : 1,
                };

                var job = {};
                for(var j in defaults) {
                    job[j] = defaults[j];
                }

                job.source_addr      = params.from;
                job.destination_addr = params.to;
                job.message_payload  = message;

                var msg = new AmqpMessage('mo', job);

                if(self.channels[channel]) {
                    var driver = self.channels[channel].driver || false;
                    driver.publish(msg);
                    reply('message queued');
                } else {
                    logger.warn('channel', channel, 'not found');
                    reply('channel not found');
                }
            }
        });
    };
    module.exports = SendSMS;
})();
