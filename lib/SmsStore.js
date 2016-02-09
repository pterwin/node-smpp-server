var mongoose = require('mongoose');

var SMSModel = mongoose.model('sms',
    {
        id     : { type: String, index: true},
        fid    : { type: String, index: true},
        channel: { type: String, index: true},
        message: String,
        coding : String,
        udh    : String,
        type   : String // mo|mt
    }
);
var MongoSMSStore = function(config) {
    // return id
    mongoose.connect(config.store.mongo.uri);
    var self = this;
    self.save = function(sms) {
        var mObject = new SMSModel(sms);
        mObject.save(function(err, res) {

        });
    };

    self.updateForeignId = function(sms, fid) {
        console.log('updating foreign id', sms.id, fid);
        SMSModel.update({id: sms.id}, {$set:{fid: fid}}, function(err, res) {
            if(err) {
                console.log(err);
            }
        });
    };
};


module.exports = {
    mongo: MongoSMSStore
};
