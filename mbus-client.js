
module.exports = function (RED) {
  'use strict'

  var clientEvents = {
   'mbError': 'error',
   'mbClose': 'warn',
   'mbConnect': 'log',
   'mbReconnect': 'log',
   'mbScan': 'log',
   'mbScanComplete': 'log',
   'mbDeviceUpdated': 'log'
 };

  function MbusClientNode (config) {
    RED.nodes.createNode(this, config)

    let MbusMaster = require('node-mbus')
    let RECONNECT_TIMEOUT = 5000;

    this.clienttype = config.clienttype
    this.tcpHost = config.tcpHost
    this.tcpPort = parseInt(config.tcpPort) || 500

    this.serialPort = config.serialPort
    this.serialBaudrate = config.serialBaudrate

    this.autoConnect = !!config.autoConnect

    let node = this

    node.client = null
    node.devices = {}
    node.reconnectTimeout = null
    node.scanTimeout = null
    node.lastStatus = null;
    node.started = false;
    node.lastStatus = null;

    function onConnect(err){
      if(err){
        emitEvent('mbError', {data: err.message, message: 'Error while connecting ' + err.message});
        restartConnection()
      }
      else{
        emitEvent('mbConnect', {message: 'Connected'});
        node.scanTimeout = setTimeout(node.scanSecondary, 1000);
      }
    }

    node.scanSecondary = function(){
      emitEvent('mbScan', {message: 'Scan started...'});

      try {

        node.client.scanSecondary(function(err, data) {
          if(err){
            emitEvent('mbError', {data:err.message, message: 'Error while scanning ' + err.message});
            restartConnection()
          }
          else{
            node.devices = data;
            node.errors = {};
            node.data = {};
            node.lastUpdated = 0;
            emitEvent('mbScanComplete', {data:data});
            updateDevices();
          }
        });

      } catch (e) {
        emitEvent('mbError', {data: e.message, message: 'Error while scanning ' + e.message});
        restartConnection()
      }
    }

    function updateDevices(){
      if(!node.devices || node.devices.length == 0)
      {
        emitEvent('mbError', {data: "No device to update", message: 'No device to update'});
        return;
      }

      if(node.lastUpdated >= node.devices.length)
        node.lastUpdated = 0;

      var addr = node.devices[node.lastUpdated];

      try{
        node.client.getData(addr, function(err, data){
          if (err) {
            emitEvent('mbError', {data: err.message, message: 'Error while reading device ' + addr + ' ' + err.message});
            node.errors[addr] = true;

            //all devices have an error
            if (Object.keys(node.errors).length === node.devices.length) {
              restartConnection()
            }

          }else{
            //remove error device
            if(node.errors[addr])
              delete node.errors[addr];

            node.lastUpdated++;
            node.data[addr] = data;
            emitEvent('mbDeviceUpdated', {data:data});
            updateDevices();
          }
        })
      } catch (e) {
        emitEvent('mbError', {data: e.message, message: 'Error while reading device ' + addr + ' ' + e.message});
        restartConnection()
      }
    }

    function restartConnection(err){

      emitEvent('mbReconnect', { message: 'Restarting client' })

      node.reconnectTimeout = setTimeout(function(){
      if(node.client){
        node.client.close(function(err){
          if(err) node.error("Error while closing connection", err.message);
          node.connect(true);
        })
      }else
        node.connect(true);
      }, RECONNECT_TIMEOUT);
    }

    function emitEvent(event, data){
      var logEvent = clientEvents[event];
      if(logEvent){

        node.lastStatus = {event: event, data: data};
        data && data.data ? node.emit(event, data.data) : node.emit(event);

        if(data && data.message)
          node[logEvent](data.message);
      }
    }

    node.getStatus = function(){
      return node.lastStatus;
    }

    node.connect = function(reconnecting){

      if(node.started && !reconnecting)
        return;

      node.started = true;

      var mbusOptions = {autoConenct: this.autoConenct};

      if (node.clienttype === 'tcp') {
        mbusOptions.host = this.tcpHost;
        mbusOptions.port = this.tcpPort;
      }else {
        mbusOptions.serialPort = this.serialPort;
        mbusOptions.serialBaudrate = this.serialBaudrate;
      }

      node.client = new MbusMaster(mbusOptions);
      node.client.connect(onConnect);
    }

    node.on('close', function (done) {
      node.devices = {};
      node.errors = {};
      node.data = {};
      node.lastUpdated = 0;
      node.started = false;
      node.lastStatus = null;

      if(node.reconnectTimeout){
        clearTimeout(node.reconnectTimeout);
        node.reconnectTimeout = null;
      }

      if(node.scanTimeout){
        clearTimeout(node.scanTimeout);
        node.scanTimeout = null;
      }

      if (node.client) {
        try {
          node.client.close(function (err) {
            if(err) node.error("Error while closing client: "+err.message)

            emitEvent('mbClosed', {message: 'Connection closed'});
            done()
          });
        } catch (e) {
          node.error("Error while closing client: "+e.message)
          emitEvent('mbClosed', {message: 'Connection closed'});
          done()
        }
      }else
        emitEvent('mbClosed', {message: 'Connection closed'});

      done()
    });
  }

  RED.nodes.registerType('mbus-client', MbusClientNode)

  RED.httpAdmin.get('/mbus/serial/ports', RED.auth.needsPermission('serial.read'), function (req, res) {
    let SerialPort = require('serialport')
    SerialPort.list(function (err, ports) {
      if (err) console.log(err)
      res.json(ports)
    })
  })
}
