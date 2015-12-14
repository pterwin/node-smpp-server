var smpp   = require('smpp');
var errors = smpp.errors;


var pduIsOk = function(pdu) {
    return pdu.command_status === errors.ESME_ROK;
};

var pduError = function(pdu) {
    for(var i in errors) {
        if(errors[i] == pdu.command_status) {
            return i;
        }
    }
};


module.exports = {
    pduIsOk: pduIsOk,
    pduError: pduError
};
