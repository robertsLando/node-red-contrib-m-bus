module.exports = (RED) => {
  function MbusController(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;

    const client = RED.nodes.getNode(config.client);
    const node = this;

    if (client) client.registerForMbus(node);

    let commandsQueue = [];

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

    node.on('input', (msg) => {
      if (!client) {
        setStatus('error', 'No client found');
        return;
      }

      switch (msg.topic) {
        case 'scan':

          commandsQueue.push({ fn: 'scanSecondary' });
          showQueue();

          client.queueOperation('scanSecondary', [(err, data) => {
            const cmd = commandsQueue.shift();

            if (err) {
              node.error(err);
              setStatus(`Error while scanning: ${err.message}`, 'error');
            } else {
              msg.payload = data;
              node.send(msg);
              client.emit('mbCommandDone', 'Scanning done');
            }

            if (client) client.doNextOperation();
          }]);

          break;
        case 'getDevice':

          if (!msg.payload && !msg.payload.address) {
            node.error('Address Not found', msg);
            return;
          }

          commandsQueue.push({ fn: 'getData', id: msg.payload.address });
          showQueue();

          client.queueOperation('getData', [msg.payload.address, (err, data) => {
            const cmd = commandsQueue.shift();

            if (err) {
              node.error(err);
              setStatus(`Error while reading device ID ${cmd ? cmd.id : ''}: ${err.message}`, 'error');
            } else {
              msg.payload = data;
              node.send(msg);
              client.emit('mbCommandDone', `Device updated ID ${cmd ? cmd.id : ''}`);
            }

            if (client) client.doNextOperation();
          }]);

          break;
        case 'setPrimary':

          if (!msg.payload && (!msg.payload.oldAddr || !msg.payload.newAddr)) {
            node.error('Missing data, set a valid "oldAddr" and "newAddr"', msg);
            return;
          }

          msg.payload.newAddr = parseInt(msg.payload.newAddr);

          if (!(Number.isInteger(msg.payload.newAddr))
            || msg.payload.newAddr < 0
            || msg.payload.newAddr > 250) {
            node.error('New primary address not valid, must be an integer between 1-250', msg);
            return;
          }

          commandsQueue.push({ fn: 'setPrimary', new: msg.payload.newAddr, old: msg.payload.oldAddr });
          showQueue();

          client.queueOperation('setPrimary', [msg.payload.oldAddr, msg.payload.newAddr, (err) => {
            const cmd = commandsQueue.shift();

            if (err) {
              node.error(err);
              setStatus(`Error while setting new primary ID ${cmd.new} of device ${cmd ? cmd.old : ''}: ${err.message}`, 'error');
            } else {
              msg.payload = { newAddr: cmd.new, oldAddr: cmd.old };
              node.send(msg);
              client.emit('mbCommandDone', `New primary ID ${cmd.new} set to device ${cmd.old}`);
            }

            if (client) client.doNextOperation();
          }]);

          break;
        case 'getDevices':
          msg.payload = client.getStats();
          node.send(msg);
          break;
        case 'restart':
          client.restart();
          break;
        case 'setDevices':
          if (Array.isArray(msg.payload)) {
            let i = 0;
            for (i = 0; i < msg.payload.length; i++) {
              if (/[\W_]+/g.test(msg.payload[i])) { // matches any non-word char and '_'
                break;
              }
            }

            if (i >= msg.payload.length) {
              client.setDevices(msg.payload);
              client.emit('mbCommandDone', 'Devices list updated, restarting client...');
            } else { // error on index
              setStatus(`Property of msg.payload at index ${i} is not valid`, 'error');
            }
          } else { // not an array
            setStatus('msg.payload must be an Array of Numbers and/or Strings', 'error');
          }

          break;
        default:
          node.error('Topic Not Valid, allowed commands are: "scan", "getDevice", "getDevices", "setDevices", "restart" and "setPrimary"', msg);
      }
    });

    function showQueue() {
      setStatus(`Queued commands: ${commandsQueue.length}`, 'info');
    }

    // Set node status
    function setStatus(message, type) {
      const types = {
        info: 'blue', error: 'red', warning: 'yellow', success: 'green',
      };

      node.status({
        fill: types[type] || 'grey',
        shape: 'dot',
        text: message,
      });
    }
  }

  RED.nodes.registerType('mbus-controller', MbusController);
};
