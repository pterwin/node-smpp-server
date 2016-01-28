var get_text_with_udh = {};
get_text_with_udh['8bit'] = function(message, parts_count, part_num, ref) {
	var udh = new Buffer(7+message.length);
	var messageBuffer = new Buffer(message);

	udh.writeUInt8(6,0);
	udh.writeUInt8(8,1);
	udh.writeUInt8(4,2);
	udh.writeUInt8(0xf4,3);
	udh.writeUInt8(0x2e,4);
	udh.writeUInt8(parts_count,5);
	udh.writeUInt8(part_num,6);
	messageBuffer.copy(udh, 7);
	return udh;
};

get_text_with_udh['7bit'] = function(message, parts_count, part_num, ref) {
	var udh = new Buffer(6+message.length);
	var messageBuffer = new Buffer(message);
	udh.writeUInt8(5,0);
	udh.writeUInt8(0,1);
	udh.writeUInt8(3,2);
	udh.writeUInt8(ref,3);
	udh.writeUInt8(parts_count,4);
	udh.writeUInt8(part_num,5);
	messageBuffer.copy(udh, 6);
	return udh;
};

var split_message = function(message, udhtype) {
    var is_multibite      = (detect_message_coding(message.toString()) == 8)? true : false;
	var max_part_size     = (is_multibite)? 134 : 153;
	var max_one_part_size = (is_multibite)? 140 : 160;
	udhtype               = udhtype? udhtype : '7bit';

    if(is_multibite) message = Iconv.encode(message,'utf16-be');
    if(message.length <= max_one_part_size) return false;

    var _parts_count = Math.ceil(message.length / max_part_size);
    var _pos = 0;
    var _part_no = 1;
    var _out = [];
    var _ref = Math.floor(Math.random()*128)+1;

    while (_pos < message.length) {
    	if(_part_no >= max_part_in_one_message) break;
    	var _text_cut = message.toString().substr(_pos, max_part_size);

		_out.push({
			text:_text_cut,
			part:_part_no,
			parts:_parts_count,
			ref:_ref,
			text_with_udh: get_text_with_udh[udhtype](_text_cut, _parts_count, _part_no,_ref)
		});

		//console.log(_text_cut.length);

		_pos += _text_cut.length;
		_part_no++;

		delete _text_cut;
    }
    return _out;
};

var detect_message_coding = function(message) {
	return (/[^(\x20-\x7F\n\r)]+/.test(message))? 8 : 0;
};

var SMS = function(data) {
    var self = this;

    self.message = data.message;
    self.to      = data.to;
    self.from    = data.from;

    self.get_ton_npi = function(number) {
        if(!number) {
            return false;
        }
        //alphanumeric
        if(number.match(/[a-zA-Z]/)) {
            return {
                ton: 5,
                npi: 0
            };
        }
        //shortcode
        if(number.length >= 3 && number.length <= 8) {
            return {
                ton: 3,
                npi: 0,
            };
        }

        if(number.length > 10) {
            return {
                ton: 1,
                npi: 1
            };
        }
    };

    self.toPdu = function(overrides, default_encoding, use_message_payload) {
        var pdu = {};

        overrides = overrides? overrides : {};
        var encoding = default_encoding? default_encoding : null;

        pdu.source_addr_ton     = self.get_ton_npi(self.from).ton;
        pdu.source_addr_npi     = self.get_ton_npi(self.from).npi;
        pdu.source_addr         = self.from;
        pdu.dest_addr_ton       = self.get_ton_npi(self.to).ton;
        pdu.dest_addr_npi       = self.get_ton_npi(self.to).npi;
        pdu.destination_addr    = self.to;
        pdu.source_network_type = 1;
        pdu.dest_network_type   = 1;



        var msg = null;
        if(encoding === null) {
            msg = self.message;
        } else {
            msg = new Buffer(self.message, encoding);
        }
        // get encoding
        if(use_message_payload === true) {
            // no need to split
            pdu.message_payload = msg;
        } else {
            // need to split
            pdu.short_message = msg;
        }

        //apply the configured overrides
        for(var i in overrides) {
            pdu[i] = overrides[i];
        }
        return pdu;
    };
};

module.exports = {
    sms: SMS,
    detect_message_coding: detect_message_coding
};
