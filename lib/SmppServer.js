var smpp         = require('smpp');
var Logger       = require('logger');
var logger       = new Logger('smpp-server');
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var AmqpMessage  = require('rabbit-driver').AmqpMessage;
var Promise      = require('bluebird');
var errors       = smpp.errors;
var moment       = require('moment');
var pduUtils     = require('./PduUtils');
var uuid         = require('uuid');
var hexy         = require('hexy');
var Sms          = require('./Sms').sms;
var SMSStore     = require('./SmsStore').mongo;
//require('longjohn');

var errors = {
<<<<<<< HEAD
    NOACTIVESESSION    : 1,
=======
    NOACTIVESESSION     : 1,
>>>>>>> release-0.2
    WAITTIMEOUTEXCEEDED : 2
};

var bind_type = {
    trx: 'trx',
    tx : 'tx',
    rx : 'rx'
};



(function() {


    var clients        = [];
    var server_session = null;

<<<<<<< HEAD
    var SmtpClientHandler = function(config, system_id) {
        var self         = this;
        self.sessions    = [];
        logger.info('system_id', system_id);
        self.amqp        = new RabbitDriver(config, {name: system_id.toLowerCase(), client: {prefetch: 10}}, true);
        self.resendDelay = 10000;
        self.waitTimeout = 10000;

        for(var i=0; i<config.server.clients.length; i++) {
            var client = config.server.clients[i];
            if(client.system_id === system_id) {
                self.system_id    = client.system_id;
                self.password     = client.password;
                self.max_sessions = client.max_sessions;
=======

    var error_str = function(err) {
        for(var i in errors) {
            if(errors[i] == err) {
                return i;
>>>>>>> release-0.2
            }
        }
    };


    var log_pdu = function(session, pdu) {
        // var str = hexy.hexy(pdu.toBuffer());
        // var splits = str.split("\n");
        // for(var i in splits) {
        //     logger.info(session.session_id, splits[i]);
        // }
    };

<<<<<<< HEAD
        self.amqp.on('data', function(data, socket) {
            logger.info('sending mo', data.body);
            self.deliver_sm(data.body).then(function() {
                logger.info('sent message');
                socket.ack();
            }).catch(function(err) {
                logger.warn('Unable to send message', err.message, err.stack);
                if(err.message == errors.NOACTIVESESSION || err.message == errors.WAITTIMEOUTEXCEEDED) {
                    // resend after x seconds
                    logger.warn('resending after', self.resendDelay/1000, 'seconds');
                    setTimeout(function() {
                        socket.requeue();
                    }, self.resendDelay);
                } else {
                    socket.ack();
                }
            }).finally(function() {
=======
>>>>>>> release-0.2

    var SmtpClientHandler = function(config, session, options) {
        var self           = this;
        self.server_config = config.server;
        self.client_config = {};
        self.session       = session;
        self.last_activity = moment();
        self.resend_delay  = config.server.resend_delay || 10000;
        self.wait_timeout  = config.server.wait_timeout || 10000;

        self.mt_queue = options.mt_queue? options.mt_queue: null;
        // sms storage
        self.store = options.store? options.store : null;

        session.on('close', function() {
            logger.warn(self.system_id, self.session.session_id, 'session closed');
            self.close();
        });

        session.on('error', function(err) {
            logger.warn(self.system_id, self.session.session_id, 'session error', err.message, err.stack);
        });

        self.auth = function(pdu) {
            for(var i=0; i<self.server_config.clients.length; i++) {
                var client = self.server_config.clients[i];
                if(pdu.system_id == client.system_id && pdu.password == client.password) {
                    return i;
                }
            }
            return -1;
        };

        self.command_handlers = {};
        self.command_handlers.bind = function(type, pdu) {
            self.session.pause();

            self.system_id   = pdu.system_id;
            self.system_type = pdu.system_type || 'dev';
            self.bind_type   = bind_type[type];
            var idx          = self.auth(pdu);

            if(idx >= 0) {
                logger.info(self.system_id, session.session_id, 'authenticated');
                self.client_config = self.server_config.clients[idx];
                self.authenticated = true;

                // if(status === false) {
                //     logger.warn(session.session_id, 'could not add any more sessions for', pdu.system_id);
                //     session.send(pdu.response({
                //         command_status: smpp.ESME_RBINDFAIL
                //     }));
                //
                //     session.close(function() {
                //         logger.info('denied maxed connection');
                //     });
                // } else {
                    self.session.send(pdu.response({
                        command_status: 0
                    }));
                    self.session.resume();
                //}

            } else {
                logger.info(self.system_id, self.session.session_id, 'client was not authorized');
                self.session.send(pdu.response({
                    command_status: smpp.ESME_RBINDFAIL
                }));
                self.session.close(function() {
                    logger.info(self.system_id, self.session.session_id, 'denied, closed connection');
                });
            }
        };

        self.command_handlers.bind_transceiver = function(pdu) {
            self.command_handlers.bind('trx', pdu);
        };

        self.command_handlers.bind_transmitter = function(pdu) {
            self.command_handlers.bind('tx', pdu);
        };

        self.command_handlers.bind_receiver = function(pdu) {
            self.command_handlers.bind('rx', pdu);
        };

        self.command_handlers.enquire_link = function (pdu) {
            self.session.send(pdu.response());
            logger.info(self.system_id, self.session.session_id, 'keepalive');
        };
        self.command_handlers.submit_sm = function (pdu) {
            var message_id = uuid.v4();

            var message = {
                id      : message_id,
                channel : self.system_id,
                from    : pdu.source_addr,
                to      : pdu.destination_addr,
                message : pdu.message_payload? pdu.message_payload: pdu.short_message
            };

            var sms = new Sms(message);
            var amqpm = new AmqpMessage('mt', sms);

            self.store.save(sms);

            //@todo handle multipart?
            self.mt_queue.publish(amqpm);
            self.session.send(pdu.response({message_id: message_id}));
            logger.info(self.system_id, self.session.session_id, 'got mt message', message);
        };
        self.command_handlers.deliver_sm = function(pdu) {
            logger.info('deliver_sm', pdu);
            return new Promise(function(resolve, reject) {
                var client_responded = false;

                setTimeout(function() {
                    if(client_responded === false) {
                        reject(new Error(errors.WAITTIMEOUTEXCEEDED));
                    }
                }, self.wait_timeout);

                // pick the first connected session and send em the message
                self.session.deliver_sm(pdu, function(rPdu) {
                    client_responded = true;
                    if(pduUtils.pduIsOk(rPdu)) {
                        logger.info('sent sm', self.system_id, pdu);
                        resolve(rPdu);
                    } else {
                        reject(new Error(pduUtils.pduError(rPdu)));
                    }
                });
            });
        };
        self.command_handlers.deliver_sm_resp = function(pdu) {};


        self.command_handlers.unbind = function (pdu) {
            self.session.send(pdu.response());
            logger.info(self.system_id, self.session.session_id, 'client initiated disconnect');
            self.close();
        };

        self.set_alive = function(session) {
            self.last_activity = moment();
        };

        self.close = function() {
            self.session.close();
            logger.info(self.session.session_id, 'cleaned up');
        };
    };


    var Server = function(config) {
        var self     = this;
        self.clients = {};

        self.port = config.server.port;
        self.session_cleanup_freq = 5000;
        self.timeout = config.server.idle_timeout || 30000;
        self.resend_delay = config.server.resend_delay || 10000;
        self.store = new SMSStore(config);


        self.start = function() {
            var server = smpp.createServer(self.setServerSession);

            // Initialize MO consumer
            self.mo_queue = new RabbitDriver(config, {name: config.server.mo_channel, client: {prefetch: config.server.mo_queue_length}}, true);
            self.mo_queue.init().then(function() {
                logger.info('initialized mo consumer');
                self.mo_queue.on('data', self.handle_mo);
            });

            // // Initialize DLR consumer
            // self.mo_queue = new RabbitDriver(config, {name: config.server.mo_channel, client: {prefetch: config.server.mo_queue_length}}, true);
            // self.mo_queue.init().then(function() {
            //     logger.info('initialized mo consumer');
            //     self.mo_queue.on('data', self.handle_mo);
            // });

            // Initialize MT queue
            self.mt_queue = new RabbitDriver(config, {name: config.server.mt_channel}, false);
            self.mt_queue.init().then(function() {
                logger.info('initialized mt queue for publisher');
            });

            server.listen(self.port, function() {
                logger.info('smpp-server ready for connections, listening on port', self.port);
            });

            server.on('session', self.handle_client_session);

            setInterval(function() {
                self.cleanup_idle_sessions();
            }, self.session_cleanup_freq);
        };

        self.cleanup_idle_sessions = function() {
            var now = moment();
            for(var i in self.clients) {
                if(!self.clients[i]) {
                    continue;
                }
                var client = self.clients[i];
                var time_idle = now.diff(client.last_activity);

                if(time_idle >= (self.timeout + self.session_cleanup_freq)) {
                    logger.warn(client.system_id, client.session.session_id, "client idle for " + self.timeout + "ms", 'force closing');
                    client.close();
                    delete self.clients[client.session.session_id];
                }
            }
        };

        self.handle_client_session = function(session) {
            var session_id = uuid.v4().substr(0, 8);
            session.session_id = session_id;

            var client = new SmtpClientHandler(config, session, {
                mt_queue: self.mt_queue,
                store   : self.store
            });

            self.clients[session_id] = client;

            session.on('send', function(pdu) {
                logger.debug(client.system_id || 'uknown', session.session_id, 'sending pdu', pdu.command);
                log_pdu(session, pdu);
            });

            session.on('pdu', function(pdu) {
                logger.debug(session_id, 'got pdu', pdu.command);
                log_pdu(session, pdu);

                if(typeof client.command_handlers[pdu.command] === 'function') {
                    logger.info(client.system_id || 'uknown', session_id, 'pdu_received', pdu.command);
                    client.command_handlers[pdu.command](pdu);
                } else {
                    logger.warn(client.system_id || 'uknown', session_id, 'pdu_received but no command handler available', pdu.command);
                }
                client.set_alive(session);
            });
        };

        self.handle_dlr = function(data, socket) {
        };

        self.get_client = function (system_id, authenticated, bind_types) {
            for(var i in self.clients) {
                var client = self.clients[i];
                if(authenticated && !client.authenticated) {
                    continue;
                }
                if(client.system_id != system_id) {
                    continue;
                }

                if(bind_types.indexOf(client.bind_type) == -1) {
                    continue;
                }
                return client;
            }
            return false;
        };
        self.handle_mo = function(data, socket) {
            if(!data.body.channel) {
                logger.warn('discarding, invalid channel, message not routable', data.body);
                socket.ack();
            }

            var receiver = self.get_client(data.body.channel, true, [bind_type.trx, bind_type.rx]);
            if(receiver === false) {
                logger.warn('Unable to send message', error_str(errors.NOACTIVESESSION));
                setTimeout(function() {
                    socket.requeue();
                }, self.resend_delay);
            } else {
                //build the mo
                logger.info('creating sms', data.body);
                var sms = new Sms(data.body);
                var mo_use_message_payload = receiver.client_config.smpp.mo_use_message_payload? receiver.client_config.smpp.mo_use_message_payload: false;
                var default_encoding = receiver.client_config.smpp.default_encoding? receiver.client_config.smpp.default_encoding : null;
                var mo_overrides = receiver.client_config.smpp.mo_overrides? receiver.client_config.smpp.mo_overrides : {};

                var pdu = sms.toPdu(mo_overrides, default_encoding, mo_use_message_payload);
                receiver.command_handlers.deliver_sm(pdu).then(function() {
                    socket.ack();
                }).catch(function(err) {
                    socket.ack();
                    logger.warn('Unable to send message', error_str(err.message), err.stack);
                });

            }
        };
    };

    module.exports = Server;

})();
