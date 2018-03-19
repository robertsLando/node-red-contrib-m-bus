
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
