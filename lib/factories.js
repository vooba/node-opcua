var assert = require("assert");
var ec = require("./encode_decode");
var util =require("util");
require('enum').register();
var _ = require("underscore");

var objectNodeIds = require("./opcua_node_ids").Object;


factories = {};
_enumerations = {};


var _defaultType = [

    { name: "UAString",  encode: ec.encodeUAString, decode: ec.decodeUAString, defaultValue: ""},
    { name: "String",    encode: ec.encodeUAString, decode: ec.decodeUAString, defaultValue: ""},
    { name: "Byte",      encode: ec.encodeByte,     decode: ec.decodeByte,     defaultValue: 0 },
    { name: "Integer",   encode: ec.encodeInt32,    decode: ec.decodeInt32,    defaultValue: 0 },
    { name: "Int32",     encode: ec.encodeInt32,    decode: ec.decodeInt32,    defaultValue: 0 },
    { name: "UInt32",    encode: ec.encodeUInt32,   decode: ec.decodeUInt32,   defaultValue: 0 },
    { name: "Int16",     encode: ec.encodeInt16,    decode: ec.decodeInt16,    defaultValue: 0 },
    { name: "UInt16",    encode: ec.encodeUInt16,   decode: ec.decodeUInt16,   defaultValue: 0 },
    { name: "Double",    encode: ec.encodeDouble,   decode: ec.decodeDouble,   defaultValue: 0.0 },

    // OPC Unified Architecture, part 3.0 $8.13 page 65
    { name: "Duration",  encode: ec.encodeDouble, decode: ec.decodeDouble, defaultValue: 0.0 },

    { name: "Float",     encode: ec.encodeFloat, decode: ec.decodeFloat, defaultValue: 0.0 },

    // OPC Unified Architecture, part 3.0 $8.26 page 67
    { name: "UtcTime",   encode: ec.encodeDateTime, decode: ec.decodeDateTime, defaultValue: new Date() },

    // OPC Unified Architecture, part 4.0 $7.13
    // IntegerID: This primitive data type is an UInt32 that is used as an identifier, such as a handle. All values,
    // except for 0, are valid.
    { name: "IntegerId",   encode: ec.encodeUInt32, decode: ec.decodeUInt32, defaultValue: 0xFFFFFFFF },

    // string in the form "en-US" or "de-DE" or "fr" etc...
    { name: "LocaleId",    encode: ec.encodeLocaleId, decode: ec.decodeLocaleId, validate:ec.validateLocaleId, defaultValue: "en" },

    { name: "NodeId",              encode: ec.encodeNodeId,         decode: ec.decodeNodeId,         defaultValue: ec.makeNodeId() },
    { name: "ExpandedNodeId",      encode: ec.encodeExpandedNodeId, decode: ec.decodeExpandedNodeId, defaultValue: ec.makeExpandedNodeId() },

    { name: "ByteString",  encode: ec.encodeByteString, decode: ec.decodeByteString, defaultValue: function() { return new Buffer(0);} }

];

var _defaultTypeMap = {}; _defaultType.forEach(function(d) {_defaultTypeMap[d.name] = d;});

function registerType(name,encodeFunc,decodeFunc,defaultValue)
{
    assert(_.isFunction(encodeFunc));
    assert(_.isFunction(decodeFunc));
    var obj = {
        name: name,encode:encodeFunc,decode:decodeFunc,defaultValue:defaultValue
        };
    _defaultType.push(obj);
    _defaultTypeMap[name] = obj;
}


var constructorMap= {};


exports.findSimpleType = function findSimpleType(name) {
    if (name in _defaultTypeMap) {
        return _defaultTypeMap[name];
    }
    throw "cannot find " + name + " in "+ util.inspect(_defaultTypeMap);
};




function _encode_by_type(obj,fieldType,stream)
{
    try {
        var _t = _defaultTypeMap[fieldType];
        _t.encode(obj,stream);
    }
    catch(err)
    {
        console.log("ERROR in  _encode_by_type  ".red + "cannot encode " + fieldType + " on " + util.inspect(obj));
        console.log(util.inspect(err));
    }
}

function _decode_by_type(obj,fieldType,stream)
{
    var _t = _defaultTypeMap[fieldType];
    if (!_t.hasOwnProperty("decode") || (!_t.decode instanceof Function) ) {
        console.log(util.inspect(_t),util.inspect(obj));
    }
    var obj = _t.decode(stream);
    return obj;
}


