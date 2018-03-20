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

    npm install node-red-contrib-m-bus --save

# Hardware needed

You need an M-Bus-Serial or an M-Bus-Ethernet (TCP) converter.

# Nodes

This package will add a new set of nodes in your node palette.

### mbus-client

Configuration node that manage the M-Bus client connection. Once a client is inited it will try to open the SERIAL/TCP connection with provided configuration, if it fails it keeps retry every `reconnectTimeout` milliseconds. Once the connection is opened it scans the M-Bus network (via secondary IDs) to find all connected devices. Once the scan is done (**it can takes many minutes, depends on the number of total meters in the network**) it will emit the event `mbScanComplete` with the array of secondary IDs found:

```json
["11490378", "11865378", "11497492"]
```

Once the scan is completed it will start reading all devices one by one to update values, every time a device will be updated it will emit the event `mbDeviceUpdated` with the new updated device info

```json
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

If property `storeDevices` is set to true, once connected, the client will check for existing devices json file `mbus_devices.json` that is stored in `.node-red` dir. If it is a valid `Array` of `string`s or `Number`s, once it is successfuly loaded, client will emit `mbDevicesLoaded` event and than start reading devices (scan is skipped so the init process is quicker in this way).

Other **mbus-client** events are:

* *mbConnected*: when the connection has been successfully opened
* *mbClosed*: when the connection has been closed
* *mbError*: when an error occurs (with error message as argument)
* *mbRestarted*: when the client is restarted
* *mbScan*: when the scan starts


### mbus-out

This node will subscribe to a M-Bus client events and will output messages on `mbScanComplete`, `mbDeviceUpdated` and `mbDevicesLoaded` events with data in `msg.payload` and the event name in `msg.topic`.

### mbus-controller

This node is used to send commands to an M-Bus client. `msg.topic` must contains command name and `msg.payload` tha command data. Allowed commands are:

* *scan*: Start a scan of devices. Will return an `Array` of `string`s with found devices secondary IDs
* *getDevices*: Will return an `Object` as `msg.payload` with two properties:
  * **devices**: `Object` where keys are devices secondary IDs and values are devices data.
  * **errors**: `Object` where keys are devices secondary IDs and values are `true` if devices has an error
* *getDevice*: Input `msg.payload.address` must contain the address (primary or secondary) of the device to read. Output will contain requested device datas.
* *restart*: Restarts the client connection.

**IMPORTANT NOTE**

Every command is queued, **M-Bus is really slow** and takes around 10 second for each read, many minutes for a scan, **don't send repeated commands** but wait for the response. Max commands queue is set to 10 commands, after the limit is reached the new command will be pushed in queue and the 'oldest' command in queue will be removed.

# M-Bus Dashboard Flow

### Flow  

Remember to change client settings based on your connection parameters

![MBusFlow](images/mbus_flow.png)

### Dashboard

Click on a m-bus device row and his data will be displayed in the Data table. Devices get update every 1 minute.

![MBusDashboard](images/mbus_dashboard.png)

### Flow data

```json
[{"id":"91f58b94.449f68","type":"tab","label":"M-Bus","disabled":false,"info":""},{"id":"dd877b81.954e48","type":"mbus-out","z":"91f58b94.449f68","name":"","client":"ae5a755.a1da088","x":385,"y":163,"wires":[["3baf7067.f14cb"]]},{"id":"3baf7067.f14cb","type":"debug","z":"91f58b94.449f68","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"false","x":677,"y":163,"wires":[]},{"id":"c052251a.5894f8","type":"mbus-controller","z":"91f58b94.449f68","name":"","client":"ae5a755.a1da088","x":423,"y":253,"wires":[["b83f6e57.3e9b3","4628e1e6.86c15"]]},{"id":"6783da7a.66a964","type":"inject","z":"91f58b94.449f68","name":"scan","topic":"scan","payload":"","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":136,"y":206,"wires":[["c052251a.5894f8"]]},{"id":"b83f6e57.3e9b3","type":"debug","z":"91f58b94.449f68","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"false","x":694,"y":254,"wires":[]},{"id":"36145d27.8fa442","type":"inject","z":"91f58b94.449f68","name":"Read ID 1","topic":"getDevice","payload":"{\"address\": 1}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":145,"y":252,"wires":[["c052251a.5894f8"]]},{"id":"161119a5.ed03b6","type":"inject","z":"91f58b94.449f68","name":"Get Devices","topic":"getDevices","payload":"","payloadType":"str","repeat":"60","crontab":"","once":true,"onceDelay":0.1,"x":164,"y":295,"wires":[["c052251a.5894f8"]]},{"id":"4628e1e6.86c15","type":"ui_template","z":"91f58b94.449f68","group":"33ef59b3.4b5596","name":"mbus-table","order":0,"width":"14","height":"10","format":"<table>\n  <tr>\n    <th>ID</th>\n    <th>Info</th>\n    <th>Data</th>\n    <th>Last Update</th>\n    <th>Status</th>\n  </tr>\n  <tr style=\"cursor:pointer;\" ng-click=\"showData(device)\" ng-repeat=\"(ID, device) in devices\">\n    <td>{{ ID }}</td>\n    <td ng-bind-html=\"getInfo(device)\"></td>\n    <td>{{ device.DataRecord.length }}</td>\n    <td>{{ device.lastUpdate }}</td>\n    <td><div class=\"online\" ng-style=\"{background: isOnline(ID) ? '#4CAF50' : '#f44336'}\"></div></td>\n  </tr>\n</table>\n\n<style>\ntable {\n    border-collapse: collapse;\n    width: 100%;\n}\n\nth, td{\n    text-align: left;\n    padding: 8px;\n    background-color: #f2f2f2;\n    color: black;\n}\n\nth {\n    background-color: #4CAF50;\n    color: white;\n}\n\n.online {\n\tbackground:#ff3333;\n\twidth:20px;\n\theight:20px;\n\tmargin:0 auto;\n\t-webkit-border-radius:50%;\n\t-moz-border-radius:50%;\n\tborder-radius:50%;\n}\n</style>\n\n<script>\n\n\n(function(scope) {\n    \n    scope.send({topic: 'getDevices'});\n    scope.devices = [];\n    scope.errors = [];\n    \n    scope.isOnline = function(ID){\n        return !(scope.errors[ID] === true);\n    }\n    \n    scope.showData = function(device){\n        scope.send({topic: 'deviceData', payload: device});\n    }\n    \n    scope.getInfo = function(device){\n        var text = '';\n        var info = device.SlaveInformation;\n        \n        for(key in info){\n            text += `<p><b>${key}</b>: ${info[key]}</p>`;\n        }\n        \n        return text;\n    }\n\n    scope.$watch('msg', function(data) {\n        if(data && data.topic){\n            switch(data.topic){\n                case \"getDevices\":\n                    if(data.payload && data.payload.devices)\n                        scope.devices = data.payload.devices;\n                        \n                    if(data.payload && data.payload.errors)\n                        scope.errors = data.payload.errors;\n                        \n                break;\n            }\n        }\n    });\n    \n})(scope);\n\n</script>\n","storeOutMessages":false,"fwdInMessages":false,"templateScope":"local","x":752,"y":324,"wires":[["daf4f19d.2953f"]]},{"id":"1bbe4b3c.e76775","type":"inject","z":"91f58b94.449f68","name":"restart","topic":"restart","payload":"","payloadType":"num","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":133,"y":338,"wires":[["c052251a.5894f8"]]},{"id":"daf4f19d.2953f","type":"ui_template","z":"91f58b94.449f68","group":"f84bb8e1.c42128","name":"data-table","order":0,"width":"14","height":"10","format":"<p>Device ID: {{ID}} </p>\n\n<table>\n  <tr>\n    <th>ID</th>\n    <th>Function</th>\n    <th>Unit</th>\n    <th>Value</th>\n    <th>Timestamp</th>\n  </tr>\n  <tr ng-repeat=\"(key, data) in deviceData\">\n    <td>{{ data.id }}</td>\n    <td>{{ data.Function }}</td>\n    <td>{{ data.Unit }}</td>\n    <td>{{ data.Value }}</td>\n    <td>{{ data.Timestamp }}</td>\n  </tr>\n</table>\n\n<style>\ntable {\n    border-collapse: collapse;\n    width: 100%;\n}\n\nth, td{\n    text-align: left;\n    padding: 8px;\n    background-color: #f2f2f2;\n    color: black;\n}\n\nth {\n    background-color: #4CAF50;\n    color: white;\n}\n\n.online {\n\tbackground:#ff3333;\n\twidth:20px;\n\theight:20px;\n\tmargin:0 auto;\n\t-webkit-border-radius:50%;\n\t-moz-border-radius:50%;\n\tborder-radius:50%;\n}\n</style>\n\n<script>\n\n\n(function(scope) {\n    \n    scope.deviceData = [];\n    scope.ID = '';\n\n    scope.$watch('msg', function(data) {\n        if(data && data.topic){\n            switch(data.topic){\n                case \"deviceData\":\n                    if(data.payload){\n                        scope.deviceData = data.payload.DataRecord;\n                        scope.ID = data.payload.SlaveInformation.Id;\n                    }\n                break;\n            }\n        }\n    });\n    \n})(scope);\n\n</script>\n","storeOutMessages":false,"fwdInMessages":false,"templateScope":"local","x":981,"y":324,"wires":[[]]},{"id":"54eb2609.265918","type":"inject","z":"91f58b94.449f68","name":"Read ID 2","topic":"getDevice","payload":"{\"address\": 2}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":134,"y":400,"wires":[["c052251a.5894f8"]]},{"id":"ae5a755.a1da088","type":"mbus-client","z":"","name":"test","clienttype":"serial","tcpHost":"127.0.0.1","tcpPort":"500","serialPort":"/dev/ttyUSB0","serialBaudrate":"2400","reconnectTimeout":"5000","storeDevices":true,"disableLogs":false},{"id":"33ef59b3.4b5596","type":"ui_group","z":"","name":"M-Bus Devices","tab":"1e8e0541.4fc61b","order":4,"disp":true,"width":"14","collapse":false},{"id":"f84bb8e1.c42128","type":"ui_group","z":"","name":"Data","tab":"1e8e0541.4fc61b","disp":true,"width":"14","collapse":false},{"id":"1e8e0541.4fc61b","type":"ui_tab","z":"","name":"M-Bus","icon":"plug","order":1}]
```

# Authors

[Daniel Lando](https://github.com/robertsLando)
