
module.exports = function (RED) {
  'use strict'

  function MbusReader (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name

    let client = RED.nodes.getNode(config.client)

    setStatus('Connected', 'success')

    // node.onConnect = function () {
    //   setStatus('Connected')
    // }
    //
    // node.onError = function (failureMsg) {
    //   setStatus(failureMsg, 'error')
    //   node.warn(failureMsg)
    // }
    //
    // node.onClose = function () {
    //   setStatus('Closed', 'warning')
    // }
    //
    // client.on('init', node.onInit)
    // client.on('connected', node.onConnect)
    // client.on('error', node.onError)
    // client.on('closed', node.onClose)

    node.on('input', function (msg) {
      if (!client.client) {
        return
      }

      if (msg.payload) {
        try {
          if (typeof msg.payload === 'string') {
            msg.payload = JSON.parse(msg.payload)
          }
          switch (msg.topic) {
            case 'scan':
            client.scanSecondary(function(err, data) {
              if(err)
              console.log('err: ' + err);
              else
               node.send({payload: data})
            });
            break;
            case 'read':
            msg.payload.address = parseInt(msg.payload.address) || 0

            if (!(Number.isInteger(msg.payload.address) &&
            msg.payload.address >= 0 &&
            msg.payload.address <= 250)) {
              node.error('Address Not Valid', msg)
              return
            }

            client.getData(msg.payload.address, function(err, data) {
              if(err)
              console.log('err: ' + err);
              else
               node.send({payload: data})
            });

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