function _encode_member_(member,fieldType,stream)
{
    if (_defaultTypeMap[fieldType]) {

        _encode_by_type(member,fieldType,stream);

    } else if (factories[fieldType]) {

        // assert(obj[field.name].hasOwnProperty("encode"));
        member.encode(stream);

    } else if (_enumerations[fieldType]) {
        // OPC Unified Architecture, Part 3 page 34
        // Enumerations are always encoded as Int32 on the wire as defined in Part 6.
        stream.writeInteger(member.value);

    } else {

        throw new Error(" Invalid field" + fieldType);
    }
}
function _decode_member_(member,fieldType,stream,options)
{

    var tracer = undefined;
    if (options) { tracer = options.tracer; }
    var cursor_before = stream.length;


    if (_defaultTypeMap[fieldType]) {

        member = _decode_by_type(member,fieldType,stream);
        if (tracer) { tracer.trace("member", options.name, member,cursor_before,stream.length); }

        return member;

    } else if (factories[fieldType]) {

        member.decode(stream,options);

    } else if (_enumerations[fieldType]) {

        var typedEnum = _enumerations[fieldType].typedEnum;
        member = typedEnum.get(stream.readInteger());
        if (tracer) { tracer.trace("member", options.name, member,cursor_before,stream.length); }
        return member;

    } else {

        throw new Error(" Invalid field" + field.fieldType);
    }
    return member;
}

function _encode_(obj,objDesc,stream) {
    objDesc.fields.forEach(function(field) {


        if (obj.hasOwnProperty(field.name)) {

            var member = obj[field.name];
            var fieldType = field.fieldType;
            if (_.isArray(member)) {

                stream.writeUInt32(member.length);
                member.forEach(function(element) {
                    _encode_member_(element,fieldType,stream);
                });
            } else {
                _encode_member_(member,fieldType,stream);
            }

        } else {
            throw new Error(" Missing field " + field.name + " in object "+ util.inspect(obj));
        }
    });
}

function _resolve_defaultValue(type_userValue,defaultValue)
{
    defaultValue = defaultValue || type_userValue;
    if (_.isFunction(defaultValue)) {
        defaultValue = defaultValue.call();
    }
    // this is a default type such as UAString or Integer
    return  defaultValue;
}

function _build_default_value(fieldType,isArray,defaultValue) {

    if (isArray) {
        return [];
    }

    if (_defaultTypeMap[fieldType]) {

        _type  = _defaultTypeMap[fieldType];
        return _resolve_defaultValue(_type.defaultValue,defaultValue);

    } else if (factories[fieldType]) {

        sub_options = sub_options || {};
        _constructor = factories[fieldType];
        return callConstructor(_constructor, defaultValue);

    } else if (_enumerations[fieldType]) {

        console.log("Missing Enumeration");

    } else {

        throw new Error(" Invalid field" + field.fieldType);
    }
    return null;
}

function _decode_(obj,objDesc,stream,options) {

    var tracer = undefined;
    if (options) { tracer = options.tracer; }

    if (tracer) { tracer.trace("start",options.name + "("+objDesc.name+")",stream.length,stream.length); }

    objDesc.fields.forEach(function(field) {

        if (obj.hasOwnProperty(field.name)) {

            var member = obj[field.name];
            var fieldType = field.fieldType;


            if (_.isArray(member)) {

                assert(member.length===0);

                var cursor_before = stream.length;
                var nb = stream.readUInt32();

                if (options) { options.name = field.name + []};
                if (tracer)  { tracer.trace("start_array",field.name,nb,cursor_before,stream.length); }

                for (var i =0;i<nb;i++) {
                    var element = _build_default_value(fieldType,false,field.defaultValue);
                    element = _decode_member_(element,fieldType,stream,options) || member;
                    member.push(element);
                }
                if (tracer) { tracer.trace("end_array",field.name,stream.length-4); }

            } else {
                if (options) { options.name = field.name;}
                obj[field.name] = _decode_member_(member,fieldType,stream,options) || member;
            }

        }
    });

    if (tracer) { tracer.trace("end",objDesc.name,stream.length,stream.length); }
}


function installEnumProp(obj,name,Enum){

    var private_name ="__"+name;
    obj[private_name] = Enum.enums[0];

    // create a array of possible value for the enum
    param = {};

    param[name] = {
        set : function (value){
            if (!(value in Enum )) {
                throw "Invalid value provided for Enum " + name+ ": " + value;
            }
            this[private_name] = value;
        },
        get : function() {
            return this[private_name];
        },
        enumerable: true

    };
    Object.defineProperties(obj,param);
    Object.defineProperty(obj,private_name,{ hidden: true, enumerable: false});
}

exports.installEnumProp = installEnumProp;


function callConstructor(constructor) {
    var factoryFunction = constructor.bind.apply(constructor, arguments);
    return new factoryFunction();
}


