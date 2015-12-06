var smpp         = require('smpp');
var Logger       = require('logger');
var logger       = new Logger('smpp-server');
var RabbitDriver = require('rabbit-driver').RabbitDriver.pushworker;
var Promise      = require('bluebird');
var errors       = smpp.errors;


var pduIsOk = function(pdu) {
    return pdu.command_status === 0;
};

var pduError = function(pdu) {
    for(var i in errors) {
        if(errors[i] == pdu.command_status) {
            return i;
        }
    }
};

(function() {

    var clients = [];
    var server_session = null;

    var SmtpClient = function(config, system_id) {
        var self      = this;
        self.sessions = [];
        self.amqp     = new RabbitDriver(config, {name: system_id, client: {prefetch: 10}}, true);

        logger.info('new client initialized', system_id);
        self.amqp.init().then(function(context) {
            logger.info('ampq driver for ', system_id, 'initialized');
        });

        self.amqp.on('data', function(data, socket) {
            logger.info('got message', data.body);
            self.deliver_sm(data.body).then(function() {
                socket.ack();
            }).catch(function(err) {
                logger.warn('Unable to send message', err.message, err.stack);
                socket.requeue();
            });
        });



        for(var i=0; i<config.server.clients.length; i++) {
            var client = config.server.clients[i];
            if(client.system_id === system_id) {
                self.system_id    = client.system_id;
                self.password     = client.password;
                self.max_sessions = client.max_sessions;
            }
        }

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
                logger.info('keepalive', self.system_id, i);
            });
        };

        self.destroySession = function(i) {
            self.sessions.splice(i, 1);
        };



        self.deliver_sm = function(data) {
            return new Promise(function(resolve, reject) {
                if(self.sessions.length <= 0) {
                    reject(new Error("No active sessions"));
                }
                self.sessions[0].deliver_sm(data, function(pdu) {
                    if(pduIsOk(pdu)) {
                        logger.info('sent sm', self.system_id, data);
                        resolve(pdu);
                    } else {
                        reject(new Error(pduError(pdu)));
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
            var client = new SmtpClient(config,system_id);
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
                }
                session.resume();
            } else {
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
