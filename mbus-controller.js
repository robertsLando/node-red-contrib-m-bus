
module.exports = function (RED) {
  'use strict'


  function MbusController (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name

    let client = RED.nodes.getNode(config.client)
    let node = this

    var commandsQueue = [];


    function onCommandExec(message) {
      setStatus(message, 'info');
    }

    function onCommandDone(message) {
      setStatus(message, 'success');
    }

    client.on('mbCommandExec', onCommandExec);
    client.on('mbCommandDone', onCommandDone);


    node.on('input', function (msg) {
      if (!client) {
        setStatus('error', 'No client found')
        return
      }

          switch (msg.topic) {
            case 'scan':
            commandsQueue.push({fn: 'scanSecondary'})
            client.queueOperation('scanSecondary', [function(err, data){
              if(err){
                node.error('Error while scanning', msg)
                setStatus('Error while scanning', 'error');
              }
              else{
                node.send({topic: 'scan', payload: data});
                client.emit('mbScanComplete', data);
                client.emit('mbCommandDone', 'Scanning done');
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

            if (!(Number.isInteger(msg.payload.address))) {
              node.error('Address Not Valid', msg)
              return
            }

            commandsQueue.push({fn: 'getData', id: msg.payload.address});

            client.queueOperation('getData', [msg.payload.address, function(err, data){
              if(err){
                node.error('Error while reading device')
                setStatus('Error while reading device ID', 'error');
              }
              else{
                node.send({topic: 'getDevice', payload: data});
                client.emit('mbDeviceUpdated', data);
                client.emit('mbCommandDone', 'Device updated ID=' + data.SlaveInformation.Id);
              }

                if(client)
                  client.doNextOperation();
            }]);

            break;
            case 'getDevices':
              node.send({topic: 'getDevices', payload: client.getStats()});
            break;
            case 'restart':
              client.restart();
            break;

            default:
            node.error('Topic Not Valid, allowed commands are: "scan", "getDevice", "getDevices" and "restart"', msg)
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
