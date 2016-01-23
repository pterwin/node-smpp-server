var smpp         = require('smpp');
var Logger       = require('logger');
var logger       = new Logger('smpp-server');
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var Promise      = require('bluebird');
var errors       = smpp.errors;
var moment       = require('moment');
var pduUtils     = require('./PduUtils');
var shortid      = require('shortid');
var hexy         = require('hexy');
//require('longjohn');

var errors = {
    NOACTIVESESSION    : 1,
    WAITTIMEOUTEXCEEDED : 2
};



(function() {


    var clients        = [];
    var server_session = null;


    var error_str = function(err) {
        for(var i in errors) {
            if(errors[i] == err) {
                return i;
            }
        }
    };


    var log_pdu = function(session, pdu) {
        var str = hexy.hexy(pdu.toBuffer());
        var splits = str.split("\n");
        for(var i in splits) {
            logger.info(session.session_id, splits[i]);
        }
    };


    var SmtpClientHandler = function(config, system_id) {
        var self         = this;
        self.sessions    = {};
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
            }
        }

        if(!self.system_id) {
            throw new Error("Could not initialize client");
        }

        logger.info('new client initialized', system_id);
        self.amqp.init().then(function(context) {
            logger.info('ampq driver for ', system_id, 'initialized');
        });

        self.amqp.on('data', function(data, socket) {
            logger.info('sending mo', data.body);
            self.deliver_sm(data.body).then(function() {
                logger.info('sent message');
                socket.ack();
            }).catch(function(err) {
                logger.warn('Unable to send message', error_str(err.message), err.stack);
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

            });
        });

        self.command_handlers = {};
        self.command_handlers.bind_transceiver = function(sesssion, pdu) {

        };
        self.command_handlers.enquire_link = function (session, pdu) {
            self.set_alive(session);
            session.send(pdu.response());
            logger.info(self.system_id, session.session_id, 'keepalive', self.system_id);
        };
        self.command_handlers.unbind = function (session, pdu) {
            self.set_alive(session);
            session.send(pdu.response());
            logger.info(self.system_id, session.session_id, 'keepalive', self.system_id);
        };

        self.add_session = function(session) {
            if(self.sessions.length >= self.max_sessions) {
                return false;
            }

            //create a setServerSession
            var session_id = shortid.generate();
            session.session_id = session_id;
            self.sessions[session_id] = session;
            self.initSessionHandlers(session_id, session);
            logger.info(self.system_id, session_id, 'session added, ', Object.keys(self.sessions).length, 'of', self.max_sessions);
            return true;
        };


        self.initSessionHandlers = function(session_id, session) {
            session.on('pdu', function(pdu) {

                if(typeof self.command_handlers[pdu.command] === 'function') {
                    logger.info(self.system_id, session_id, 'pdu_received', self.command_handlers[pdu.command]);
                    self.command_handlers[pdu.command](session, pdu);
                } else {
                    logger.warn(self.system_id, session_id, 'pdu_received but no command handler available', pdu.command);
                }

            });

            session.on('close', function() {
                logger.warn(self.system_id, session_id, 'session closed', session_id);
                self.destroy_session(session);
            });

            session.on('error', function() {
                logger.warn(self.system_id, session_id,'session error', session_id);
            });
        };

        self.set_alive = function(session) {
            session.last_activity = moment().format();
        };

        self.destroy_idle_sessions = function() {
        };

        self.destroy_session = function(session) {
            //self.sessions.splice(i, 1);
            self.sessions[session.session_id].close();
            delete(self.sessions[session.session_id]);
            logger.info(session.session_id, 'cleaned up');
            //console.log(self.sessions[session_id]);
        };

        self.deliver_sm = function(data) {
            return new Promise(function(resolve, reject) {
                var client_responded = false;

                setTimeout(function() {
                    if(client_responded === false) {
                        reject(new Error(errors.WAITTIMEOUTEXCEEDED));
                    }
                }, self.waitTimeout);

                logger.info('number of sessions', self.sessions.length);
                if(self.sessions.length <= 0) {
                    reject(new Error(errors.NOACTIVESESSION));
                }

                // pick the first connected session and send em the message
                data.message_payload = new Buffer(data.message_payload, 'ascii');
                self.sessions[self.sessions.length-1].deliver_sm(data, function(pdu) {
                    client_responded = true;
                    if(pduUtils.pduIsOk(pdu)) {
                        logger.info('sent sm', self.system_id, data);
                        resolve(pdu);
                    } else {
                        reject(new Error(pduUtils.pduError(pdu)));
                    }
                });
            });
        };
    };


    var Server = function(config) {
        var self  = this;
        self.port = config.server.port;

        self.start = function() {
            var server = smpp.createServer(self.setServerSession);
            server.listen(self.port, function() {
                logger.info('smpp-server ready for connections, listening on port', self.port);
            });
            server.on('session', self.handle_client_session);
        };

        self.auth = function(pdu) {
            for(var i=0; i<config.server.clients.length; i++) {
                var client = config.server.clients[i];
                if(pdu.system_id == client.system_id && pdu.password == client.password) {
                    return true;
                }
            }

            return false;
        };

        self.getClient = function(system_id) {
            for(var i=0; i<clients.length; i++) {
                if(clients[i].system_id === system_id) {
                    return clients[i];
                }
            }
            return false;
        };

        self.create_client = function(system_id) {
            var client = new SmtpClientHandler(config, system_id);
            clients.push(client);
            return client;
        };

        self.handle_client_session = function(session) {
            session.on('send', function(pdu) {
                logger.debug('sending pdu');
                log_pdu(session, pdu);
            });

            session.on('pdu', function(pdu) {
                logger.debug('got pdu', pdu);
                log_pdu(session, pdu);
            });

            logger.info('client connected');
            session.on('bind_transceiver', function(pdu) {
                self.bind_transceiver(session, pdu);
            });
        };

        self.bind_transceiver = function(session, pdu) {
            session.pause();
            if(self.auth(pdu)) {
                logger.info('authed, continue');
                var client = self.getClient(pdu.system_id);
                if(client === false) {
                    client = self.create_client(pdu.system_id);
                }
                var status = client.add_session(session);
                if(status === false) {
                    logger.warn('could not add any more sessions for', pdu.system_id);
                    session.send(pdu.response({
                        command_status: smpp.ESME_RBINDFAIL
                    }));

                    session.close(function() {
                        logger.info('denied maxed connection');
                    });
                } else {
                    session.send(pdu.response({
                        command_status: 0
                    }));
                    session.resume();
                }

            } else {
                logger.info('client was  not authorized');
                session.send(pdu.response({
                    command_status: smpp.ESME_RBINDFAIL
                }));
                session.close(function() {
                    logger.info('denied, closed connection');
                });
            }
        };
    };

    module.exports = Server;

})();
