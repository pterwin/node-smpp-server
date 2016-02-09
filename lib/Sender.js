var util         = require('util');
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var Logger       = require('logger');
var logger       = new Logger('http-sender');
var request      = require('request');
var util         = require('util');
var SMSStore     = require('./SmsStore').mongo;

require('request-debug')(request);


(function() {
    "use strict";

    var SenderHTTP = function(config) {
        var self = this;
        self.mt_channel = config.server.mt_channel;
        self.resend_delay = config.server.resend_delay;
        self.mt_queue_length = config.server.mt_queue_length;
        self.mt_queue = new RabbitDriver(config, {name: config.server.mt_channel, client: {prefetch: self.mt_queue_length}}, true);
        self.dlr_queue = new RabbitDriver(config, {name: config.server.dlr_channel}, false);
        self.store = new SMSStore(config);

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
            self.send_mt(sms.body).then(function(status) {
                logger.info('msg acked by smsc', status);
                self.store.updateForeignId(sms.body, '1211212');
                sock.ack();
            }).catch(function(err) {

                //@todo, handle specific errors
                // eg. api rejected transactions should not be requeued but
                // http connection issues should be

                logger.warn("could not send, requeueing", err.message, err.stack);
                setTimeout(function() {
                    sock.requeue();
                }, self.resend_delay);
            });
        };

        self.prep_mt = function(message) {

        };

        self.send_mt = function(sms) {
            return new Promise(function(resolve, reject) {

                var config = self.get_client_config(sms.channel);
                if(config === false) {
                    reject(new Error("unable to get resolve client"));
                }

                var http_config = config.smsc.http;
                var query_params = {};

                logger.info('trying to send', sms.id);

                for(var i in http_config.mapping) {
                    var value = sms[i];
                    if(value && value.type && value.type === 'Buffer') {
                        value = escape(sms[i].data);
                    }
                    query_params[http_config.mapping[i]] = value;
                }

                var params = {
                    method: 'GET',
                    form  : query_params,
                    qs    : query_params,
                    uri   : http_config.url
                };

                var response_ok = new RegExp(http_config.response_ok || '.*');
                request(params, function(error, resp, body) {
                    if(error) {
                        return reject(error);
                    }

                    if(response_ok.test(body) === true) {
                        resolve(body);
                    } else {
                        reject(new Error("SMSC REJECTED"));
                    }
                });

            });
        };

        self.startWorker = function() {
            self.mt_queue.init().then(function(ctx) {
                logger.info('initialized mt consumer');
                self.mt_queue.on('data', self.handle_mt);
            }).catch(function(err) {
                logger.error('error starting mt queue', err, err.stack);
            });
        };
    };

    module.exports = {
        http: SenderHTTP
    };
})();
