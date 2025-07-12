/* eslint-disable @typescript-eslint/no-explicit-any */
import { default as protobuf } from 'protobufjs';
/**
 * Thrown in case of text parsing or tokenizing error.
 */
export class ParseError extends Error {
    constructor(message, line, column) {
        if (line !== undefined) {
            let loc = `${line}`;
            if (column !== undefined) {
                loc += `:${column}`;
            }
            message = `${loc} : ${message}`;
        }
        super(message);
        this.line = line;
        this.column = column;
        this.name = 'ParseError';
    }
}
const _QUOTES = new Set(["'", '"']);
/**
 * Protocol buffer text representation tokenizer.
 *
 * This class handles the lower level string parsing by splitting it into
 * meaningful tokens.
 *
 ** It was directly ported from the Java protocol buffer API^H^H^H^Hthe Python implementation. Thanks Gemini.
 */
class Tokenizer {
    constructor(lines) {
        this._line = -1;
        this._column = 0;
        this.token = '';
        this._current_line = '';
        this._more_lines = true;
        this._previous_line = 0;
        this._previous_column = 0;
        this._lines = lines;
        this._popLine();
        this.nextToken();
    }
    atEnd() {
        return this.token === '';
    }
    _popLine() {
        while (this._current_line.length === 0 || this._column >= this._current_line.length) {
            if (this._lines.length === 0) {
                this._current_line = '';
                this._more_lines = false;
                return;
            }
            else {
                this._current_line = this._lines.shift();
                this._line += 1;
                this._column = 0;
            }
        }
    }
    _skipWhitespace() {
        while (true) {
            this._popLine();
            if (!this._more_lines) {
                return;
            }
            const remaining_line = this._current_line.substring(this._column);
            Tokenizer._WHITESPACE_OR_COMMENT.lastIndex = 0; // Reset regex state
            const match = Tokenizer._WHITESPACE_OR_COMMENT.exec(remaining_line);
            if (match && match.index === 0) {
                this._column += match[0].length;
            }
            else {
                break;
            }
        }
    }
    tryConsume(token) {
        if (this.token === token) {
            this.nextToken();
            return true;
        }
        return false;
    }
    consume(token) {
        if (!this.tryConsume(token)) {
            throw this.parseError(`Expected "${token}".`);
        }
    }
    consumeIdentifier() {
        const result = this.token;
        if (!Tokenizer._IDENTIFIER.test(result)) {
            throw this.parseError('Expected identifier.');
        }
        this.nextToken();
        return result;
    }
    lookingAt(token) {
        return this.token === token;
    }
    nextToken() {
        this._previous_line = this._line;
        this._previous_column = this._column;
        this._column += this.token.length;
        this._skipWhitespace();
        if (!this._more_lines) {
            this.token = '';
            return;
        }
        const remaining_line = this._current_line.substring(this._column);
        if (!remaining_line) {
            this.token = '';
            return;
        }
        const match = Tokenizer._TOKEN.exec(remaining_line);
        if (match && match.index === 0) {
            this.token = match[0];
        }
        else {
            this.token = remaining_line[0];
        }
    }
    parseError(message) {
        return new ParseError(message, this._line + 1, this._column + 1);
    }
    parseErrorPreviousToken(message) {
        return new ParseError(message, this._previous_line + 1, this._previous_column + 1);
    }
    consumeInt32() {
        const int_str = this.token;
        this.nextToken();
        const value = parseInt(int_str, 10);
        if (isNaN(value)) {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
        // TODO: Add range check for int32
        return value;
    }
    consumeUint32() {
        const int_str = this.token;
        this.nextToken();
        const value = parseInt(int_str, 10);
        if (isNaN(value)) {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
        // TODO: Add range check for uint32
        return value;
    }
    consumeInt64() {
        const int_str = this.token;
        this.nextToken();
        try {
            return BigInt(int_str);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        }
        catch (_e) {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
    }
    consumeUint64() {
        const int_str = this.token;
        this.nextToken();
        try {
            return BigInt(int_str);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        }
        catch (_e) {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
    }
    consumeFloat() {
        const float_str = this.token;
        this.nextToken();
        // TODO: A more robust float parsing like in Python version
        if (float_str.endsWith('f')) {
            return parseFloat(float_str.slice(0, -1));
        }
        return parseFloat(float_str);
    }
    consumeBool() {
        const bool_str = this.token;
        this.nextToken();
        switch (bool_str) {
            case 'true':
            case 't':
            case '1':
                return true;
            case 'false':
            case 'f':
            case '0':
                return false;
            default:
                throw this.parseErrorPreviousToken(`Expected "true" or "false", found "${bool_str}"`);
        }
    }
    consumeString() {
        const bytes = this.consumeByteString();
        return new TextDecoder('utf-8').decode(bytes);
    }
    consumeByteString() {
        const parts = [this._consumeSingleByteString()];
        while (this.token && _QUOTES.has(this.token[0])) {
            parts.push(this._consumeSingleByteString());
        }
        const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const part of parts) {
            result.set(part, offset);
            offset += part.length;
        }
        return result;
    }
    _consumeSingleByteString() {
        const text = this.token;
        if (text.length < 1 || !_QUOTES.has(text[0])) {
            throw this.parseError(`Expected string but found: ${text}`);
        }
        if (text.length < 2 || text[text.length - 1] !== text[0]) {
            throw this.parseError(`String missing ending quote: ${text}`);
        }
        try {
            const result = cUnescape(text.substring(1, text.length - 1));
            this.nextToken();
            return result;
        }
        catch (e) {
            if (e instanceof Error) {
                throw this.parseError(e.message);
            }
            throw e;
        }
    }
    consumeIdentifierOrNumber() {
        const result = this.token;
        if (!/^\w+$/.test(result)) {
            throw this.parseError(`Expected identifier or number, got ${result}.`);
        }
        this.nextToken();
        return result;
    }
}
Tokenizer._WHITESPACE_OR_COMMENT = /(?:\s|#.*)+/g;
// eslint-disable-next-line no-useless-escape
Tokenizer._TOKEN = /[a-zA-Z_][0-9a-zA-Z_+-]*|([0-9+-]|(\.[0-9]))[0-9a-zA-Z_.+-]*|\"([^\"\n\\]|\\.)*(\"|\\?$)|'([^'\n\\]|\\.)*('|\\?$)/;
Tokenizer._IDENTIFIER = /[a-zA-Z_][0-9a-zA-Z_]*/;
function cUnescape(source) {
    const result = [];
    let i = 0;
    while (i < source.length) {
        if (source[i] === '\\' && i + 1 < source.length) {
            i++;
            const char = source[i];
            if (char >= '0' && char <= '7') {
                let code = char.charCodeAt(0) - '0'.charCodeAt(0);
                if (i + 1 < source.length && source[i + 1] >= '0' && source[i + 1] <= '7') {
                    i++;
                    code = (code * 8) + (source[i].charCodeAt(0) - '0'.charCodeAt(0));
                }
                if (i + 1 < source.length && source[i + 1] >= '0' && source[i + 1] <= '7') {
                    i++;
                    code = (code * 8) + (source[i].charCodeAt(0) - '0'.charCodeAt(0));
                }
                result.push(code);
            }
            else if (char === 'x' || char === 'X') {
                if (i + 2 < source.length && /[0-9a-fA-F]/.test(source[i + 1]) && /[0-9a-fA-F]/.test(source[i + 2])) {
                    result.push(parseInt(source.substring(i + 1, i + 3), 16));
                    i += 2;
                }
                else {
                    result.push(char.charCodeAt(0));
                }
            }
            else {
                switch (char) {
                    case 'a':
                        result.push(0x07);
                        break;
                    case 'b':
                        result.push(0x08);
                        break;
                    case 'f':
                        result.push(0x0c);
                        break;
                    case 'n':
                        result.push(0x0a);
                        break;
                    case 'r':
                        result.push(0x0d);
                        break;
                    case 't':
                        result.push(0x09);
                        break;
                    case 'v':
                        result.push(0x0b);
                        break;
                    case '\\':
                        result.push(0x5c);
                        break;
                    case '?':
                        result.push(0x3f);
                        break;
                    case "'":
                        result.push(0x27);
                        break;
                    case '"':
                        result.push(0x22);
                        break;
                    default:
                        result.push(char.charCodeAt(0));
                        break;
                }
            }
        }
        else {
            result.push(source.charCodeAt(i));
        }
        i++;
    }
    return new Uint8Array(result);
}
/**
 * Parses a text representation of a protocol message into a message.
 *
 * @param text Message text representation.
 * @param message A protocol buffer message to merge into.
 * @param options Parser options.
 * @returns The message passed as argument.
 */
export function parse(text, message, options) {
    const parser = new Parser(options);
    return parser.parse(text, message);
}
function toCamelCase(str) {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}
function toPascalCase(str) {
    return str
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}
class Parser {
    constructor(options = {}) {
        this.allowUnknownExtension = options.allowUnknownExtension ?? false;
        this.allowFieldNumber = options.allowFieldNumber ?? false;
        this.descriptorPool = options.descriptorPool ?? new protobuf.Root();
        this.allowUnknownField = options.allowUnknownField ?? false;
    }
    parse(text, message) {
        this.parseLines(text.split('\n'), message);
        return message;
    }
    parseLines(lines, message) {
        const tokenizer = new Tokenizer(lines);
        while (!tokenizer.atEnd()) {
            this.mergeField(tokenizer, message);
        }
        return message;
    }
    mergeField(tokenizer, message) {
        const messageDescriptor = message.$type;
        let field = null;
        let fieldName = null;
        if (tokenizer.tryConsume('[')) {
            // Extension
            let name = tokenizer.consumeIdentifier();
            while (tokenizer.tryConsume('.')) {
                name += '.' + tokenizer.consumeIdentifier();
            }
            tokenizer.consume(']');
            fieldName = name;
            field = this.descriptorPool.lookup(name);
            // Use duck-typing to check if it's a field. A Field object has an `id`.
            if (!field || !('id' in field)) {
                if (!this.allowUnknownExtension) {
                    throw tokenizer.parseErrorPreviousToken(`Extension "${name}" not found.`);
                }
            }
            else if (field.parent !== messageDescriptor) {
                throw tokenizer.parseErrorPreviousToken(`Extension "${name}" does not extend message type "${messageDescriptor.fullName}".`);
            }
        }
        else {
            const name = tokenizer.consumeIdentifierOrNumber();
            fieldName = name;
            if (this.allowFieldNumber && /^\d+$/.test(name)) {
                const number = parseInt(name, 10);
                field = messageDescriptor.fieldsById[number];
            }
            else {
                const camelCaseName = toCamelCase(name);
                field = messageDescriptor.fields[camelCaseName];
                // The python parser allows group names to be capitalized.
                // In protobuf.js there is no special group concept, they are just messages.
                // We look up by lowercase name if not found.
                if (!field) {
                    const lowerName = name.toLowerCase();
                    const fieldByLower = messageDescriptor.fields[lowerName];
                    if (fieldByLower && fieldByLower.resolvedType && fieldByLower.resolvedType.name === name) {
                        field = fieldByLower;
                    }
                }
            }
        }
        if (!field) {
            if (this.allowUnknownField) {
                this.skipField(tokenizer);
                return;
            }
            throw tokenizer.parseErrorPreviousToken(`Message type "${messageDescriptor.fullName}" has no field named "${fieldName}".`);
        }
        field.resolve();
        if (field.map) {
            this.mergeMapField(tokenizer, message, field);
        }
        else if (field.resolvedType) {
            // Use duck-typing to check for an enum. An Enum object has `valuesById`.
            if ('valuesById' in field.resolvedType) {
                // Enum
                tokenizer.consume(':');
                this.mergeScalarField(tokenizer, message, field);
            }
            else {
                // Message
                tokenizer.tryConsume(':');
                this.mergeMessageField(tokenizer, message, field, false);
            }
        }
        else { // Scalar
            tokenizer.consume(':');
            if (field.repeated && tokenizer.tryConsume('[')) {
                // short format for repeated fields
                if (!tokenizer.tryConsume(']')) {
                    while (true) {
                        this.mergeScalarField(tokenizer, message, field);
                        if (tokenizer.tryConsume(']')) {
                            break;
                        }
                        tokenizer.consume(',');
                    }
                }
            }
            else {
                this.mergeScalarField(tokenizer, message, field);
            }
        }
        if (tokenizer.tryConsume(',')) {
            // consume optional separator
        }
    }
    parseEnum(field, value) {
        const enumType = field.resolvedType;
        // try as number first
        if (/^-?\d+$/.test(value)) {
            const num = parseInt(value, 10);
            if (Object.prototype.hasOwnProperty.call(enumType.valuesById, num)) {
                return num;
            }
            // It's a number, but not a valid enum value.
            // The Python parser would raise an error here for closed enums.
            // For now, we'll allow it, which is the default for proto3.
            return num;
        }
        // try as string
        const enumValue = enumType.values[value];
        if (enumValue === undefined) {
            throw new ParseError(`Enum type "${enumType.name}" has no value named ${value}.`);
        }
        return enumValue;
    }
    mergeScalarField(tokenizer, message, field) {
        let value;
        // Use duck-typing to check for an enum. An Enum object has `valuesById`.
        if (field.resolvedType && ('valuesById' in field.resolvedType)) {
            const enumValueStr = tokenizer.consumeIdentifierOrNumber();
            value = this.parseEnum(field, enumValueStr);
        }
        else {
            value = this.parseScalar(tokenizer, field.type);
        }
        if (field.repeated) {
            if (!Array.isArray(message[field.name])) {
                message[field.name] = [];
            }
            message[field.name].push(value);
        }
        else {
            message[field.name] = value;
        }
    }
    mergeMapField(tokenizer, message, field) {
        tokenizer.tryConsume(':');
        const endToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
        const mapField = field;
        let key;
        let value;
        // Maps can be empty
        if (tokenizer.tryConsume(endToken)) {
            return;
        }
        while (true) {
            const name = tokenizer.consumeIdentifier();
            tokenizer.consume(':');
            if (name === 'key') {
                key = this.parseScalar(tokenizer, mapField.keyType);
            }
            else if (name === 'value') {
                const valueType = mapField.type;
                try {
                    const resolvedValueType = mapField.root.lookupType(valueType);
                    const subMessage = resolvedValueType.create();
                    // Create a dummy field for the recursive call
                    const dummyField = new protobuf.Field('value', 2, valueType);
                    dummyField.parent = resolvedValueType;
                    this.mergeMessageField(tokenizer, subMessage, dummyField, false);
                    value = subMessage;
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                }
                catch (_e) {
                    value = this.parseScalar(tokenizer, valueType);
                }
            }
            else {
                throw tokenizer.parseError(`Unexpected field in map entry: ${name}`);
            }
            tokenizer.tryConsume(',');
            if (tokenizer.tryConsume(endToken)) {
                break;
            }
        }
        if (!message[field.name]) {
            message[field.name] = {};
        }
        message[field.name][key] = value;
    }
    parseScalar(tokenizer, type) {
        switch (type) {
            case 'double':
            case 'float':
                return tokenizer.consumeFloat();
            case 'int32':
            case 'sint32':
            case 'sfixed32':
                return tokenizer.consumeInt32();
            case 'uint32':
            case 'fixed32':
                return tokenizer.consumeUint32();
            case 'int64':
            case 'sint64':
            case 'sfixed64':
                return tokenizer.consumeInt64();
            case 'uint64':
            case 'fixed64':
                return tokenizer.consumeUint64();
            case 'bool':
                return tokenizer.consumeBool();
            case 'string':
                return tokenizer.consumeString();
            case 'bytes':
                return tokenizer.consumeByteString();
            default:
                throw tokenizer.parseError(`Unknown scalar type: ${type}`);
        }
    }
    mergeMessageField(tokenizer, message, field, isMapEntry) {
        const endToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
        let subMessage;
        if (isMapEntry) {
            const mapEntryTypeName = toPascalCase(field.name) + 'Entry';
            const mapEntryType = field.root.lookupType(mapEntryTypeName);
            subMessage = mapEntryType.create();
        }
        else if (field.repeated) {
            subMessage = field.resolvedType.create();
            if (!Array.isArray(message[field.name])) {
                message[field.name] = [];
            }
            message[field.name].push(subMessage);
        }
        else {
            subMessage = message[field.name] || field.resolvedType.create();
            message[field.name] = subMessage;
        }
        while (!tokenizer.tryConsume(endToken)) {
            if (tokenizer.atEnd()) {
                throw tokenizer.parseError(`Expected "${endToken}"`);
            }
            this.mergeField(tokenizer, subMessage);
        }
        if (isMapEntry) {
            const key = subMessage['key'];
            const value = subMessage['value'];
            if (!message[field.name]) {
                message[field.name] = {};
            }
            message[field.name][key] = value;
        }
    }
    skipField(tokenizer) {
        if (tokenizer.tryConsume(':')) {
            // Scalar value
            tokenizer.consumeIdentifierOrNumber();
        }
        else {
            // Message value
            const endToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
            while (!tokenizer.tryConsume(endToken)) {
                if (tokenizer.atEnd()) {
                    throw tokenizer.parseError(`Expected "${endToken}"`);
                }
                this.skipField(tokenizer);
            }
        }
    }
}
//# sourceMappingURL=parser.js.map