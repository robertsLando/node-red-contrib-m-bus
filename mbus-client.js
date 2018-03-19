
module.exports = function (RED) {
  'use strict'

  var clientEvents = {
    'mbError': 'error',
    'mbClose': 'log',
    'mbConnect': 'log',
    'mbReconnect': 'debug',
    'mbScan': 'debug',
    'mbScanComplete': 'debug',
    'mbDeviceUpdated': 'debug',
    'mbDevicesLoaded': 'debug'
  };

  function MbusClientNode (config) {
    RED.nodes.createNode(this, config)

    let MbusMaster = require('node-mbus')
    let jsonfile = require('jsonfile')
    let DEVICES_FILE = 'mbus_devices.json'
    let DELAY_TIMEOUT = 3000;
    let node = this

    //POLYFILL
    if (!Array.isArray) {
      Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
      };
    }

    //----- NODE CONFIGURATION VARS --------------------------------------------

    var RECONNECT_TIMEOUT = parseInt(config.reconnectTimeout) || 5000;

    node.clienttype = config.clienttype

    node.tcpHost = config.tcpHost
    node.tcpPort = parseInt(config.tcpPort) || 2000

    node.serialPort = config.serialPort
    node.serialBaudrate = config.serialBaudrate

    node.storeDevices = config.storeDevices;
    node.disableLogs = config.disableLogs;

    //----- PRIVATE VARS -------------------------------------------------------

    var client = null
    var reconnectTimeout = null
    var delayTimeout = null
    var lastStatus = null;
    var started = false;
    var lastStatus = null;

    //data
    var devices = []
    var errors = {};
    var devicesData = {};
    var lastUpdated = 0;
    var controllerQueue = [];


    //----- PRIVATE FUNCTIONS --------------------------------------------------

    function onConnect(err){
      if(err){
        emitEvent('mbError', {data: err.message, message: 'Error while connecting ' + err.message});
        restartConnection()
      }
      else{
        emitEvent('mbConnect', {message: 'Connected'});

        if(node.storeDevices)
        loadDevices(true);
        else
        delayFunction(node.scanSecondary);
      }
    }

    //store new devices configuration
    function storeDevices(){
      jsonfile.writeFile(DEVICES_FILE, devices, function(err) {
        if(err)
        emitEvent('mbError', {data: err.message, message: 'Error while writing devices file ' + err.message});
      })
    }

    //load devices from file
    function loadDevices(scanIfFail){
      jsonfile.readFile(DEVICES_FILE, function(err, data) {
        if(err)
        emitEvent('mbError', {data: err.message, message: 'Error while reading devices file ' + err.message});

        if(isValidArray(data)){
          emitEvent('mbDevicesLoaded', {data:data});
          devices = data;
          delayFunction(readDevices);
        }else if(scanIfFail){
          delayFunction(node.scanSecondary);
        }
      })
    }

    //Delay a function
    function delayFunction(fun){
      delayTimeout = setTimeout(fun, DELAY_TIMEOUT)
    }

    //Check devices array is valid (just contains numbers or strings)
    function isValidArray(data){
      if(!Array.isArray(data)){
        return false;
      }

      for (var i = 0; i < data.length; i++) {
        if(typeof data[i] != 'string' && typeof data[i] != 'number')
        return false;
      }

      return true;
    }

    function readDevices(){

      if(!devices || devices.length == 0)
      {
        emitEvent('mbError', {data: "No device to update", message: 'No device to update'});
        return;
      }

      //all devices read, restart from 0
      if(lastUpdated >= devices.length)
      lastUpdated = 0;

      var addr = devices[lastUpdated];

      node.getData(addr, function(err,data){

        if (err) {
          emitEvent('mbError', {data: err.message, message: 'Error while reading device ' + addr + ' ' + err.message});

          errors[addr] = true;

          //all devices have an error
          if (Object.keys(errors).length === devices.length) {
            restartConnection()
          }

        }else{ //no error

          //remove error device
          if(errors[addr])
          delete errors[addr];

          //move index to next
          lastUpdated++;
          devicesData[addr] = data;
          emitEvent('mbDeviceUpdated', {data:data});

          if(controllerQueue.length > 0){
            node.doNextOperation();
          }else
          readDevices();
        }

      })

    }

    function wrapFunction(fn, context, params) {
      return function() {
        fn.apply(context, params);
      };
    }

    function restartConnection(){

      emitEvent('mbReconnect', { message: 'Restarting client' })

      reconnectTimeout = setTimeout(function(){
        if(client){
          try {
            client.close(function(err){
              if(err)
              emitEvent('mbError', {data: err.message, message: 'Error while closing client ' + err.message});
            })
          } catch (e) {
            emitEvent('mbError', {data: e.message, message: 'Error while closing client ' + e.message});
          }finally{
            node.connect(true);
          }
        }else
          node.connect(true);

      }, RECONNECT_TIMEOUT);
    }

    //emit an event with data and log it if it contains a message
    function emitEvent(event, data){
      var logEvent = clientEvents[event];
      if(logEvent){

        lastStatus = {event: event, data: data};
        data && data.data ? node.emit(event, data.data) : node.emit(event);

        if(data && data.message && !node.disableLogs)
        node[logEvent](data.message);
      }
    }

    //----- PUBLIC FUNCTIONS ---------------------------------------------------

    node.queueOperation = function(functionName, data){
      controllerQueue.push(wrapFunction(node[functionName], node, data));

      if(controllerQueue.length > 10)
        controllerQueue.shift();
    }

    node.doNextOperation = function(){
      if(controllerQueue.length > 0) //there are no more operation in queue
      (controllerQueue.shift())();
      else //restart reads
      readDevices();
    }

    node.getData = function(addr, cb){
      try{
        client.getData(addr, function(err, data){
          cb(err,data);
        });

      } catch (e) {
        cb(e, null)
      }
    }

    node.restartRead = function(){
      readDevices();
    }

    node.getStats = function(){
      return {devices: devicesData, errors: errors}
    }

    node.scanSecondary = function(cb){
      emitEvent('mbScan', {message: 'Scan started...'});

      try {

        client.scanSecondary(function(err, data) {
          if(cb){
            cb(err,data)
          }
          else if(err){
            emitEvent('mbError', {data:err.message, message: 'Error while scanning ' + err.message});
            restartConnection()
          }
          else{
            devices = data;

            if(node.storeDevices)
            storeDevices();

            emitEvent('mbScanComplete', {data:data});

            readDevices();
          }
        });

      } catch (e) {
        emitEvent('mbError', {data: e.message, message: 'Error while scanning ' + e.message});
        restartConnection()
      }
    }

    //get currently status or 'closed'
    node.getStatus = function(){
      return lastStatus || {event: 'mbClose'};
    }

    //connect the client
    node.connect = function(reconnecting){

      if(started && !reconnecting)
      return;

      started = true;

      var mbusOptions = {autoConnect: true};

      if (this.clienttype === 'tcp') {
        mbusOptions.host = this.tcpHost;
        mbusOptions.port = this.tcpPort;
      }else {
        mbusOptions.serialPort = this.serialPort;
        mbusOptions.serialBaudrate = this.serialBaudrate;
      }

      client = new MbusMaster(mbusOptions);
      client.connect(onConnect);
    }

    //----- NODE EVENTS --------------------------------------------------

    //triggered when node is removed or project is redeployed
    node.on('close', function (done) {

      //init private vars

      devices = [];
      errors = {};
      data = {};
      lastUpdated = 0;
      started = false;
      lastStatus = null;
      controllerQueue = [];

      //stop running timeouts

      if(reconnectTimeout){
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if(delayTimeout){
        clearTimeout(delayTimeout);
        delayTimeout = null;
      }

      //close client

      if (client) {
        try {
          client.close(function (err) {
            if(err)
            emitEvent('mbError', {data: err.message, message: 'Error while closing client ' + err.message});
          });
        } catch (e) {
          emitEvent('mbError', {data: e.message, message: 'Error while closing client ' + e.message});
        }finally{
          emitEvent('mbClosed', {message: 'Connection closed'});
          done()
        }
      }else
      emitEvent('mbClosed', {message: 'Connection closed'});

      done()

    }); //end on 'close'

    //start the client
    restartConnection();
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
