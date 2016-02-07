var util         = require('util');
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var Logger       = require('logger');
var logger       = new Logger('http-sender');
var qs           = require('querystring');
(function() {
    "use strict";

    var SenderHTTP = function(config) {
        var self = this;
        self.mt_channel = config.server.mt_channel;
        self.mt_queue_length = config.server.mt_queue_length;
        self.mt_queue = new RabbitDriver(config, {name: config.server.mt_channel, client: {prefetch: self.mt_queue_length}}, true);

        logger.info('initializing mt queue for consumer', self.mt_queue_length);


        self.get_client_config = function (system_id) {
            for(var i in config.server.clients) {
                if(config.server.clients[i].system_id === system_id) {
                    return config.server.clients[i];
                }
            }
            return false;
        };

        self.handle_mt = function(sms, sock) {
            var channel = sms.body.channel || false;
            logger.info('got mt for sending', sms.body);
            if(channel === false) {
                logger.warn("cannot send, no channel info");
                return false;
            }
            self.send_mt(sms.body);
            sock.ack();


        };

        self.prep_mt = function(message) {

        };

        self.send_mt = function(sms) {
            var config = self.get_client_config(sms.channel);
            if(config === false) {
                return false;
            }

            var http_config = config.smsc.http;
            var query_params = {};

            logger.info('trying to send', sms);

            for(var i in http_config.mapping) {
                query_params[http_config.mapping[i]] = sms[i].type === 'Buffer'?  escape(sms[i].data) : sms[i];
            }

            var query_str = qs.stringify(query_params);
            logger.info('sending', query_str);
        };

        self.startWorker = function() {
            self.mt_queue.init().then(function() {
                logger.info('initialized mt consumer');
                self.mt_queue.on('data', self.handle_mt);
            });
        };
    };

    module.exports = {
        http: SenderHTTP
    };
})();
