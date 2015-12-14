var smpp         = require('smpp');
var Logger       = require('logger');
var logger       = new Logger('smpp-server');
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var Promise      = require('bluebird');
var errors       = smpp.errors;
var moment       = require('moment');
var pduUtils     = require('./PduUtils');

var errors = {
    NOACTIVESESSION: 1
};

(function() {

    var clients        = [];
    var server_session = null;

    var SmtpClientHandler = function(config, system_id) {
        var self         = this;
        self.sessions    = [];
        logger.info('system_id', system_id);
        self.amqp        = new RabbitDriver(config, {name: system_id.toLowerCase(), client: {prefetch: 10}}, true);
        self.resendDelay = 10000;

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
                logger.warn('Unable to send message', err.message, err.stack);
                if(err.message == errors.NOACTIVESESSION) {
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



        self.addSession = function(session) {
            logger.info('session len', self.sessions.length, 'max', self.max_sessions);
            if(self.sessions.length >= self.max_sessions) {
                return false;
            }

            self.sessions.push(session);
            self.initSessionHandlers(self.sessions.length-1, session);
            return true;
        };

        self.initSessionHandlers = function(i, session) {
            session.on('close', function() {
                logger.info('session closed', i);
                self.destroySession(i);
            });

            session.on('error', function() {
                logger.info('session error', i);
            });

            session.on('enquire_link', function(pdu) {
                self.setAlive(session);
                session.send(pdu.response());
                logger.info('keepalive', self.system_id, i);
            });
        };

        self.setAlive = function(session) {
            session.lastActivity = moment().format();
        };

        self.destroyIdleSessions = function() {
        };

        self.destroySession = function(i) {
            self.sessions.splice(i, 1);
        };

        self.deliver_sm = function(data) {
            return new Promise(function(resolve, reject) {
                logger.info('number of sessions', self.sessions.length);
                if(self.sessions.length <= 0) {
                    reject(new Error(errors.NOACTIVESESSION));
                }

                // pick the first connected session and send em the message
                self.sessions[0].deliver_sm(data, function(pdu) {
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

            server.on('session', self.handClientSession);
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

        self.createClient = function(system_id) {
            var client = new SmtpClientHandler(config,system_id);
            clients.push(client);
            return client;
        };

        self.handClientSession = function(session) {
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
                    client = self.createClient(pdu.system_id);
                }
                var status = client.addSession(session);
                logger.info('status', status);
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
