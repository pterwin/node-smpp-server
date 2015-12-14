var logger  = new (require('logger'))('smpp-http-api');
var config  = require('../config/config');
var modules = ['mo'];
var _       = require('lodash');

(function() {
    'use strict';
        var Hapi   = require('hapi');
        var server = new Hapi.Server();

        logger.info('config', config.server);
        server.connection({
            port: config.server.http_port
        });

        _.each(modules, function(mod) {
            var Type   = require('./controllers/' + mod);
            var module = new Type(config, server);
            logger.info('loaded module', mod);
        });

        // Start the server
        server.start(function(err) {
            if(err) {
            } else {
                logger.info('http server started on', config.server.http_port);
            }
        });
})();
