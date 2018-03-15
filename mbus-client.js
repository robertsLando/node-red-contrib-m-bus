
module.exports = function (RED) {
  'use strict'

  function MbusClientNode (config) {
    RED.nodes.createNode(this, config)

    let mbusMaster = require('node-mbus')

    this.clienttype = config.clienttype
    this.tcpHost = config.tcpHost
    this.tcpPort = parseInt(config.tcpPort) || 500

    this.serialPort = config.serialPort
    this.serialBaudrate = config.serialBaudrate

    this.autoConnect = !!config.autoConnect

    let node = this

    node.client = null
    var mbusOptions = {autoConenct: this.autoConenct};

    if (node.clienttype === 'tcp') {
      mbusOptions.host = this.tcpHost;
      mbusOptions.port = this.tcpPort;
    }else {
      mbusOptions.serialPort = this.serialPort;
      mbusOptions.serialBaudrate = this.serialBaudrate;
    }

    this.client = new MbusMaster(mbusOptions);
    this.client.connect();

    node.on('close', function (done) {
      console.log('close node')
      if (node.client) {
        node.client.close(function (err) {
          if(err) console.log("Error while closing client: "+err.message)
          else console.log('connection closed')
          done()
        });
      }else
        done()
    })

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
