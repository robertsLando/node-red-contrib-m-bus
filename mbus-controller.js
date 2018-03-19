
module.exports = function (RED) {
  'use strict'


  function MbusController (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name

    let client = RED.nodes.getNode(config.client)
    let node = this


    node.on('input', function (msg) {
      if (!client) {
        setStatus('error', 'No client found')
        return
      }

          switch (msg.topic) {
            case 'scan':
            client.queueOperation('scanSecondary', [function(err, data){
              if(err)
                node.error('Error while scanning', msg)
              else{
                node.send({topic: 'scan', payload: data});
                client.emit('mbScanComplete', data);
              }

              if(client)
                client.doNextOperation();

            }]);

            break;
            case 'getDevice':

            if(!msg.payload && !msg.payload.address){
              node.error('Address Not found', msg)
              return;
            }

            msg.payload.address = parseInt(msg.payload.address) || 0

            if (!(Number.isInteger(msg.payload.address) &&
            msg.payload.address >= 0 &&
            msg.payload.address <= 250)) {
              node.error('Address Not Valid', msg)
              return
            }

            client.queueOperation('getData', [msg.payload.address, function(err, data){
              if(err)
                node.error('Error while reading device', msg)
              else{
                node.send({topic: 'getDevice', payload: data});
                client.emit('mbDeviceUpdated', data);
              }

                if(client)
                  client.doNextOperation();
            }]);

            break;
            case 'getDevices':
              node.send({topic: 'getDevices', payload: client.getStats()});
            break;

            default:
            node.error('Topic Not Valid, allowed commands are: "scan"', msg)
          }



    })

    //Set node status
    function setStatus (message, type) {
      let types = {info: 'blue', error: 'red', warning: 'yellow', success: 'green'};

      node.status({
        fill: types[type] || 'grey',
        shape: 'dot',
        text: message
      })
    }
  }

  RED.nodes.registerType('mbus-controller', MbusController)
}
