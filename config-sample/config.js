module.exports = {
    rabbitmq: {
        hostname : 'amqp://api.pt3.loc'
    },
    server: {
        port      : 10070,
        http_port : 10080,
        clients: [
            {
                system_id    : 'YOUR_SYSTEM_ID',
                password     : 'YOUR_PASSWORD',
                max_sessions : 1,
                channel      : 'YOUR_SYSTEM_ID'
            }
        ]
    },
    client: {
        host      : 'localhost',
        port      : 10070,
        system_id : 'YOUR_SYSTEM_ID',
        password  : 'YOUR_PASSWORD'
    }
};
