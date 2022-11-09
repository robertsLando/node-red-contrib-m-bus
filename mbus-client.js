module.exports = function init(RED) {
  const clientEvents = {
    mbError: 'error',
    mbClose: 'log',
    mbConnect: 'log',
    mbReconnect: 'debug',
    mbScan: 'debug',
    mbPrimarySet: 'debug',
    mbScanComplete: 'debug',
    mbDeviceUpdated: 'debug',
    mbDevicesLoaded: 'debug',
    mbCommandExec: 'debug',
    mbCommandDone: 'debug',
  };

  function MbusClientNode(config) {
    RED.nodes.createNode(this, config);

    const MbusMaster = require('node-mbus');
    const jsonfile = require('jsonfile');
    const DEVICES_FILE = 'mbus_devices';
    const PRIMARY_ID = 'Primary_';
    const DELAY_TIMEOUT = 3000;
    const MAX_QUEUE_DIM = 10;
    const node = this;

    const emptyDevice = { SlaveInformation: {}, DataRecord: [], error: 'Not Updated' };

    // POLYFILL
    if (!Array.isArray) {
      Array.isArray = (arg) => Object.prototype.toString.call(arg) === '[object Array]';
    }

    // ----- NODE CONFIGURATION VARS --------------------------------------------

    const RECONNECT_TIMEOUT = parseInt(config.reconnectTimeout) || 5000;

    node.name = config.name;

    node.clienttype = config.clienttype;

    node.tcpHost = config.tcpHost;
    node.tcpPort = parseInt(config.tcpPort) || 10001;
    node.tcpTimeout = parseInt(config.tcpTimeout) || 4000;

    node.serialPort = config.serialPort;
    node.serialBaudrate = config.serialBaudrate;

    node.storeDevices = config.storeDevices;
    node.disableLogs = config.disableLogs;
    node.autoScan = config.autoScan !== false;

    // ----- PRIVATE VARS -------------------------------------------------------

    let client = null;
    let lastStatus = null;

    let reconnectTimeout = null;
    let delayTimeout = null;
    const closeTimeout = null;

    let started = false;
    let closed = false;
    let reconnecting = false;
    let doingOperation = false;

    // data
    let devices = [];
    let errors = {};
    let devicesData = {};
    let updateIndex = 0;
    let controllerQueue = [];

    //--------------------------------------------------------------------------
    // -------- PRIVATE FUNCTIONS -----------------------------------------------
    //--------------------------------------------------------------------------

    // ----- UTILS -----

    // store new devices configuration
    function storeDevices() {
      jsonfile.writeFile(devicesFile(), devices, (err) => {
        if (err) emitEvent('mbError', { data: err.message, message: `Error while writing devices file ${err.message}` });
      });
    }

    // load devices from file
    function loadDevices(scanIfFail) {
      jsonfile.readFile(devicesFile(), (err, data) => {
        if (err) emitEvent('mbError', { data: err.message, message: `Error while reading devices file ${err.message}` });

        if (isValidArray(data)) {
          emitEvent('mbDevicesLoaded', { data });
        } else if (scanIfFail) {
          delayFunction(scanSecondary);
        }
      });
    }

    // Add empty device if it has errors since first read
    function addEmptyDevice(id) {
      const tmp = JSON.parse(JSON.stringify(emptyDevice));
      if (isSecondaryID(id)) {
        tmp.secondaryID = id;
        id = parseSecondaryID(id);
      } else {
        tmp.primaryID = id;
        id = PRIMARY_ID + id;
      }

      devicesData[id] = tmp;

      return tmp;
    }

    // returns the filepath for storing/retriving devices list file. Example: /home/pi/.node-red
    function devicesFile() {
      return `${RED.settings.userDir}/${DEVICES_FILE}${node.name ? `_${node.name}` : ''}.json`;
    }

    // return a device by using his secondary or primary id
    function getDevice(addr) {
      let device;

      if (isSecondaryID(addr)) {
        device = devicesData[parseSecondaryID(addr)];
      } else if (devicesData[PRIMARY_ID + addr]) {
        device = devicesData[PRIMARY_ID + addr];
      } else {
        for (const id in devicesData) {
          if (devicesData[id].primaryID === addr) {
            device = devicesData[id];
            break;
          }
        }
      }

      return device;
    }

    function parseSecondaryID(id) {
      id = id.toString().substr(0, 8);
      id = parseInt(id); // remove leading 0
      return id.toString();
    }

    function isSecondaryID(id) {
      return id.toString().length === 16;
    }

    // Delay a function
    function delayFunction(fun) {
      delayTimeout = setTimeout(fun, DELAY_TIMEOUT);
    }

    // Check devices array is valid (just contains numbers or strings)
    function isValidArray(data) {
      if (!Array.isArray(data)) {
        return false;
      }

      for (let i = 0; i < data.length; i++) {
        if (typeof data[i] !== 'string' && typeof data[i] !== 'number') return false;
      }

      return true;
    }

    // read next device
    function readDevices() {
      if (closed) {
        emitClose();
        return;
      }

      if (!node.autoScan) return;

      if (!devices || devices.length === 0) {
        emitEvent('mbError', { data: 'No device to update', message: 'No device to update' });
        return;
      }

      // all devices read, restart from 0
      if (updateIndex >= devices.length) updateIndex = 0;

      const addr = devices[updateIndex];

      getData(addr, (err, data) => {
        // move index to next (even if there is an error)
        updateIndex++;

        if (err) {
          errors[addr] = true;

          // all devices have an error, restart connection
          if (Object.keys(errors).length === devices.length) {
            restartConnection();
          } else node.doNextOperation();
        } else { // successfull read
          // remove error device if present
          if (errors[addr]) delete errors[addr];

          node.doNextOperation();
        }
      });
    }

    // wraps a function to queue
    function wrapFunction(fn, context, params) {
      return () => {
        fn.apply(context, params);
      };
    }

    // emit an event with data and log it if it contains a message
    function emitEvent(event, data) {
      const logEvent = clientEvents[event];
      if (logEvent) {
        lastStatus = { event, data };
        if (data && data.data) {
          node.emit(event, data.data);
        } else {
          node.emit(event);
        }

        if (data && data.message && !node.disableLogs) node[logEvent](data.message);
      }
    }

    function emitClose() {
      emitEvent('mbClose', { data: 'Closed', message: 'Connection closed' });
    }

    // ----- CONNECTION MANAGEMENT ------

    function isConnected() {
      return client && client.connect();
    }

    function initDevices() {
      if (devices) {
        for (let i = 0; i < devices.length; i++) {
          addEmptyDevice(devices[i]);
        }
      }
    }

    // connect the client
    function connect() {
      // do a connect just if client isn't already started or there is a reconnection
      if ((started && !reconnecting) || closed) return;

      started = true;

      const mbusOptions = { autoConnect: true };

      if (node.clienttype === 'tcp') {
        mbusOptions.host = node.tcpHost;
        mbusOptions.port = node.tcpPort;
        mbusOptions.timeout = node.tcpTimeout;
      } else {
        mbusOptions.serialPort = node.serialPort;
        mbusOptions.serialBaudrate = node.serialBaudrate;
      }

      client = new MbusMaster(mbusOptions);

      try {
        client.connect((err) => {
          reconnecting = false; // re-enable reconnection

          if (err) {
            emitEvent('mbError', { data: err.message, message: `Error while connecting ${err.message}` });
            restartConnection();
          } else {
            emitEvent('mbConnect', { message: 'Connected' });

            if (node.autoScan) {
              if (node.storeDevices) loadDevices(true);
              else delayFunction(scanSecondary);
            }
          }
        });
      } catch (e) {
        emitEvent('mbError', { data: e.message, message: `Exception while connecting ${e.message}` });
        reconnecting = false;
        restartConnection();
      }
    }

    // close the client
    function close(cb) {
      if (client) {
        client.close((err) => {
          if (err) emitEvent('mbError', { data: err.message, message: `Error while closing client ${err.message}` });

          emitClose();
          cb();
        });
      } else {
        emitClose();
        cb();
      }
    }

    function restartConnection() {
      // stop reconnection if node is being closed or there is a reconnection in progress
      if (closed || reconnecting) return;

      reconnecting = true;

      emitEvent('mbReconnect', { message: 'Restarting client...' });

      reconnectTimeout = setTimeout(() => {
        close(() => {
          connect();
        });
      }, RECONNECT_TIMEOUT);
    }

    // ----- M-BUS METHODS ------

    function canDoOperation() {
      if (reconnecting || closed || !isConnected() || closeTimeout) {
        return false;
      }

      return true;
    }

    // get device addr data by primary or secondary ID
    function getData(addr, cb) {
      if (!canDoOperation()) {
        if (cb) cb(new Error('Connection not open'), null);
        emitEvent('mbError', { data: 'Connection not open', message: `Error while reading device ${addr}: Connection not open` });
        return;
      }

      client.getData(addr, (err, data) => {
        let device = getDevice(addr);

        if (err) {
          emitEvent('mbError', { data: err.message, message: `Error while reading device ${addr}: ${err.message}` });

          // add an empty device so I know if it has an error
          if (!device) device = addEmptyDevice(addr);

          device.lastUpdate = new Date();
          device.error = err.message;
        } else { // successfull read
          const id = data.SlaveInformation.Id;

          if (isSecondaryID(addr)) {
            data.secondaryID = addr;
          } else {
            data.primaryID = addr;
          }

          if (!devicesData[id]) { // add the new device
            devicesData[id] = data;
          } else { // update the existing one
            // scanned using primary id
            if (data.primaryID && devicesData[PRIMARY_ID + data.primaryID]) {
              // there isn't any device with this id
              if (!devicesData[id]) {
                devicesData[id] = JSON.parse(
                  JSON.stringify(devicesData[PRIMARY_ID + data.primaryID]),
                );
              }

              delete devicesData[PRIMARY_ID + data.primaryID];
            }

            // update id
            if (data.primaryID) {
              devicesData[id].primaryID = data.primaryID;
            } else {
              devicesData[id].secondaryID = data.secondaryID;
            }

            devicesData[id].SlaveInformation = data.SlaveInformation;
            devicesData[id].DataRecord = data.DataRecord;
          }

          // update last update and remove error
          devicesData[id].lastUpdate = new Date();
          devicesData[id].error = null;

          // the device to return to the callback
          device = devicesData[id];

          emitEvent('mbDeviceUpdated', { data: device });
        }

        if (cb) cb(err, device);
      });
    }

    // get device addr data
    function setPrimary(oldAddr, newAddr, cb) {
      if (!canDoOperation()) {
        if (cb) cb(new Error('Connection not open'), null);
        emitEvent('mbError', { data: 'Connection not open', message: `Error while setting primary address ${newAddr} to ${oldAddr}: Connection not open` });
        return;
      }

      client.setPrimaryId(oldAddr, newAddr, (err) => {
        if (cb) cb(err);

        if (err) {
          emitEvent('mbError', { data: err.message, message: `Error while setting primary address ${newAddr} to ${oldAddr}: ${err.message}` });
        } else { // successfull read
          emitEvent('mbPrimarySet', { data: { old: oldAddr, new: newAddr } });
        }
      });
    }

    // scan secondary IDs
    function scanSecondary(cb) {
      if (!canDoOperation()) {
        if (cb) cb(new Error('Connection not open'), null);
        emitEvent('mbError', { data: 'Connection not open', message: 'Error while scanning: Connection not open' });
        return;
      }

      emitEvent('mbScan', { message: 'Scan started...' });

      client.scanSecondary((err, data) => {
        if (cb) cb(err, data);

        if (err) {
          emitEvent('mbError', { data: err.message, message: `Error while scanning: ${err.message}` });
          restartConnection();
        } else {
          emitEvent('mbScanComplete', { data, message: 'Scan completed' });
        }
      });
    }

    //--------------------------------------------------------------------------
    // -------- PUBLIC FUNCTIONS ------------------------------------------------
    //--------------------------------------------------------------------------

    // add a command to queue
    node.queueOperation = (functionName, data) => {
      let fn;

      try {
        // eslint-disable-next-line no-eval
        fn = eval(functionName);
      } catch (e) {
        emitEvent('mbError', { data: e.message, message: `Exception while queuing command ${e.message}` });
      }

      if (fn) {
        controllerQueue.push({
          fn: wrapFunction(fn, node, data),
          args: data,
          name: functionName,
        });
      }

      if (controllerQueue.length > MAX_QUEUE_DIM) controllerQueue.shift();

      if ((!node.autoScan || devices.length === 0) && !doingOperation) {
        node.doNextOperation();
      }
    };

    // dequeue a command or restart reading devices if no more commands in queue
    node.doNextOperation = () => {
      if (controllerQueue.length > 0) { // there are operation in queue
        const op = controllerQueue.shift();

        doingOperation = true;

        const fnName = op.name;
        let message = 'Executing command: ';

        switch (fnName) {
          case 'setPrimary':
            message += `setPrimary Old=${op.args ? op.args[0] : 'null'} New=${op.args ? op.args[1] : 'null'}`;
            break;
          case 'getData':
            message += `getDevice ID=${op.args ? op.args[0] : 'null'}`;
            break;
          case 'scanSecondary':
            message += 'scan';
            break;
          default:
            message += 'Undefined';
        }

        emitEvent('mbCommandExec', { data: message, message });

        op.fn();
      } else { // no more queued operations, restart reads
        if (node.autoScan) readDevices();

        doingOperation = false;
      }
    };

    // get devices data and errors
    node.getStats = () => ({ devices: devicesData, errors });

    // get currently status or 'closed'
    node.getStatus = () => lastStatus || { event: 'mbClose' };

    node.restart = () => {
      restartConnection();
    };

    node.setDevices = (data) => {
      devices = data;
      storeDevices();

      restartConnection();
    };

    // check for registered nodes using configuration
    node.registeredNodeList = {};

    node.registerForMbus = (mbusNode) => {
      node.registeredNodeList[mbusNode.id] = mbusNode;
      if (Object.keys(node.registeredNodeList).length === 1) {
        node.isClosing = false;
        // start the client (don't use connect here, will stuck the process)
        restartConnection();
      }
    };

    //--------------------------------------------------------------------------
    // -------- NODE EVENTS -----------------------------------------------------
    //--------------------------------------------------------------------------

    node.on('mbScanComplete', (data) => {
      devices = data;
      initDevices();

      if (node.storeDevices) storeDevices();

      readDevices();
    });

    node.on('mbDevicesLoaded', (data) => {
      devices = data;
      initDevices();
      delayFunction(readDevices);
    });

    // triggered when node is removed or project is redeployed
    node.on('close', (done) => {
      // init private vars

      devices = [];
      errors = {};
      devicesData = {};
      updateIndex = 0;
      started = false;
      lastStatus = null;
      controllerQueue = [];

      closed = true;

      // stop running timeouts

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (delayTimeout) {
        clearTimeout(delayTimeout);
        delayTimeout = null;
      }

      // close client
      close(done);
    }); // end on 'close'
  }

  RED.nodes.registerType('mbus-client', MbusClientNode);

  RED.httpAdmin.get('/mbus/serial/ports', RED.auth.needsPermission('serial.read'), async (req, res) => {
    const SerialPort = require('serialport');

    try {
      const ports = await SerialPort.list();
      res.json(ports);
    } catch (error) {
      res.json([]);
      // eslint-disable-next-line no-console
      console.error(error);
    }
  });
};
