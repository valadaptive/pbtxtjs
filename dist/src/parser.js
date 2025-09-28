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
    /**
     * Parses an integer with automatic base detection (decimal, octal, hex).
     * Based on the protobuf text format specification.
     * @param text The text to parse
     * @param constructor Either Number or BigInt constructor
     * @returns The parsed value using the specified constructor
     */
    static parseInteger(text, constructor) {
        const originalText = text;
        // Handle different number formats according to protobuf spec:
        // OCT_INT = "0", oct, { oct } - C-style octal like 052
        // HEX_INT = "0", ( "X" | "x" ), hex, { hex } - hex like 0x2A
        // DEC_INT = decimal numbers
        try {
            let result;
            if (text.startsWith('0x') || text.startsWith('0X')) {
                // Hexadecimal: 0x2A, 0X2A
                result = constructor(text);
            }
            else if (text.startsWith('-0x') || text.startsWith('-0X')) {
                // Negative hexadecimal: -0x2A, -0X2A
                // Handle manually since Number("-0x2A") returns NaN
                const hexValue = parseInt(text, 16);
                result = constructor(hexValue);
            }
            else if (/^-?0[0-7]+$/.test(text)) {
                // C-style octal: 052, -052 (starts with 0, followed by octal digits)
                const octalValue = parseInt(text, 8);
                result = constructor(octalValue);
            }
            else {
                // Decimal: 42, -42
                result = constructor(text);
            }
            // Check for NaN when using Number constructor
            if (typeof result === 'number' && isNaN(result)) {
                throw new Error(`NaN result`);
            }
            return result;
        }
        catch {
            throw new Error(`Couldn't parse integer: ${originalText}`);
        }
    }
    consumeInt32() {
        const int_str = this.token;
        this.nextToken();
        try {
            const value = Tokenizer.parseInteger(int_str, Number);
            // TODO: Add range check for int32
            return value;
        }
        catch {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
    }
    consumeUint32() {
        const int_str = this.token;
        this.nextToken();
        try {
            const value = Tokenizer.parseInteger(int_str, Number);
            // TODO: Add range check for uint32
            return value;
        }
        catch {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
    }
    consumeInt64() {
        const int_str = this.token;
        this.nextToken();
        try {
            return Tokenizer.parseInteger(int_str, BigInt);
        }
        catch {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
    }
    consumeUint64() {
        const int_str = this.token;
        this.nextToken();
        try {
            return Tokenizer.parseInteger(int_str, BigInt);
        }
        catch {
            throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
        }
    }
    consumeFloat() {
        const float_str = this.token;
        this.nextToken();
        // Handle special identifiers according to protobuf spec (case-insensitive)
        const lowerToken = float_str.toLowerCase();
        if (lowerToken === 'inf' || lowerToken === 'infinity') {
            return Infinity;
        }
        if (lowerToken === '-inf' || lowerToken === '-infinity') {
            return -Infinity;
        }
        if (lowerToken === 'nan') {
            return NaN;
        }
        // Handle regular numeric values
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
            case 'True':
            case 't':
            case '1':
                return true;
            case 'false':
            case 'False':
            case 'f':
            case '0':
                return false;
            default:
                throw this.parseErrorPreviousToken(`Expected "true", "True", "t", 1, or "false", "False", "f", 0; found "${bool_str}"`);
        }
    }
    consumeString() {
        let result = this._consumeByteString();
        while (this.token && _QUOTES.has(this.token[0])) {
            result += this._consumeByteString();
        }
        return result;
    }
    consumeByteString() {
        let text = this._consumeByteString();
        while (this.token && _QUOTES.has(this.token[0])) {
            text += this._consumeByteString();
        }
        const dest = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            dest[i] = text.charCodeAt(i);
        }
        return dest;
    }
    _consumeByteString() {
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
    tryConsumeAnyScalar() {
        if (this.atEnd()) {
            return false;
        }
        const token = this.token;
        // Try to consume string (starts with quote)
        if (token.length > 0 && _QUOTES.has(token[0])) {
            try {
                this.consumeString();
                return true;
            }
            catch {
                return false;
            }
        }
        // Try to consume identifier/number/bool
        if (/^[a-zA-Z_][0-9a-zA-Z_+-]*$/.test(token) || /^([0-9+-]|(\.[0-9]))[0-9a-zA-Z_.+-]*$/.test(token)) {
            this.nextToken();
            return true;
        }
        return false;
    }
}
Tokenizer._WHITESPACE_OR_COMMENT = /(?:\s|#.*)+/g;
// eslint-disable-next-line no-useless-escape
Tokenizer._TOKEN = /[a-zA-Z_][0-9a-zA-Z_+-]*|([0-9+-]|(\.[0-9]))[0-9a-zA-Z_.+-]*|\"([^\"\n\\]|\\.)*(\"|\\?$)|'([^'\n\\]|\\.)*('|\\?$)/;
Tokenizer._IDENTIFIER = /[a-zA-Z_][0-9a-zA-Z_]*/;
function cUnescape(source) {
    let result = '';
    let i = 0;
    while (i < source.length) {
        if (source[i] === '\\') {
            i++;
            switch (source[i]) {
                // Simple single-character escapes
                case 'a':
                    result += '\x07';
                    i++;
                    break;
                case 'b':
                    result += '\b';
                    i++;
                    break;
                case 'f':
                    result += '\f';
                    i++;
                    break;
                case 'n':
                    result += '\n';
                    i++;
                    break;
                case 'r':
                    result += '\r';
                    i++;
                    break;
                case 't':
                    result += '\t';
                    i++;
                    break;
                case 'v':
                    result += '\v';
                    i++;
                    break;
                case '?':
                    result += '?';
                    i++;
                    break;
                case '\\':
                    result += '\\';
                    i++;
                    break;
                case '\'':
                    result += '\'';
                    i++;
                    break;
                case '"':
                    result += '"';
                    i++;
                    break;
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7': {
                    let octal = '';
                    for (let j = 0; j < 3 && i < source.length && /[0-7]/.test(source[i]); i++, j++) {
                        octal += source[i];
                    }
                    result += String.fromCharCode(parseInt(octal, 8));
                    break;
                }
                case 'x': {
                    i++;
                    let hex = '';
                    for (let j = 0; j < 2 && i < source.length && /[0-9a-fA-F]/.test(source[i]); i++, j++) {
                        hex += source[i];
                    }
                    result += String.fromCharCode(parseInt(hex, 16));
                    break;
                }
                case 'u': {
                    i++;
                    let unicode = '';
                    for (let j = 0; j < 4; i++, j++) {
                        unicode += source[i];
                    }
                    result += String.fromCharCode(parseInt(unicode, 16));
                    break;
                }
                case 'U': {
                    i++;
                    let unicode = '';
                    for (let j = 0; j < 8 && i < source.length; i++, j++) {
                        unicode += source[i];
                    }
                    result += String.fromCodePoint(parseInt(unicode, 16));
                    break;
                }
                default:
                    result += source[i];
            }
        }
        else {
            result += source[i];
            i++;
        }
    }
    return result;
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
                this.skipFieldContents(tokenizer);
                return;
            }
            throw tokenizer.parseErrorPreviousToken(`Message type "${messageDescriptor.fullName}" has no field named "${fieldName}".`);
        }
        field.resolve();
        if (field.map) {
            tokenizer.tryConsume(':');
            if (tokenizer.tryConsume('[')) {
                // List syntax for map fields: my_map: [{ key: "k1" value: "v1" }, { key: "k2" value: "v2" }]
                this.parseList(tokenizer, message, field, () => {
                    this.mergeMapFieldEntry(tokenizer, message, field);
                });
            }
            else {
                // Single map entry: my_map { key: "k1" value: "v1" }
                this.mergeMapFieldEntry(tokenizer, message, field);
            }
        }
        else if (field.resolvedType) {
            // Use duck-typing to check for an enum. An Enum object has `valuesById`.
            if ('valuesById' in field.resolvedType) {
                // Enum
                tokenizer.consume(':');
                if (field.repeated && tokenizer.tryConsume('[')) {
                    // List syntax for repeated enum fields - ensure array is initialized
                    if (!Array.isArray(message[field.name])) {
                        message[field.name] = [];
                    }
                    this.parseList(tokenizer, message, field, () => {
                        this.mergeScalarField(tokenizer, message, field);
                    });
                }
                else {
                    this.mergeScalarField(tokenizer, message, field);
                }
            }
            else {
                // Message
                tokenizer.tryConsume(':');
                if (field.repeated && tokenizer.tryConsume('[')) {
                    // List syntax for repeated message fields
                    if (!Array.isArray(message[field.name])) {
                        message[field.name] = [];
                    }
                    this.parseList(tokenizer, message, field, () => {
                        this.mergeMessageField(tokenizer, message, field);
                    });
                }
                else {
                    this.mergeMessageField(tokenizer, message, field);
                }
            }
        }
        else { // Scalar
            tokenizer.consume(':');
            if (field.repeated && tokenizer.tryConsume('[')) {
                // short format for repeated fields - ensure array is initialized
                if (!Array.isArray(message[field.name])) {
                    message[field.name] = [];
                }
                this.parseList(tokenizer, message, field, () => {
                    this.mergeScalarField(tokenizer, message, field);
                });
            }
            else {
                this.mergeScalarField(tokenizer, message, field);
            }
        }
        if (tokenizer.tryConsume(',')) {
            // consume optional separator
        }
    }
    parseList(tokenizer, message, field, parseItem) {
        if (tokenizer.tryConsume(']')) {
            // Empty list - don't set the field (treat as absent, will be undefined in toObject())
            // This matches JavaScript protobuf behavior for absent repeated fields
        }
        else {
            while (true) {
                parseItem();
                if (tokenizer.tryConsume(']')) {
                    break;
                }
                tokenizer.consume(',');
            }
        }
    }
    parseEnum(field, value) {
        const enumType = field.resolvedType;
        // try as number first (decimal, hex, or octal)
        if (/^-?(?:0[xX][0-9a-fA-F]+|0[0-7]+|\d+)$/.test(value)) {
            try {
                const num = Tokenizer.parseInteger(value, Number);
                if (Object.prototype.hasOwnProperty.call(enumType.valuesById, num)) {
                    return num;
                }
                // It's a number, but not a valid enum value.
                // The Python parser would raise an error here for closed enums.
                // For now, we'll allow it, which is the default for proto3.
                return num;
            }
            catch {
                // If parsing as integer fails, fall through to string parsing
            }
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
            let enumValueStr;
            // Check if it's a number in any format (decimal, hex, octal, including negative)
            if (/^-?(?:0[xX][0-9a-fA-F]+|0[0-7]+|\d+)$/.test(tokenizer.token)) {
                enumValueStr = tokenizer.token;
                tokenizer.nextToken();
            }
            else {
                enumValueStr = tokenizer.consumeIdentifierOrNumber();
            }
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
    mergeMapFieldEntry(tokenizer, message, field) {
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
            if (name === 'key') {
                // Key is always scalar, so ':' is required
                tokenizer.consume(':');
                key = this.parseScalar(tokenizer, mapField.keyType);
            }
            else if (name === 'value') {
                const valueType = mapField.type;
                try {
                    // Try to resolve as message type first
                    const resolvedValueType = mapField.root.lookupType(valueType);
                    // This is a message type, so ':' is optional
                    tokenizer.tryConsume(':');
                    const subMessage = resolvedValueType.create();
                    // Parse the message content directly
                    const messageEndToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
                    while (!tokenizer.tryConsume(messageEndToken)) {
                        this.mergeField(tokenizer, subMessage);
                    }
                    value = subMessage;
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                }
                catch (_e) {
                    // This is a scalar type, so ':' is required
                    tokenizer.consume(':');
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
    mergeMessageField(tokenizer, message, field) {
        const endToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
        let subMessage;
        if (field.repeated) {
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
    }
    skipField(tokenizer) {
        // Consume field name (including extension syntax)
        if (tokenizer.tryConsume('[')) {
            // Extension field
            tokenizer.consumeIdentifier();
            while (tokenizer.tryConsume('.')) {
                tokenizer.consumeIdentifier();
            }
            tokenizer.consume(']');
        }
        else {
            tokenizer.consumeIdentifierOrNumber();
        }
        this.skipFieldContents(tokenizer);
        // Optional comma or semicolon separator
        if (!tokenizer.tryConsume(',')) {
            tokenizer.tryConsume(';');
        }
    }
    skipFieldContents(tokenizer) {
        // Try to determine if this is a scalar field or message field
        if (tokenizer.tryConsume(':') && !tokenizer.lookingAt('{') && !tokenizer.lookingAt('<')) {
            // Scalar value or repeated field
            if (tokenizer.lookingAt('[')) {
                this.skipRepeatedFieldValue(tokenizer);
            }
            else {
                this.skipFieldValue(tokenizer);
            }
        }
        else {
            // Message value
            this.skipFieldMessage(tokenizer);
        }
    }
    skipFieldMessage(tokenizer) {
        const delimiter = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
        while (!tokenizer.lookingAt('>') && !tokenizer.lookingAt('}')) {
            this.skipField(tokenizer);
        }
        tokenizer.consume(delimiter);
    }
    skipFieldValue(tokenizer) {
        if (!tokenizer.tryConsumeAnyScalar()) {
            throw tokenizer.parseError(`Invalid field value: ${tokenizer.token}`);
        }
    }
    skipRepeatedFieldValue(tokenizer) {
        tokenizer.consume('[');
        if (!tokenizer.tryConsume(']')) {
            while (true) {
                if (tokenizer.lookingAt('<') || tokenizer.lookingAt('{')) {
                    this.skipFieldMessage(tokenizer);
                }
                else {
                    this.skipFieldValue(tokenizer);
                }
                if (tokenizer.tryConsume(']')) {
                    break;
                }
                tokenizer.consume(',');
            }
        }
    }
}
//# sourceMappingURL=parser.js.map