function UAObjectFactoryBuild(_description)
{
    var description =_description;
    var name = description.name;

    if (description.hasOwnProperty("isEnum")) {
        // create a new Enum
        var typedEnum = new Enum(description.enumValues);
        // xx if ( name in enumerations) { throw " already inserted"; }
        _enumerations[name] = description;
        _enumerations[name].typedEnum = typedEnum;
        return typedEnum;
    }

    if (description.hasOwnProperty("subtype")) {

        var t = _defaultTypeMap[description.subtype];
        if (t === undefined) {
            throw " "+ util.inspect(description,{color: true}) +" cannot find subtype " + description.subtype;
        }
        //xx console.log(util.inspect(description));
        assert(_.isFunction(t.encode));
        assert(_.isFunction(t.decode));
        registerType(name, t.encode, t.decode, t.defaultValue);
        return;
    }


    var classConstructor;
    classConstructor = function (options) {

        var self = this;

        options = options || {};

        // construct default properties

        var sub_option_to_ignore = [];
        if (!description.fields) {
            throw new Error("fields missing in description " + description)
        }
        description.fields.forEach( function(field) {

            var fieldType = field.fieldType;
            var fieldName = field.name;


            function _addSimpleField(fieldType,isArray,defaultValue) {

                _type  = _defaultTypeMap[fieldType];
                return _build_default_value(fieldType,isArray,defaultValue);
            }


            if ( fieldType in _enumerations ) {

                 var typedEnum  = _enumerations[fieldType].typedEnum;

                 installEnumProp(self,fieldName,typedEnum);

                 if (field.defaultValue) {
                     self[fieldName] = field.defaultValue;
                 }


            } else if ( fieldType in _defaultTypeMap) {

                self[fieldName]  = _addSimpleField(fieldType,field.isArray, field.defaultValue);

            } else if (fieldType in factories) {

                if (field.subtype) {
                    // this is a synonymous
                    fieldType = field.subType;
                    self[fieldName]  = _addSimpleField(fieldType,field.isArray,field.defaultValue);

                } else {

                    // this is a  complex type
                    // find options related to this filed in options
                    sub_options = {};
                    if (fieldName in options) {
                        sub_options = options[fieldName];
                        sub_option_to_ignore.push(fieldName);
                    }
                    self[fieldName] =  _build_default_value(fieldType,field.isArray,sub_options);
                }

            } else {
                throw new Error("Invalid field type : " + fieldType + " is not a default type nor a registered complex struct");
            }

        });

        for (option in options) {
            if (options.hasOwnProperty(option) && sub_option_to_ignore.indexOf(option) == -1) {
                assert(this.hasOwnProperty(option), " invalid option specified " + option);
                assert(!(this[options] instanceof Object)); //
                this[option] = options[option];
            }
        }
    };



    classConstructor.prototype.binaryStoreSize = function() {

        var BinaryStreamSizeCalculator = require("../lib/binaryStream").BinaryStreamSizeCalculator;
        var stream = new BinaryStreamSizeCalculator();
        this.encode(stream);
        return stream.length;
    };


    classConstructor.prototype.encode = function(stream) {
        if (description.encode) {
            // use the encode function specified in the description object instead of default one
            description.encode(this,stream);
        } else {
            _encode_(this,description,stream);
        }
    };
    classConstructor.prototype.decode = function(stream,options) {
        if (description.decode) {
            // use the decode function specified in the description object instead of default one
            description.decode(this,stream,options);
        } else  {
            _decode_(this,description,stream,options);
        }
    };


    var encode_name = name + "_Encoding_DefaultBinary";
    var expandedNodeId = ec.makeExpandedNodeId(description.id || objectNodeIds[encode_name]);

    classConstructor.prototype.encodingDefaultBinary = expandedNodeId;
    classConstructor.prototype.constructor.name = name;
    classConstructor.prototype._description = description;

    if (name in factories) {
        throw new Error(" Class "+name+ " already in factories");
    }
    factories[name] = classConstructor;

    if (expandedNodeId.value !=0 ) {
        if (expandedNodeId.value in constructorMap) {
            throw new Error(" Class "+ name + " with ID  "+ expandedNodeId.value + " already in constructorMap");
        }
    }
    constructorMap[expandedNodeId.value] = classConstructor;
    return classConstructor;
}



exports.constructObject= function(expandedId)
{
    if ( ! expandedId || ! (expandedId.value in constructorMap) ) {
        throw new Error("constructObject: cannot find constructor for "+ expandedId);
    }
    return new constructorMap[expandedId.value]();
};


exports.UAObjectFactoryBuild = UAObjectFactoryBuild;