# node-red-contrib-m-bus
![Logo](images/mbus.png)

[![NPM version](http://img.shields.io/npm/v/node-red-contrib-m-bus.svg)](https://www.npmjs.com/package/node-red-contrib-m-bus)
[![Downloads](https://img.shields.io/npm/dm/node-red-contrib-m-bus.svg)](https://www.npmjs.com/package/node-red-contrib-m-bus)

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![MIT Licence](https://badges.frapsoft.com/os/mit/mit.png?v=103)](https://opensource.org/licenses/mit-license.php)

[![NPM](https://nodei.co/npm/node-red-contrib-m-bus.png?downloads=true)](https://nodei.co/npm/node-red-contrib-m-bus/)

# Description

Node-Red node that uses [node-mbus](https://github.com/Apollon77/node-mbus) to communicate with mbus devices via serial or TCP connections.

# Install

Run the following command in the root directory of your Node-RED install

    npm install node-red-contrib-m-bus --save

# Hardware

You need an M-Bus-Serial or an M-Bus-Ethernet (TCP) converter. Here a list of tested hardwares:

* USB-SERIAL:
  - https://www.adfweb.com/Home/products/mbus_gateway.asp?frompg=nav8_5 (200 Euro)
  - https://m.de.aliexpress.com/item/32755430755.html?trace=wwwdetail2mobilesitedetail&productId=32755430755&productSubject=MBUS-to-USB-master-module-MBUS-device-debugging-dedicated-no-power-supply (30.58 $)
  - https://www.relay.de/produkte/m-bus-master/pegelwandler-pw-250/
* TCP:
  - http://www.adfweb.com/home/products/details.asp?tid=HD67030-B2-80

# Nodes

This package will add a new set of nodes in your node palette.

### mbus-client

Configuration node that manage the M-Bus client connection. Once a client is inited it will try to open the SERIAL/TCP connection with provided configuration, if it fails it keeps retry every `reconnectTimeout` milliseconds. Once the connection is opened it scans the M-Bus network (via secondary IDs) to find all connected devices (if auto scan option is enabled). Once the scan is done (**it can takes many minutes, depends on the number of total meters in the network**) it will emit the event `mbScanComplete` with the array of secondary IDs found:

```json
["11490378", "11865378", "11497492"]
```

Once the scan is completed it will start reading all devices one by one to update values (if auto scan option is enabled), every time a device is updated, the node will emit the event `mbDeviceUpdated` with the new updated device info/data

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

If property `storeDevices` is set to true, once connected, the client will check for existing devices json file `mbus_devices_<clientName>.json` (where `clientName` is the `name` property set in client configuration and **MUST BE UNIQUE IF YOU HAVE MULTIPLE M-BUS CLIENTS**) that is stored in `~/.node-red` dir. If it is a valid `Array` of `string`s or `Number`s, once it is successfuly loaded, client will emit `mbDevicesLoaded` event and than start reading devices (scan is skipped so the init process is quicker in this way).

Other **mbus-client** events are:

* *mbConnected*: when the connection has been successfully opened
* *mbClosed*: when the connection has been closed
* *mbError*: when an error occurs (with error message as argument)
* *mbRestarted*: when the client is restarted
* *mbScan*: when the scan starts
* *mbPrimarySet*: when a device has successfully set a new primary ID


### mbus-out

This node will subscribe to a M-Bus client events and will output messages on `mbScanComplete`, `mbDeviceUpdated` and `mbDevicesLoaded` events with data in `msg.payload` and the event name in `msg.topic`.

### mbus-controller

This node is used to send commands to an M-Bus client. `msg.topic` must contains command name and `msg.payload` tha command data. Allowed commands are:

* *scan*: Start a scan of devices. Will return an `Array` of `string`s with found devices secondary IDs
* *setDevices*: Manually set the array of primary and/or secondary IDs of devices to read. Input: `msg.payload` an Array of `Numbers` and/or `Strings`.
* *getDevices*: Will return an `Object` as `msg.payload` with two properties:
  * **devices**: `Object` where keys are devices secondary IDs and values are devices data.
  * **errors**: `Object` where keys are devices secondary IDs and values are `true` if devices has an error
* *getDevice*: Input `msg.payload.address` must contain the address (primary or secondary) of the device to read. Output will contain requested device datas.
* *setPrimary*: Input: `msg.payload.oldAddr` (primary or secondary ID of the device) and `msg.payload.newAddr`  (the new primary ID to set 0-250). Output will contain the same payload as input if success: `{newAddr: msg.payload.newAddr, oldAddr:msg.payload.oldAddr}`.
* *restart*: Restarts the client connection.

**IMPORTANT NOTE**

Every command is queued, **M-Bus is really slow** and takes around 2/3 to read one device, many minutes for a scan, **don't send repeated commands** but wait for the response. Max commands queue is set to 10 commands, after the limit is reached the new command will be pushed in queue and the 'oldest' command in queue will be removed.

# M-Bus Dashboard Flow

### Flow

Remember to change client settings based on your connection parameters

![MBusFlow](images/mbus_flow.png)

### Dashboard

Click on a m-bus device row and his data will be displayed in the Data table. Devices get update every 10 seconds. If a device has an error just go to the status circle and a tooltip will show the error. Wire the `scanPrimary` function node to the mbus controller and set the Mbus client `autoScan` flag to false to manually scan using primary IDs

![MBusDashboard](images/mbus_dashboard.png)

### Flow data

```json
[{"id":"ade0afc8.6013a","type":"tab","label":"M-Bus_Dashboard","disabled":false,"info":""},{"id":"2cebb543.145dca","type":"mbus-out","z":"ade0afc8.6013a","name":"","client":"bf6a52d7.703c1","x":471,"y":242,"wires":[["1aa1a0.ae47ee6"]]},{"id":"1aa1a0.ae47ee6","type":"debug","z":"ade0afc8.6013a","name":"","active":false,"console":false,"complete":"false","x":690,"y":242,"wires":[]},{"id":"4c5da910.a64938","type":"mbus-controller","z":"ade0afc8.6013a","name":"","client":"bf6a52d7.703c1","x":511,"y":303,"wires":[["8028460d.2b4658","22502fe8.d651e"]]},{"id":"250e511a.e4ccee","type":"inject","z":"ade0afc8.6013a","name":"scan","topic":"scan","payload":"","payloadType":"str","repeat":"","crontab":"","once":false,"x":122,"y":72,"wires":[["4c5da910.a64938"]]},{"id":"8028460d.2b4658","type":"debug","z":"ade0afc8.6013a","name":"","active":false,"console":false,"complete":"false","x":762,"y":361,"wires":[]},{"id":"c4e7a123.e6ba9","type":"inject","z":"ade0afc8.6013a","name":"Read ID 1","topic":"getDevice","payload":"{\"address\": 1}","payloadType":"json","repeat":"","crontab":"","once":false,"x":129,"y":146,"wires":[["4c5da910.a64938"]]},{"id":"326fb021.ee4a7","type":"inject","z":"ade0afc8.6013a","name":"Get Devices","topic":"getDevices","payload":"","payloadType":"str","repeat":"10","crontab":"","once":true,"x":145,"y":220,"wires":[["4c5da910.a64938"]]},{"id":"22502fe8.d651e","type":"ui_template","z":"ade0afc8.6013a","group":"b06b9c66.757c9","name":"mbus-table","order":0,"width":"14","height":"10","format":"<table>\n  <tr>\n    <th>ID</th>\n    <th>Primary ID</th>\n    <th>Info</th>\n    <th>Data</th>\n    <th>Last Update</th>\n    <th>Status</th>\n  </tr>\n  <tr style=\"cursor:pointer;\" ng-click=\"showData(device)\" ng-repeat=\"(id, device) in devices\">\n    <td>{{ device.secondaryID }}</td>\n    <td>{{ device.primaryID }}</td>\n    <td ng-bind-html=\"getInfo(device)\"></td>\n    <td>{{ device.DataRecord.length }}</td>\n    <td>{{ device.lastUpdate }}</td>\n    <td>\n        <div class=\"online\" ng-style=\"{background: !device.error ? '#4CAF50' : '#f44336'}\">\n            <md-tooltip md-direction=\"bottom\">{{ device.error ? device.error : 'OK' }}</md-tooltip>\n        </div>\n    </td>\n  </tr>\n</table>\n\n<style>\ntable {\n    border-collapse: collapse;\n    width: 100%;\n}\n\nth, td{\n    text-align: left;\n    padding: 8px;\n    background-color: #f2f2f2;\n    color: black;\n}\n\nth {\n    background-color: #4CAF50;\n    color: white;\n}\n\n.online {\n\tbackground:#ff3333;\n\twidth:20px;\n\theight:20px;\n\tmargin:0 auto;\n\t-webkit-border-radius:50%;\n\t-moz-border-radius:50%;\n\tborder-radius:50%;\n}\n</style>\n\n<script>\n\n\n(function(scope) {\n    \n    scope.send({topic: 'getDevices'});\n    scope.devices = [];\n    \n    scope.showData = function(device){\n        scope.send({topic: 'deviceData', payload: device});\n    }\n    \n    scope.getInfo = function(device){\n        var text = '';\n        var info = device.SlaveInformation;\n        \n        for(key in info){\n            text += `<p><b>${key}</b>: ${info[key]}</p>`;\n        }\n        \n        return text;\n    }\n\n    scope.$watch('msg', function(data) {\n        if(data && data.topic){\n            switch(data.topic){\n                case \"getDevices\":\n                    if(data.payload && data.payload.devices)\n                        scope.devices = data.payload.devices;\n                break;\n            }\n        }\n    });\n    \n})(scope);\n\n</script>\n","storeOutMessages":false,"fwdInMessages":false,"templateScope":"local","x":708,"y":303,"wires":[["66aaaff2.c67de"]]},{"id":"8d7abf50.fd2f2","type":"inject","z":"ade0afc8.6013a","name":"restart","topic":"restart","payload":"","payloadType":"num","repeat":"","crontab":"","once":false,"x":119,"y":108,"wires":[["4c5da910.a64938"]]},{"id":"66aaaff2.c67de","type":"ui_template","z":"ade0afc8.6013a","group":"f9357905.6d9348","name":"data-table","order":0,"width":"14","height":"10","format":"<p><b>Device ID:</b> {{ID}} </p>\n\n<br>\n<br>\n\n<table>\n  <tr>\n    <th>ID</th>\n    <th>Function</th>\n    <th>Unit</th>\n    <th>Value</th>\n    <th>Timestamp</th>\n  </tr>\n  <tr ng-repeat=\"(key, data) in deviceData\">\n    <td>{{ data.id }}</td>\n    <td>{{ data.Function }}</td>\n    <td>{{ data.Unit }}</td>\n    <td>{{ data.Value }}</td>\n    <td>{{ data.Timestamp }}</td>\n  </tr>\n</table>\n\n<style>\ntable {\n    border-collapse: collapse;\n    width: 100%;\n}\n\nth, td{\n    text-align: left;\n    padding: 8px;\n    background-color: #f2f2f2;\n    color: black;\n}\n\nth {\n    background-color: #4CAF50;\n    color: white;\n}\n\n.online {\n\tbackground:#ff3333;\n\twidth:20px;\n\theight:20px;\n\tmargin:0 auto;\n\t-webkit-border-radius:50%;\n\t-moz-border-radius:50%;\n\tborder-radius:50%;\n}\n</style>\n\n<script>\n\n\n(function(scope) {\n    \n    scope.deviceData = [];\n    scope.ID = '';\n\n    scope.$watch('msg', function(data) {\n        if(data && data.topic){\n            switch(data.topic){\n                case \"deviceData\":\n                    if(data.payload){\n                        scope.deviceData = data.payload.DataRecord;\n                        scope.ID = data.payload.SlaveInformation.Id;\n                    }\n                break;\n            }\n        }\n    });\n    \n})(scope);\n\n</script>\n","storeOutMessages":false,"fwdInMessages":false,"templateScope":"local","x":872,"y":303,"wires":[[]]},{"id":"51b94291.84bbec","type":"inject","z":"ade0afc8.6013a","name":"Read ID 2","topic":"getDevice","payload":"{\"address\": 2}","payloadType":"json","repeat":"","crontab":"","once":false,"x":130,"y":184,"wires":[["4c5da910.a64938"]]},{"id":"eb834bfa.f39b38","type":"ui_button","z":"ade0afc8.6013a","name":"Scan","group":"9616a562.794988","order":3,"width":"2","height":"1","passthru":false,"label":"Scan","color":"","bgcolor":"","icon":"location_searching","payload":"","payloadType":"str","topic":"scan","x":97,"y":306,"wires":[["4c5da910.a64938"]]},{"id":"39e54d38.9b5692","type":"ui_button","z":"ade0afc8.6013a","name":"Restart","group":"9616a562.794988","order":4,"width":"3","height":"1","passthru":false,"label":"Restart","color":"","bgcolor":"","icon":"refresh","payload":"","payloadType":"str","topic":"restart","x":107,"y":343,"wires":[["4c5da910.a64938"]]},{"id":"a2230246.8fa8e","type":"ui_button","z":"ade0afc8.6013a","name":"GetDevices","group":"9616a562.794988","order":5,"width":"3","height":"1","passthru":false,"label":"Update Devices","color":"","bgcolor":"","icon":"refresh","payload":"","payloadType":"str","topic":"getDevices","x":115,"y":380,"wires":[["4c5da910.a64938"]]},{"id":"109df60b.64ce7a","type":"ui_button","z":"ade0afc8.6013a","name":"readAddress","group":"9616a562.794988","order":2,"width":"3","height":"1","passthru":false,"label":"Read Device","color":"","bgcolor":"","icon":"","payload":"deviceID","payloadType":"flow","topic":"getDevice","x":112,"y":419,"wires":[["2d59897b.43c5a6"]]},{"id":"1f181c53.970904","type":"ui_text_input","z":"ade0afc8.6013a","name":"Device_ID","label":"ID: ","group":"9616a562.794988","order":1,"width":"3","height":"1","passthru":true,"mode":"text","delay":300,"topic":"","x":559,"y":427,"wires":[["936174f7.8cbee8"]]},{"id":"936174f7.8cbee8","type":"function","z":"ade0afc8.6013a","name":"storeID","func":"\nflow.set('deviceID', msg.payload);\n\nreturn msg;","outputs":0,"noerr":0,"x":735,"y":427,"wires":[]},{"id":"2d59897b.43c5a6","type":"function","z":"ade0afc8.6013a","name":"readAddr","func":"var data = {address: msg.payload}\n\nmsg.payload = data;\n\nreturn msg;","outputs":1,"noerr":0,"x":270,"y":419,"wires":[["4c5da910.a64938"]]},{"id":"8be03de0.4f9be","type":"status","z":"ade0afc8.6013a","name":"controller_status","scope":["4c5da910.a64938"],"x":411,"y":97,"wires":[["26b478dc.103528"]]},{"id":"5c04640f.c158dc","type":"status","z":"ade0afc8.6013a","name":"mbus_status","scope":["2cebb543.145dca"],"x":404,"y":142,"wires":[["4d060118.9517e"]]},{"id":"26b478dc.103528","type":"ui_text","z":"ade0afc8.6013a","group":"4b71de29.b4c73","order":0,"width":0,"height":0,"name":"controller_status","label":"Controller","format":"{{msg.status.text}}","layout":"row-spread","x":623,"y":97,"wires":[]},{"id":"4d060118.9517e","type":"ui_text","z":"ade0afc8.6013a","group":"4b71de29.b4c73","order":0,"width":0,"height":0,"name":"mbus_status","label":"M-Bus","format":"{{msg.status.text}}","layout":"row-spread","x":613,"y":142,"wires":[]},{"id":"f81dd19b.fc3","type":"inject","z":"ade0afc8.6013a","name":"setPrimary","topic":"setPrimary","payload":"{\"newAddr\":3,\"oldAddr\":2}","payloadType":"json","repeat":"","crontab":"","once":false,"x":121,"y":35,"wires":[["4c5da910.a64938"]]},{"id":"fe4bfc1.4bd76","type":"ui_text_input","z":"ade0afc8.6013a","name":"Old_ID","label":"Old ID","group":"9616a562.794988","order":6,"width":"3","height":"1","passthru":true,"mode":"text","delay":300,"topic":"","x":566,"y":467,"wires":[["f7602233.01b7a"]]},{"id":"f7602233.01b7a","type":"function","z":"ade0afc8.6013a","name":"storeID","func":"\nflow.set('oldID', msg.payload);\n\nreturn msg;","outputs":0,"noerr":0,"x":733,"y":467,"wires":[]},{"id":"b61ffa85.eeed28","type":"ui_text_input","z":"ade0afc8.6013a","name":"New_ID","label":"New ID","group":"9616a562.794988","order":7,"width":"3","height":"1","passthru":true,"mode":"text","delay":300,"topic":"","x":563,"y":507,"wires":[["42a6992e.212798"]]},{"id":"42a6992e.212798","type":"function","z":"ade0afc8.6013a","name":"storeID","func":"\nflow.set('newID', msg.payload);\n\nreturn msg;","outputs":0,"noerr":0,"x":731,"y":507,"wires":[]},{"id":"a77dced1.37ff7","type":"ui_button","z":"ade0afc8.6013a","name":"SetPrimary","group":"9616a562.794988","order":8,"width":"3","height":"1","passthru":false,"label":"Set Primary ID","color":"","bgcolor":"","icon":"","payload":"","payloadType":"str","topic":"setPrimary","x":111,"y":460,"wires":[["17478b65.117325"]]},{"id":"17478b65.117325","type":"function","z":"ade0afc8.6013a","name":"setPrimary","func":"var data = {\n    oldAddr: flow.get('oldID'), \n    newAddr:flow.get('newID')\n    }\n\nmsg.payload = data;\n\nreturn msg;","outputs":1,"noerr":0,"x":280,"y":460,"wires":[["4c5da910.a64938"]]},{"id":"70de0f84.b91ec","type":"inject","z":"ade0afc8.6013a","name":"","topic":"getDevice","payload":"counter","payloadType":"flow","repeat":"3","crontab":"","once":false,"x":130,"y":520,"wires":[["5f55e860.d8f058"]]},{"id":"5f55e860.d8f058","type":"function","z":"ade0afc8.6013a","name":"scanPrimary","func":"\nif(msg.payload == null) msg.payload = 1;\n\nif(msg.payload >= 76) msg.payload = 1;\n\nmsg.payload++;\n\nflow.set(\"counter\",msg.payload);\n\nmsg.payload = {address: msg.payload};\n\nreturn msg;","outputs":1,"noerr":0,"x":310,"y":520,"wires":[[]]},{"id":"6d7d88b.d8f2b78","type":"inject","z":"ade0afc8.6013a","name":"setDevices","topic":"setDevices","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":120,"y":260,"wires":[["b238e6a0.e02928"]]},{"id":"b238e6a0.e02928","type":"function","z":"ade0afc8.6013a","name":"devices","func":"var devices = [\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\",\"11\",\"12\",\"13\",\"14\",\"15\",\"16\",\"17\",\"18\",\"19\",\"20\",\"21\",\"22\",\"23\",\"24\",\"25\",\"26\",\"27\",\"28\",\"29\",\"30\",\"31\",\"32\",\"33\",\"34\",\"35\",\"36\",\"37\",\"38\",\"39\",\"40\",\"41\",\"42\",\"43\",\"44\",\"45\",\"46\",\"47\",\"48\",\"49\",\"50\",\"51\",\"52\",\"53\",\"54\",\"55\",\"56\",\"57\",\"58\",\"59\",\"60\",\"61\",\"62\",\"63\",\"64\",\"65\",\"66\",\"67\",\"68\",\"69\",\"70\",\"71\",\"72\",\"73\",\"74\",\"75\",\"76\"];\n\nmsg.payload = devices;\n\nreturn msg;","outputs":1,"noerr":0,"x":258,"y":260,"wires":[["4c5da910.a64938"]]},{"id":"bf6a52d7.703c1","type":"mbus-client","z":"","name":"local","clienttype":"serial","tcpHost":"127.0.0.1","tcpPort":"2000","serialPort":"/dev/ttyUSB0","serialBaudrate":"2400","reconnectTimeout":"10000","autoScan":true,"storeDevices":true,"disableLogs":true},{"id":"b06b9c66.757c9","type":"ui_group","z":"","name":"M-Bus Devices","tab":"16de0243.87ddfe","order":3,"disp":true,"width":"14"},{"id":"f9357905.6d9348","type":"ui_group","z":"","name":"Data","tab":"16de0243.87ddfe","order":4,"disp":true,"width":"14"},{"id":"9616a562.794988","type":"ui_group","z":"","name":"Commands","tab":"16de0243.87ddfe","order":2,"disp":true,"width":"14"},{"id":"4b71de29.b4c73","type":"ui_group","z":"","name":"Status","tab":"16de0243.87ddfe","order":1,"disp":true,"width":"14"},{"id":"16de0243.87ddfe","type":"ui_tab","z":"","name":"M-Bus","icon":"plug","order":1}]
```

# Testing

To test last version of this node from master:

1. Clone this repo `git clone https://github.com/robertsLando/node-red-contrib-m-bus`
2. Link the node to node-red modules:

go to the downloaded directory `cd node-red-contrib-m-bus` and run `sudo npm link`.
in your node-red user directory (`cd ~/.node-red`) run: `npm link node-red-contrib-m-bus`.


# Authors

[Daniel Lando](https://github.com/robertsLando)
