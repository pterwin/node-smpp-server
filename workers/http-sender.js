(function() {
    var Sender = require('../lib/Sender').http;
    var config = require('../config/config');
    var sender = new Sender(config);

    sender.startWorker();
})();
