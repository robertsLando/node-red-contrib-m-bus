
module.exports = function (RED) {
  'use strict'


  function MbusOut (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name

    let client = RED.nodes.getNode(config.client)
    let node = this

    //----- EVENTS HANDLERS ----------------------------------------------------

    var subscribedEvents = {
     'mbError': onError,
     'mbClose': onClose,
     'mbConnect': onConnect,
     'mbReconnect': onReconnect,
     'mbScan': onScan,
     'mbScanComplete': onScanComplete,
     'mbDeviceUpdated': onDeviceUpdated,
     'mbDevicesLoaded': onDevicesLoaded
   };


    function onConnect(){
      setStatus('Connected', 'success')
    }

    function onError(failureMsg) {
      setStatus("Error: " + failureMsg, 'error');
    }

    function onClose(){
      setStatus('Closed', 'error')
    }

    function onScan() {
      setStatus("Scanning devices...", 'info')
    }

    function onScanComplete(devices){
      setStatus("Scan complete, " + devices.length + " devices found", 'success')
      node.send({topic: "mbScanComplete", payload: devices});
    }

    function onDeviceUpdated(device) {
      setStatus("Device " + device.SlaveInformation.Id + " updated", 'success')
      node.send({topic: "mbDeviceUpdated", payload: device});
    }

    function onDevicesLoaded(devices) {
      setStatus(devices.length + " devices loaded from file", 'success')
      node.send({topic: "mbDevicesLoaded", payload: devices});
    }

    function onReconnect() {
      setStatus('Reconnecting...', 'warning')
    }

    //----- SUBSCRIBE TO CLIENT EVENTS -----------------------------------------
    if(client){

      //update status
      subscribedEvents[client.getStatus().event]();

      Object.keys(subscribedEvents).forEach(function(evt) {
          client.on(evt, subscribedEvents[evt]);
      });

    }

    // node.on('input', function (msg) {
    //   if (!client) {
    //     return
    //   }
    //
    //   if (msg.payload) {
    //     try {
    //       if (typeof msg.payload === 'string') {
    //         msg.payload = JSON.parse(msg.payload)
    //       }
    //
    //       switch (msg.topic) {
    //         case 'scan':
    //         if(client)  client.scanSecondary();
    //
    //         break;
    //         case 'read':
    //         msg.payload.address = parseInt(msg.payload.address) || 0
    //
    //         if (!(Number.isInteger(msg.payload.address) &&
    //         msg.payload.address >= 0 &&
    //         msg.payload.address <= 250)) {
    //           node.error('Address Not Valid', msg)
    //           return
    //         }
    //
    //         break;
    //         default:
    //         node.error('Topic Not Valid, must be "read" or "scan"', msg)
    //       }
    //
    //     } catch (err) {
    //       node.error(err, msg)
    //     }
    //
    //   } else {
    //     node.error('Payload Not Valid', msg)
    //   }
    // })

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

  RED.nodes.registerType('mbus-out', MbusOut)
}
