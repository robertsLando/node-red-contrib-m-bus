# node-red-contrib-m-bus
![Logo](images/mbus.png)

[![NPM version](http://img.shields.io/npm/v/node-red-contrib-m-bus.svg)](https://www.npmjs.com/package/node-red-contrib-m-bus)
[![Downloads](https://img.shields.io/npm/dm/node-red-contrib-m-bus.svg)](https://www.npmjs.com/package/node-red-contrib-m-bus)

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![MIT Licence](https://badges.frapsoft.com/os/mit/mit.png?v=103)](https://opensource.org/licenses/mit-license.php)

[![NPM](https://nodei.co/npm/node-red-contrib-m-bus.png?downloads=true)](https://nodei.co/npm/node-red-contrib-m-bus/)

# Decription

Node-Red node that uses [node-mbus](https://github.com/Apollon77/node-mbus) to communicate with mbus devices via serial or TCP connections.

#### \*\*THIS PACKAGE IS STILL UNDER DEVELOPMENT\*\*

# Install

Run the following command in the root directory of your Node-RED install

    npm install node-red-contrib-modbus

# Nodes

This package will add a new set of nodes in your node palette:

### mbus-client

Configuration node that manage the M-Bus client connection. Once a client is inited it will try to open the SERIAL/TCP connection with provided configuration, if it fails it keeps retry every `reconnectTimeout` milliseconds. Once the connection is opened it scans the M-Bus network (via secondary IDs) to find all connected devices. Once the scan is done (**it can takes many minutes, depends on the number of total meters in the network**) it will emit the event `mbScanComplete` with the array of secondary IDs found:

```javascript
['11490378', '11865378', '11497492']
```

Once the scan is completed it will start reading all devices one by one to update values, every time a device will be updated it will emit the event `mbDeviceUpdated` with the new updated device info

```javascript
{
  "SlaveInformation": {
    "Id": 11490378,
    "Manufacturer": "ACW",
    "Version": 14,
    "ProductName": "Itron BM +m",
    "Medium": "Cold water",
    "AccessNumber": 41,
    "Status": 0,
    "Signature": 0
  },
  "DataRecord": [
    {
      "id": 0,
      "Function": "Instantaneous value",
      "StorageNumber": 0,
      "Unit": "Fabrication number",
      "Value": 11490378,
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 1,
      "Function": "Instantaneous value",
      "StorageNumber": 0,
      "Unit": "Volume (m m^3)",
      "Value": 54321,
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 2,
      "Function": "Instantaneous value",
      "StorageNumber": 1,
      "Unit": "Time Point (date)",
      "Value": "2000-00-00",
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 3,
      "Function": "Instantaneous value",
      "StorageNumber": 1,
      "Unit": "Volume (m m^3)",
      "Value": 0,
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 4,
      "Function": "Instantaneous value",
      "StorageNumber": 0,
      "Unit": "Time Point (time & date)",
      "Value": "2012-01-24T13:29:00",
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 5,
      "Function": "Instantaneous value",
      "StorageNumber": 0,
      "Unit": "Operating time (days)",
      "Value": 0,
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 6,
      "Function": "Instantaneous value",
      "StorageNumber": 0,
      "Unit": "Firmware version",
      "Value": 2,
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 7,
      "Function": "Instantaneous value",
      "StorageNumber": 0,
      "Unit": "Software version",
      "Value": 6,
      "Timestamp": "2018-02-24T22:17:01"
    },
    {
      "id": 8,
      "Function": "Manufacturer specific",
      "Value": "00 00 8F 13",
      "Timestamp": "2018-02-24T22:17:01"
    }
  ]
}
```

If property `storeDevices` is set to true, once connected, the client will check for existing devices json file `mbus_devices.json` that is stored in `.node-red` dir. If it is a valid `Array` of `string` or `Number` it will start reading devices and so the scan is skipped.

Other **mbus-client** events are:

* *mbConnected*: when the connection has been successfully opened
* *mbClosed*: when the connection has been closed
* *mbError*: when an error occurs (with error message as argument)
* *mbRestarted*: when the client is restarted
* *mbScan*: when the scan starts


### mbus-out

This node will subscribe to a M-Bus client events and will output messages on `mbScanComplete`, `mbDeviceUpdated` and `mbDevicesLoaded` events with data in `msg.payload` and the event name in `msg.topic`.


# Authors

[Daniel Lando](https://github.com/robertsLando)
