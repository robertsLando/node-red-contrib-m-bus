
module.exports = function (RED) {
  'use strict'

  var clientEvents = {
    'mbError': 'error',
    'mbClose': 'log',
    'mbConnect': 'log',
    'mbReconnect': 'debug',
    'mbScan': 'debug',
    'mbPrimarySet': 'debug',
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
    let UNKNOWN_DEVICE = 'Unknown_';
    let DELAY_TIMEOUT = 3000;
    let MAX_QUEUE_DIM = 10;
    let node = this

    var emptyDevice = {SlaveInformation : {}, DataRecord: [], error: "Not Updated"};

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
    node.autoScan = config.autoScan === false ? false : true;

    //----- PRIVATE VARS -------------------------------------------------------

    var client = null
    var lastStatus = null

    var reconnectTimeout = null
    var delayTimeout = null
    var closeTimeout = null;

    var started = false
    var closed = false
    var reconnecting = false
    var doingOperation = false

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
        }else if(scanIfFail){
          delayFunction(scanSecondary);
        }
      })
    }

    //Add empty device if it has errors since first read
    function addEmptyDevice(id){
      var tmp = JSON.parse(JSON.stringify(emptyDevice));
      if(isSecondaryID(id)){
        tmp.secondaryID = id;
        id = parseSecondaryID(id);
      }else{
        tmp.primaryID = id;
        id = UNKNOWN_DEVICE + id;
      }

      devicesData[id] = tmp;

      return tmp;
    }

    //return a device by using his secondary or primary id
    function getDevice(addr){
      var device;

      if(isSecondaryID(addr)){
        device = devicesData[parseSecondaryID(addr)];
      }
      else if(devicesData[UNKNOWN_DEVICE+addr]){
        device = devicesData[UNKNOWN_DEVICE+addr];
      }
      else{
        for(var id in devicesData){
          if(devicesData[id].primaryID == addr){
            device = devicesData[id];
            break;
          }
        }
      }

      return device;

    }

    function parseSecondaryID(id){
      id = id.toString().substr(0,8);
      id = parseInt(id); //remove leading 0
      return id.toString();
    }

    function isSecondaryID(id){
      return id.toString().length == 16;
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

      if(!node.autoScan) return;

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

          errors[addr] = true;

          //all devices have an error, restart connection
          if (Object.keys(errors).length === devices.length) {
            restartConnection()
          }else
            node.doNextOperation();

        }else{ //successfull read

          //remove error device if present
          if(errors[addr])
          delete errors[addr];

          node.doNextOperation();
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

    //----- CONNECTION MANAGEMENT ------

    function isConnected(){
      return client && client.connect();
    }

    function initDevices(){
      if(devices){
        for (var i = 0; i < devices.length; i++) {
          addEmptyDevice(devices[i]);
        }
      }
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

            if(node.autoScan){
              if(node.storeDevices)
                loadDevices(true);
              else
                delayFunction(scanSecondary);
            }
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
        client.close(function (err) {
          if(err)
          emitEvent('mbError', {data: err.message, message: 'Error while closing client ' + err.message});

          emitClose();
          cb();

        });
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
        close(function(){
          connect();
        });
      }, RECONNECT_TIMEOUT);
    }

    //----- M-BUS METHODS ------

    function canDoOperation(){
      if(reconnecting || closed || !isConnected() || closeTimeout){
        return false;
      }

      return true;
    }

    //get device addr data by primary or secondary ID
    function getData(addr, cb){

      if(!canDoOperation()){
        if(cb) cb(new Error('Connection not open'), null)
        emitEvent('mbError', {data: 'Connection not open', message: 'Error while reading device ' + addr + ': ' + 'Connection not open'});
        return;
      }

      client.getData(addr, function(err, data){

        var device = getDevice(addr);

        if (err) {
          emitEvent('mbError', {data: err.message, message: 'Error while reading device ' + addr + ': ' + err.message});

          //add an empty device so I know if it has an error
          if(!device)
            device = addEmptyDevice(addr)

          device.lastUpdate = new Date();
          device.error = err.message;

        }else{ //successfull read

          var id = data.SlaveInformation.Id;

          isSecondaryID(addr) ? data.secondaryID = addr : data.primaryID = addr;

          if(!devicesData[id]){ //add the new device
            devicesData[id] = data;
          }else{ //update the existing one

            //scanned using primary id
            if(data.primaryID && devicesData[UNKNOWN_DEVICE + data.primaryID]){

              //there isn't any device with this id
              if(!devicesData[id])
                devicesData[id] = JSON.parse(JSON.stringify(devicesData[UNKNOWN_DEVICE + data.primaryID]));

              delete devicesData[UNKNOWN_DEVICE + data.primaryID];
            }

            //update id
            data.primaryID ? devicesData[id].primaryID = data.primaryID : devicesData[id].secondaryID = data.secondaryID;

            devicesData[id].SlaveInformation = data.SlaveInformation;
            devicesData[id].DataRecord = data.DataRecord;
          }

          //update last update and remove error
          devicesData[id].lastUpdate = new Date();
          devicesData[id].error = null;

          //the device to return to the callback
          device = devicesData[id];

          emitEvent('mbDeviceUpdated', {data: device});
        }

        if(cb) cb(err,device);
      });

    }

    //get device addr data
    function setPrimary(oldAddr, newAddr, cb){

      if(!canDoOperation()){
        if(cb) cb(new Error('Connection not open'), null)
        emitEvent('mbError', {data: 'Connection not open', message: 'Error while setting primary address '+ newAddr +' to ' + oldAddr + ': ' + 'Connection not open'});
        return;
      }

      client.setPrimaryId(oldAddr, newAddr, function(err){

        if(cb) cb(err);

        if (err) {
          emitEvent('mbError', {data: err.message, message: 'Error while setting primary address '+ newAddr +' to ' + oldAddr + ': ' + err.message});

        }else{ //successfull read
          emitEvent('mbPrimarySet', {data: {old: oldAddr, new:newAddr}});
        }
      });

    }


    //scan secondary IDs
    function scanSecondary(cb){

      if(!canDoOperation()){
        if(cb) cb(new Error('Connection not open'), null)
        emitEvent('mbError', {data:'Connection not open', message: 'Error while scanning: Connection not open'});
        return;
      }

      emitEvent('mbScan', {message: 'Scan started...'});

      client.scanSecondary(function(err, data) {
        if(cb) cb(err,data);

        if(err){
          emitEvent('mbError', {data:err.message, message: 'Error while scanning: ' + err.message});
          restartConnection()
        }
        else{
          emitEvent('mbScanComplete', {data:data, message: 'Scan completed'});
        }

      });

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

      if((!node.autoScan || devices.length == 0) && !doingOperation){
        node.doNextOperation();
      }
    }

    //dequeue a command or restart reading devices if no more commands in queue
    node.doNextOperation = function(){
      if(controllerQueue.length > 0){ //there are operation in queue
        var op = controllerQueue.shift();

        doingOperation = true;

        var fnName = op.name;
        var message = "Executing command: ";

        switch (fnName) {
          case 'setPrimary':
          message += 'setPrimary Old=' + (op.args ? op.args[0] : 'null') + " New=" + (op.args ? op.args[1] : 'null');
          break;
          case 'getData':
          message += 'getDevice ID=' + (op.args ? op.args[0] : 'null');
          break;
          case 'scanSecondary':
          message += 'scan'
          break;
          default:
          message += "Undefined"
        }

        emitEvent('mbCommandExec', {data: message, message: message});

        op.fn();
      }
      else{ //no more queued operations, restart reads
        if(node.autoScan)
          readDevices();

        doingOperation = false;
      }
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
      initDevices();

      if(node.storeDevices)
        storeDevices();

      readDevices();
    });

    node.on('mbDevicesLoaded', function(data){
      devices = data;
      initDevices();
      delayFunction(readDevices);
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
      close(done);

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
