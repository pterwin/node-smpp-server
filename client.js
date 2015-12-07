var Client = require('./lib/SmppClient.js');
var config = require('./config/config.js');


var client = new Client();
client.addSession('localhost', 10070, 'YOUR_SYSTEM_ID', 'YOUR_PASSWORD' );
client.addSession('localhost', 10070, 'YOUR_SYSTEM_ID', 'YOUR_PASSWORD' );


// var smpp = require('smpp');
// var session = smpp.connect('localhost', config.client.port);
// session.on('deliver_sm', function(pdu) {
//     console.log(pdu);
//     session.send(pdu.response({
//         command_status: 0
//     }));
// });
// session.bind_transceiver({
//     system_id : config.client.system_id,
//     password  : config.client.password
// }, function(pdu) {
//     console.log(pdu);
//     if (pdu.command_status === 0) {
//         // Successfully bound
//         session.submit_sm({
//             destination_addr: 'DESTINATION NUMBER',
//             short_message: 'Hello!'
//         }, function(pdu) {
//             if (pdu.command_status === 0) {
//                 // Message successfully sent
//                 console.log(pdu.message_id);
//             }
//         });
//     }
// });
