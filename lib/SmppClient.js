var smpp    = require('smpp');
var _       = require('lodash');
var Promise = require('bluebird');
var Logger  = require('logger');
var logger  = new Logger('smpp-client');
var pduUtils = require('./PduUtils');



(function() {
    var SmppClient = function() {

        var self      = this;
        self.sessions = [];

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
            session.on('deliver_sm', function(pdu) {
                logger.info('got message with pdu', pdu);
                session.send(pdu.response({
                    command_status: 0
                }));
            });
            session.on('close', function() {
                logger.info('session closed', i);
                self.destroySession(i);
            });

            session.on('error', function() {
                logger.info('session error', i);
                self.destroySession(i);
            });

            setInterval(function() {
                logger.info('sending enquire link');
                session.enquire_link({},function(pdu) {
                    logger.info('enquire link acked', pdu);
                });
            }, 30000);
        };



        self.auth = function(system_id, password, session) {
            logger.info('sending auth', system_id, password);
            return new Promise(function(resolve, reject) {
                session.bind_transceiver({
                    system_id: system_id,
                    password: password
                }, function(pdu) {
                    if(pduUtils.pduIsOk(pdu) === true) {
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
