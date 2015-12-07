var smpp    = require('smpp');
var _       = require('lodash');
var Promise = require('bluebird');
var Logger  = require('logger');
var logger  = new Logger('smpp-client');
var errors  = smpp.errors;

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
    var SmppClient = function() {

        var self = this;
        self.sessions  = [];

        self.addSession = function(host, port, system_id, password) {
            var session = smpp.connect(host, port);
            session.on('connect', function() {
                self.auth(system_id, password, session).then(function() {
                    self.sessions.push(session);
                    self.initSessionHandlers(self.sessions.length-1, session);
                    logger.info('session added');
                }).catch(function(err) {
                    logger.warn("could not bind", err.message);
                });

            });
        };


        self.destroySession = function(i) {
            self.sessions.splice(i, 1);
        };


        self.initSessionHandlers = function(i, session) {
            session.on('close', function() {
                logger.info('session closed', i);
                self.destroySession(i);
            });

            session.on('error', function() {
                logger.info('session error', i);
                self.destroySession(i);
            });
        };


        self.auth = function(system_id, password, session) {
            logger.info('sending auth', system_id, password);
            return new Promise(function(resolve, reject) {
                session.bind_transceiver({
                    system_id: system_id,
                    password: password
                }, function(pdu) {
                    logger.info('pdu', pdu);
                    if(pduIsOk === true) {
                        resolve(session);
                    } else {
                        reject(new Error(pduError(pdu)));
                    }
                });
            });
        };
    };

    module.exports = SmppClient;
})();
