
module.exports = function (RED) {
  'use strict'


  function MbusController (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name

    let client = RED.nodes.getNode(config.client)
    let node = this

    var commandsQueue = [];

    showQueue();

    function onCommandExec(message) {
      setStatus(message, 'info');
    }

    function onCommandDone(message) {
      setStatus(message, 'success');
    }

    function onReconnect() {
      commandsQueue = [];
      showQueue();
    }

    client.on('mbCommandExec', onCommandExec);
    client.on('mbCommandDone', onCommandDone);
    client.on('mbReconnect', onReconnect);


    node.on('input', function (msg) {
      if (!client) {
        setStatus('error', 'No client found')
        return
      }

          switch (msg.topic) {
            case 'scan':

            commandsQueue.push({fn: 'scanSecondary'})
            showQueue();

            client.queueOperation('scanSecondary', [function(err, data){

              var cmd = commandsQueue.shift();

              if(err){
                setStatus('Error while scanning', 'error');
              }
              else{
                node.send({topic: 'scan', payload: data});
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

            commandsQueue.push({fn: 'getData', id: msg.payload.address});
            showQueue();

            client.queueOperation('getData', [msg.payload.address, function(err, data){

              var cmd = commandsQueue.shift();

              if(err){
                setStatus('Error while reading device ID ' + (cmd ? cmd.id : ''), 'error');
              }
              else{
                node.send({topic: 'getDevice', payload: data});
                client.emit('mbCommandDone', 'Device updated ID ' + (cmd ? cmd.id : ''));
              }

              if(client)
                client.doNextOperation();
            }]);

            break;
            case 'setPrimary':

            if(!msg.payload && (!msg.payload.oldAddr || !msg.payload.newAddr)){
              node.error('Missing data, set a valid "oldAddr" and "newAddr"', msg)
              return;
            }

            msg.payload.newAddr = parseInt(msg.payload.newAddr);

            if (!(Number.isInteger(msg.payload.newAddr)) || msg.payload.newAddr < 0 || msg.payload.newAddr > 250) {
              node.error('New primary address not valid, must be an integer between 1-250', msg)
              return
            }

            commandsQueue.push({fn: 'setPrimary', new: msg.payload.newAddr, old: msg.payload.oldAddr});
            showQueue();

            client.queueOperation('setPrimary', [msg.payload.oldAddr, msg.payload.newAddr, function(err){

              var cmd = commandsQueue.shift();

              if(err){
                setStatus('Error while setting new primary ID ' + cmd.new + ' of device ' + (cmd ? cmd.old : ''), 'error');
              }
              else{
                node.send({topic: 'setPrimary', payload: {newAddr:cmd.new, oldAddr:cmd.old}});
                client.emit('mbCommandDone', 'Setted new primary ID ' + cmd.new + ' to device ' + cmd.old);
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
            case 'setDevices':
              if(Array.isArray(msg.payload)){

                for(var i=0; i<msg.payload.length;i++){
                  if(/[\W_]+/g.test(msg.payload[i])) //matches any non-word char and '_'
                    break;
                }

                if(i >= msg.payload.length){
                  client.setDevices(msg.payload);
                  client.emit('mbCommandDone', 'Devices list updated, restarting client...');
                }
                else //error on index
                  setStatus('Property of msg.payload at index ' + i + ' is not valid', 'error');

              }else //not an array
                  setStatus('msg.payload must be an Array of Numbers and/or Strings', 'error');

            break;
            default:
            node.error('Topic Not Valid, allowed commands are: "scan", "getDevice", "getDevices", "setDevices", "restart" and "setPrimary"', msg)
          }
    })

    function showQueue(){
      setStatus('Queued commands: ' + commandsQueue.length, 'info');
    }

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
