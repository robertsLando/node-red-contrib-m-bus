
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
    'mbDevicesLoaded': 'debug',
    'mbCommandExec': 'debug',
    'mbCommandDone': 'debug'
  };

  function MbusClientNode (config) {
    RED.nodes.createNode(this, config)

    let MbusMaster = require('node-mbus')
    let jsonfile = require('jsonfile')
    let DEVICES_FILE = 'mbus_devices.json'
    let DELAY_TIMEOUT = 3000;
    let MAX_QUEUE_DIM = 10;
    let node = this

    var emptyDevice = {SlaveInformation : {}, DataRecord: []};

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
    var lastStatus = null

    var reconnectTimeout = null
    var delayTimeout = null
    var closeTimeout = null;

    var started = false
    var closed = false
    var reconnecting = false
    var operationRunning = false;

    //data
    var devices = []
    var errors = {};
    var devicesData = {};
    var updateIndex = 0;
    var controllerQueue = [];


    //--------------------------------------------------------------------------
    //-------- PRIVATE FUNCTIONS -----------------------------------------------
    //--------------------------------------------------------------------------

    //----- UTILS -----

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
          delayFunction(scanSecondary);
        }
      })
    }

    //Add empty device if it has errors since first read
    function addEmptyDevice(id){
      var tmp = JSON.parse(JSON.stringify(emptyDevice));
      tmp.SlaveInformation.Id = parseSecondaryID(id);
      devicesData[id] = tmp;
    }

    function parseSecondaryID(id){
      id = id.substr(0,8);
      id = parseInt(id); //remove leading 0
      return id.toString();
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

    //read next device
    function readDevices(){

      if(closed){
        emitClose()
        return;
      }

      if(!devices || devices.length == 0)
      {
        emitEvent('mbError', {data: "No device to update", message: 'No device to update'});
        return;
      }

      //all devices read, restart from 0
      if(updateIndex >= devices.length)
      updateIndex = 0;

      var addr = devices[updateIndex];

      getData(addr, function(err,data){

        //move index to next (even if there is an error)
        updateIndex++;

        if (err) {
          emitEvent('mbError', {data: err.message, message: 'Error while reading device ' + addr + ' ' + err.message});

          errors[addr] = true;

          //add an empty device so I know it has an error
          if(!devicesData[addr])
            addEmptyDevice(addr)

          devicesData[addr].lastUpdate = new Date();
          devicesData[addr].error = err.message;
          devicesData[addr].secondaryID = addr;

          //all devices have an error, restart connection
          if (Object.keys(errors).length === devices.length) {
            restartConnection()
          }else if(controllerQueue.length > 0){
            node.doNextOperation();
          }else //read
            readDevices();

        }else{ //successfull read

          //remove error device if present
          if(errors[addr])
          delete errors[addr];

          data.secondaryID = addr;

          emitEvent('mbDeviceUpdated', {data:data});

          if(controllerQueue.length > 0){
            node.doNextOperation();
          }else //read
            readDevices();
        }

      })

    }

    //wraps a function to queue
    function wrapFunction(fn, context, params) {
      return function() {
        fn.apply(context, params);
      };
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

    function emitClose(){
      emitEvent('mbClose', {data: 'Closed', message: 'Connection closed'});
    }

    //Waits operations end before closing the connection, preevents SEGMENTATION FAULT error
    function tryClose(done){
      if(!closeTimeout){
        if(operationRunning){
          closeTimeout = setTimeout(function(){
            closeTimeout = null;
            tryClose(done)
          }, 500);
        }
        else
          close(done)
      }
    }

    //----- CONNECTION MANAGEMENT ------

    function isConnected(){
      return client && client.connect();
    }

    //connect the client
    function connect(){

      //do a connect just if client isn't already started or there is a reconnection
      if((started && !reconnecting) || closed)
      return;

      started = true;

      var mbusOptions = {autoConnect: true};

      if (node.clienttype === 'tcp') {
        mbusOptions.host = node.tcpHost;
        mbusOptions.port = node.tcpPort;
      }else {
        mbusOptions.serialPort = node.serialPort;
        mbusOptions.serialBaudrate = node.serialBaudrate;
      }

      client = new MbusMaster(mbusOptions);

      try {
        client.connect(function(err){

          reconnecting = false; //re-enable reconnection

          if(err){
            emitEvent('mbError', {data: err.message, message: 'Error while connecting ' + err.message});
            restartConnection();
          }
          else{
            emitEvent('mbConnect', {message: 'Connected'});

            if(node.storeDevices)
            loadDevices(true);
            else
            delayFunction(scanSecondary);
          }
        });
      } catch (e) {
        emitEvent('mbError', {data: e.message, message: 'Exception while connecting ' + e.message});
        reconnecting = false;
        restartConnection();
      }
    }

    //close the client
    function close(cb){
      if (client) {
        try {
          client.close(function (err) {
            if(err)
            emitEvent('mbError', {data: err.message, message: 'Error while closing client ' + err.message});
          });
        } catch (e) {
          emitEvent('mbError', {data: e.message, message: 'Exception while closing client ' + e.message});
        }finally{
          emitClose();
          cb()
        }
      }else{
        emitClose()
        cb()
      }
    }

    function restartConnection(){

      //stop reconnection if node is being closed or there is a reconnection in progress
      if(closed || reconnecting)
        return;

      reconnecting = true;

      emitEvent('mbReconnect', { message: 'Restarting client...' })

      reconnectTimeout = setTimeout(function(){
        tryClose(function(){
          connect();
        });
      }, RECONNECT_TIMEOUT);
    }

    //----- M-BUS METHODS ------

    //get device addr data
    function getData(addr, cb){

      if(closed || !isConnected()){
        cb('Connection not open', null)
        return;
      }

      operationRunning = true;

      try{
        client.getData(addr, function(err, data){
          operationRunning = false;
          cb(err,data);
        });

      } catch (e) {
        operationRunning = false;
        cb(e, null)
      }
    }

    //scan secondary IDs
    function scanSecondary(cb){

      if(closed || !isConnected()){
        cb('Connection not open', null)
        return;
      }

      emitEvent('mbScan', {message: 'Scan started...'});

      operationRunning = true;

      try {

        client.scanSecondary(function(err, data) {
          operationRunning = false;
          if(cb){
            cb(err,data)
          }
          else if(err){
            emitEvent('mbError', {data:err.message, message: 'Error while scanning ' + err.message});
            restartConnection()
          }
          else{
            emitEvent('mbScanComplete', {data:data});
          }
        });

      } catch (e) {
        operationRunning = false;
        emitEvent('mbError', {data: e.message, message: 'Exception while scanning ' + e.message});
        restartConnection()
      }
    }


    //--------------------------------------------------------------------------
    //-------- PUBLIC FUNCTIONS ------------------------------------------------
    //--------------------------------------------------------------------------

    //add a command to queue
    node.queueOperation = function(functionName, data){

      var fn;

      try {
        fn = eval(functionName)
      } catch (e) {
        emitEvent('mbError', {data: e.message, message: 'Exception while queuing command ' + e.message});
      }

      if(fn)
      controllerQueue.push({
        fn: wrapFunction(fn, node, data),
        args: data,
        name: functionName
      });

      if(controllerQueue.length > MAX_QUEUE_DIM)
        controllerQueue.shift();
    }

    //dequeue a command or restart reading devices if no more commands in queue
    node.doNextOperation = function(){
      if(controllerQueue.length > 0){ //there are operation in queue
        var op = controllerQueue.shift();

        var fnName = op.name;
        var message = "Executing command: ";

        switch (fnName) {
          case 'getData':
          message += 'getDevice ID=' + (op.args ? op.args[0] : 'null');
          break;
          case 'scanSecondary':
          message += 'scan'
          break;
        }

        emitEvent('mbCommandExec', {data: message, message: message});

        op.fn();
      }
      else //no more queued operations, restart reads
      readDevices();
    }

    //gewt devices data and errors
    node.getStats = function(){
      return {devices: devicesData, errors: errors}
    }

    //get currently status or 'closed'
    node.getStatus = function(){
      return lastStatus || {event: 'mbClose'};
    }

    node.restart = function(){
      restartConnection();
    }

    //--------------------------------------------------------------------------
    //-------- NODE EVENTS -----------------------------------------------------
    //--------------------------------------------------------------------------

    node.on('mbScanComplete', function(data){
      devices = data;

      if(node.storeDevices)
        storeDevices();

      readDevices();
    });

    node.on('mbDeviceUpdated', function(data){
      var id = data ? data.secondaryID : null;
      if(id){
        devicesData[id] = data;
        devicesData[id].lastUpdate = new Date();
        devicesData[id].error = 'Ok';
      }
    });

    //triggered when node is removed or project is redeployed
    node.on('close', function (done) {

      //init private vars

      devices = [];
      errors = {};
      devicesData = {};
      updateIndex = 0;
      started = false;
      lastStatus = null;
      controllerQueue = [];

      closed = true;

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
      tryClose(done);

    }); //end on 'close'

    //start the client (don't use connect here, will stuck the process)
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
