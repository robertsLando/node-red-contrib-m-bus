
module.exports = function (RED) {
  'use strict'

  function MbusReader (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name

    let client = RED.nodes.getNode(config.client)
    let node = this


    node.onConnect = function () {
      setStatus('Connected', 'success')
    }

    node.onError = function (failureMsg) {
      setStatus("Error: " + failureMsg, 'error');
    }

    node.onClose = function () {
      setStatus('Closed', 'error')
    }

    node.onScan = function () {
      setStatus("Scanning devices...", 'info')
    }

    node.onScanComplete = function (devices) {
      setStatus("Scan complete, " + devices.length + " devices found", 'success')
      node.send({payload: devices});
    }

    node.onDeviceUpdated = function (device) {
      setStatus("Device " + device.SlaveInformation.Id + " updated", 'success')
      node.send({payload: device});
    }

    node.onReconnect = function () {
      setStatus('Reconnecting', 'warning')
    }

    client.on('mbconnected', node.onConnect)
    client.on('mberror', node.onError)
    client.on('mbclosed', node.onClose)
    client.on('mbscan', node.onScan)
    client.on('mbscanComplete', node.onScanComplete)
    client.on('mbdeviceUpdated', node.onDeviceUpdated)
    client.on('mbreconnect', node.onReconnect)

    node.on('input', function (msg) {
      if (!client) {
        return
      }

      if (msg.payload) {
        try {
          if (typeof msg.payload === 'string') {
            msg.payload = JSON.parse(msg.payload)
          }

          switch (msg.topic) {
            case 'scan':

            break;
            case 'read':
            msg.payload.address = parseInt(msg.payload.address) || 0

            if (!(Number.isInteger(msg.payload.address) &&
            msg.payload.address >= 0 &&
            msg.payload.address <= 250)) {
              node.error('Address Not Valid', msg)
              return
            }

            break;
            default:
            node.error('Topic Not Valid, must be "read" or "scan"', msg)
          }

        } catch (err) {
          node.error(err, msg)
        }

      } else {
        node.error('Payload Not Valid', msg)
      }
    })

    function setStatus (message, type) {
      let types = {info: 'blue', error: 'red', warning: 'yellow', success: 'green'};

      node.status({
        fill: types[type] || 'grey',
        shape: 'dot',
        text: message
      })
    }
  }

  RED.nodes.registerType('mbus-reader', MbusReader)
}
