
var argv = require('optimist')
    .usage('Usage: $0 --portServer [num]--port [num]  --hostname <hostname> -block')
    .argv;
var net = require("net");
var hexy = require("hexy");
var opcua = require("../lib/nodeopcua");
var MessageBuilder = require("../lib/secure_channel_service").MessageBuilder;
var packet_analyzer = require("../lib/packet_analyzer").packet_analyzer;
var messageHeaderToString = require("../lib/secure_channel_service").messageHeaderToString;
var s = require("../lib/structures");

require("colors");

var remote_port = parseInt(argv.port) || 4841;
hostname = argv.hostname || "localhost" ;

var my_port = parseInt(argv.portServer) || remote_port + 1;


var TrafficAnalyser = function(id)
{
    this.id = id;
};

TrafficAnalyser.prototype.add = function(data)
{

    var stream = new opcua.BinaryStream(data);
	if (argv.block) {
	   console.log(hexy.hexy(data , { width: 32, format: "twos" }));
	   return ;
	}
    var messageHeader = opcua.readMessageHeader(stream);

    if (messageHeader.msgType == "ERR") {

        var err = new s.TCPErrorMessage();
        err.decode(stream);
        console.log(" Error 0x" + err.name.toString(16) + " reason:" + err.reason);
        console.log(hexy.hexy(data));
    }

    var messageBuild = new MessageBuilder();
    messageBuild.on("raw_buffer",function(fullMessage){

        console.log(hexy.hexy(fullMessage , { width: 32}));

        try {
		   packet_analyzer(fullMessage);
        } 
		catch(err) {
		   console.log("ERROR : ".red, err);
		}
    });






    switch(messageHeader.msgType) {

        case "HEL":
        case "ACK":
            if (this.id%2) {
                console.log( JSON.stringify(messageHeader,null,"").red.bold);
            } else {
                console.log( JSON.stringify(messageHeader,null,"").yellow.bold);
            }
            break;

        case "OPN": // open secure channel
        case "CLO": // close secure channel
        case "MSG": // message
            // decode secure message
            if (this.id%2) {
                console.log( messageHeaderToString(data).red.bold);
            } else {
                console.log( messageHeaderToString(data).yellow.bold);
            }

            messageBuild.feed(data);
            break;
        case "ERR":
            console.log(hexy.hexy(data));
            break;
        default:
            break;

    }

};


require('net').createServer(function (socket) {

    console.log("connected");
    var ta_client = new  TrafficAnalyser(1);

    var ta_server = new  TrafficAnalyser(2);

    var proxy_client  = net.Socket();
    proxy_client.connect(remote_port,hostname);

    proxy_client.on('data',function(data) {
        console.log(" server -> client : packet length " + data.length);
        ta_server.add(data);
        try {
            socket.write(data);
        } catch(err) {

        }
    });

    socket.on('data', function (data) {
        console.log(" client -> server : packet length " + data.length);
        ta_client.add(data);
        proxy_client.write(data);
    });
    socket.on('close', function() {
        console.log('server disconnected (CLOSE)');
        proxy_client.end();
    });

    socket.on('end', function() {
        console.log('server disconnected (END)');
    });

}).listen(my_port);

console.log(" registering OPCUA server on port " + my_port);
console.log("  +-> redirecting conversation to server port " + remote_port);
