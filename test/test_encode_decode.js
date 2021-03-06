var should = require("should");
var ec = require("../lib/encode_decode");
var opcua = require("../lib/nodeopcua");

function test_encode_decode(obj,encode_func,decode_func,expectedLength,verify_buffer_func)
{
    var binaryStream = new opcua.BinaryStream();
    binaryStream.length.should.equal(0);

    encode_func(obj,binaryStream);
    binaryStream.length.should.equal(expectedLength);

    if (verify_buffer_func) {
        verify_buffer_func(binaryStream._buffer);
    }
    binaryStream.rewind();

    var obj_verif = decode_func(binaryStream);
    binaryStream.length.should.equal(expectedLength);

    if (obj !== undefined) {
        obj_verif.should.eql(obj);

    } else {
        should.not.exists(obj_verif);
    }
}

describe("testing built-in type encoding",function() {


    it("should encode and decode a boolean as a single byte",function(){

        test_encode_decode(true ,ec.encodeBoolean,ec.decodeBoolean,1);
        test_encode_decode(false,ec.encodeBoolean,ec.decodeBoolean,1);

    });

    it("should encode and decode a Integer (4 bytes)",function(){


        test_encode_decode(1000000000 ,ec.encodeInt32,ec.decodeInt32,4,function (buffer) {
            // should be little endian
            buffer.readUInt8(0).should.equal(0x00);
            buffer.readUInt8(1).should.equal(0xCA);
            buffer.readUInt8(2).should.equal(0x9A);
            buffer.readUInt8(3).should.equal(0x3B);
        });
        test_encode_decode(-100000000 ,ec.encodeInt32,ec.decodeInt32,4);

    });

    it("should encode and decode a Floating Point (4 bytes)",function(){

        var value = -6.5;
        // I EEE-754
        test_encode_decode(value ,ec.encodeFloat,ec.decodeFloat,4,function (buffer) {
            // should be little endian
            buffer.readUInt8(0).should.equal(0x00);
            buffer.readUInt8(1).should.equal(0x00);
            buffer.readUInt8(2).should.equal(0xD0);
            buffer.readUInt8(3).should.equal(0xC0);
        });

    });

    it("should encode and decode a Double Point (8 bytes)",function(){
        // I EEE-754

        var value = -6.5;
        // I EEE-754
        test_encode_decode(value ,ec.encodeDouble,ec.decodeDouble,8,function (buffer) {
            // should be little endian
            buffer.readUInt8(0).should.equal(0x00);
            buffer.readUInt8(1).should.equal(0x00);
            buffer.readUInt8(2).should.equal(0x00);
            buffer.readUInt8(3).should.equal(0x00);
            buffer.readUInt8(4).should.equal(0x00);
            buffer.readUInt8(5).should.equal(0x00);
            buffer.readUInt8(6).should.equal(0x1a);
            buffer.readUInt8(7).should.equal(0xc0);
        });

    });

    it("should encode and decode a null string" ,function() {

        var value = undefined;


        test_encode_decode(value ,ec.encodeUAString,ec.decodeUAString,4,function (buffer) {
            // should be little endian
            buffer.readUInt8(0).should.equal(0xff);
            buffer.readUInt8(1).should.equal(0xff);
            buffer.readUInt8(2).should.equal(0xff);
            buffer.readUInt8(3).should.equal(0xff);
        });

    });

    it("should encode and decode a normal string" ,function() {

        var value = "Hello";

        test_encode_decode(value ,ec.encodeUAString,ec.decodeUAString,9,function (buffer) {
            // should be little endian
            buffer.readUInt8(0).should.equal(0x05);
            buffer.readUInt8(1).should.equal(0x00);
            buffer.readUInt8(2).should.equal(0x00);
            buffer.readUInt8(3).should.equal(0x00);
            buffer.readUInt8(4).should.equal('H'.charCodeAt(0));
            buffer.readUInt8(5).should.equal('e'.charCodeAt(0));
            buffer.readUInt8(6).should.equal('l'.charCodeAt(0));
            buffer.readUInt8(7).should.equal('l'.charCodeAt(0));
            buffer.readUInt8(8).should.equal('o'.charCodeAt(0));
        });

    });

    it("should encode and decode a DateTime" ,function() {

        var value = new Date();

        test_encode_decode(value ,ec.encodeDateTime,ec.decodeDateTime,8,function (buffer) {
            // todo
        });

    });

    it("should encode and decode a GUID" ,function() {

        var value = "72962B91-FA75-4AE6-8D28-B404DC7DAF63";

        test_encode_decode(value ,ec.encodeGUID,ec.decodeGUID,16,function (buffer) {
            buffer.readUInt8(0).should.equal(0x91);
            buffer.readUInt8(1).should.equal(0x2B);
            buffer.readUInt8(2).should.equal(0x96);
            buffer.readUInt8(3).should.equal(0x72);

            buffer.readUInt8(4).should.equal(0x75);
            buffer.readUInt8(5).should.equal(0xFA);

            buffer.readUInt8(6).should.equal(0xE6);
            buffer.readUInt8(7).should.equal(0x4A);

            buffer.readUInt8(8).should.equal(0x8D);
            buffer.readUInt8(9).should.equal(0x28);

            buffer.readUInt8(10).should.equal(0xB4);
            buffer.readUInt8(11).should.equal(0x04);
            buffer.readUInt8(12).should.equal(0xDC);
            buffer.readUInt8(13).should.equal(0x7D);
            buffer.readUInt8(14).should.equal(0xAF);
            buffer.readUInt8(15).should.equal(0x63);
        });
    });


    it("should encode and decode a ByteString" ,function() {

        var buf = new Buffer(256);
        buf.write("THIS IS MY BUFFER");

        test_encode_decode(buf,ec.encodeByteString,ec.decodeByteString,256+4,function (buffer) {

            buffer.readUInt32LE(0).should.equal(256);
        });
        //xx check_buf.toString('hex').should.equal(buf.toString('hex'));


    });

    it("should encode and decode a two byte NodeId" ,function() {

        var nodeId = ec.makeNodeId(25);
        nodeId.identifierType.should.eql(ec.NodeIdType.NUMERIC);

        test_encode_decode(
            nodeId,
            ec.encodeNodeId,
            ec.decodeNodeId,
            2,
            function verify_buffer(buffer){
                buffer.readUInt8(0).should.equal(0);
                buffer.readUInt8(1).should.equal(25); // namespace
            }
        );

    });


    it("should encode and decode a four byte NodeId" ,function() {

        var nodeId = ec.makeNodeId(258);
        nodeId.identifierType.should.eql(ec.NodeIdType.NUMERIC);
        test_encode_decode(
            nodeId,
            ec.encodeNodeId,
            ec.decodeNodeId,
            4,
            function verify_buffer(buffer){
                buffer.readUInt8(0).should.equal(1);
                buffer.readUInt8(1).should.equal(0); // namespace
                buffer.readUInt16LE(2).should.equal(258);
            }
        );
    });

    it("should encode and decode a Numeric NodeId" ,function() {

        var nodeId = ec.makeNodeId(545889,2500);
        nodeId.identifierType.should.eql(ec.NodeIdType.NUMERIC);
        test_encode_decode(
            nodeId,
            ec.encodeNodeId,
            ec.decodeNodeId,
            7);
    });


    it("should encode and decode a String NodeId" ,function() {

        var nodeId = ec.makeNodeId("SomeStuff",2500);
        nodeId.identifierType.should.eql(ec.NodeIdType.STRING);

        test_encode_decode(
            nodeId,
            ec.encodeNodeId,
            ec.decodeNodeId,
            4 + 9 + 2 + 1);

    });

    xit("should encode and decode a Guid NodeId" ,function() {
        // todo
    });

    xit("should encode and decode a Opaque NodeId" ,function() {
        // todo
    });

    it("should encode and decode a Expanded NodeId  - TwoBytes" ,function() {

        test_encode_decode(
            ec.makeExpandedNodeId(10),
            ec.encodeExpandedNodeId,
            ec.decodeExpandedNodeId,
            2)
        ;
    });
    it("should encode and decode a Expanded NodeId  - FourBytes" ,function() {

        test_encode_decode(
            ec.makeExpandedNodeId(32000),
            ec.encodeExpandedNodeId,
            ec.decodeExpandedNodeId,
            4)
        ;
    });


});
