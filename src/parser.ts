/* eslint-disable @typescript-eslint/no-explicit-any */
import {default as protobuf} from 'protobufjs';

/**
 * Thrown in case of text parsing or tokenizing error.
 */
export class ParseError extends Error {
  constructor(message: string, public line?: number, public column?: number) {
    if (line !== undefined) {
      let loc = `${line}`;
      if (column !== undefined) {
        loc += `:${column}`;
      }
      message = `${loc} : ${message}`;
    }
    super(message);
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
  private _lines: string[];
  private _line = -1;
  private _column = 0;
  public token = '';
  private _current_line = '';
  private _more_lines = true;
  private _previous_line = 0;
  private _previous_column = 0;

  private static readonly _WHITESPACE_OR_COMMENT = /(?:\s|#.*)+/g;
  // eslint-disable-next-line no-useless-escape
  private static readonly _TOKEN = /[a-zA-Z_][0-9a-zA-Z_+-]*|([0-9+-]|(\.[0-9]))[0-9a-zA-Z_.+-]*|\"([^\"\n\\]|\\.)*(\"|\\?$)|'([^'\n\\]|\\.)*('|\\?$)/;
  private static readonly _IDENTIFIER = /[a-zA-Z_][0-9a-zA-Z_]*/;

  constructor(lines: string[]) {
    this._lines = lines;
    this._popLine();
    this.nextToken();
  }

  public atEnd(): boolean {
    return this.token === '';
  }

  private _popLine(): void {
    while (this._current_line.length === 0 || this._column >= this._current_line.length) {
      if (this._lines.length === 0) {
        this._current_line = '';
        this._more_lines = false;
        return;
      } else {
        this._current_line = this._lines.shift()!;
        this._line += 1;
        this._column = 0;
      }
    }
  }

  private _skipWhitespace(): void {
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
      } else {
        break;
      }
    }
  }

  public tryConsume(token: string): boolean {
    if (this.token === token) {
      this.nextToken();
      return true;
    }
    return false;
  }

  public consume(token: string): void {
    if (!this.tryConsume(token)) {
      throw this.parseError(`Expected "${token}".`);
    }
  }

  public consumeIdentifier(): string {
    const result = this.token;
    if (!Tokenizer._IDENTIFIER.test(result)) {
      throw this.parseError('Expected identifier.');
    }
    this.nextToken();
    return result;
  }

  public lookingAt(token: string): boolean {
    return this.token === token;
  }

  public nextToken(): void {
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
    } else {
      this.token = remaining_line[0];
    }
  }

  public parseError(message: string): ParseError {
    return new ParseError(message, this._line + 1, this._column + 1);
  }

  public parseErrorPreviousToken(message: string): ParseError {
    return new ParseError(message, this._previous_line + 1, this._previous_column + 1);
  }

  public consumeInt32(): number {
    const int_str = this.token;
    this.nextToken();
    const value = parseInt(int_str, 10);
    if (isNaN(value)) {
      throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
    }
    // TODO: Add range check for int32
    return value;
  }

  public consumeUint32(): number {
    const int_str = this.token;
    this.nextToken();
    const value = parseInt(int_str, 10);
    if (isNaN(value)) {
      throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
    }
    // TODO: Add range check for uint32
    return value;
  }

  public consumeInt64(): bigint {
    const int_str = this.token;
    this.nextToken();
    try {
      return BigInt(int_str);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch(_e) {
      throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
    }
  }

  public consumeUint64(): bigint {
    const int_str = this.token;
    this.nextToken();
    try {
      return BigInt(int_str);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch(_e) {
      throw this.parseErrorPreviousToken(`Couldn't parse integer: ${int_str}`);
    }
  }

  public consumeFloat(): number {
    const float_str = this.token;
    this.nextToken();
    // TODO: A more robust float parsing like in Python version
    if (float_str.endsWith('f')) {
      return parseFloat(float_str.slice(0, -1));
    }
    return parseFloat(float_str);
  }

  public consumeBool(): boolean {
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

  public consumeString(): string {
    let result = this._consumeByteString();
    while (this.token && _QUOTES.has(this.token[0])) {
      result += this._consumeByteString();
    }
    return result;
  }

  public consumeByteString(): Uint8Array {
    const text = this._consumeByteString();
    const dest = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      dest[i] = text.charCodeAt(i);
    }
    return dest;
  }

  private _consumeByteString(): string {
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
    } catch(e) {
      if (e instanceof Error) {
        throw this.parseError(e.message);
      }
      throw e;
    }
  }

  public consumeIdentifierOrNumber(): string {
    const result = this.token;
    if (!/^\w+$/.test(result)) {
      throw this.parseError(`Expected identifier or number, got ${result}.`);
    }
    this.nextToken();
    return result;
  }
}

function cUnescape(source: string): string {
  let result = '';

  let i = 0;
  while (i < source.length) {
    if (source[i] === '\\') {
      i++;
      switch (source[i]) {
        // Simple single-character escapes
        case 'a': result += '\x07'; break;
        case 'b': result += '\b'; break;
        case 'f': result += '\f'; break;
        case 'n': result += '\n'; break;
        case 'r': result += '\r'; break;
        case 't': result += '\t'; break;
        case 'v': result += '\v'; break;
        case '?': result += '?'; break;
        case '\\': result += '\\'; break;
        case '\'': result += '\''; break;
        case '"': result += '"'; break;

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

          const isFourByte = source.slice(i, i + 4) === '0010';
          const numDigits = isFourByte ? 4 : 5;
          if (isFourByte) {
            i += 4;
          } else {
            i += 3;
          }

          let unicode = '';
          for (let j = 0; j < numDigits; i++, j++) {
            unicode += source[i];
          }
          result += String.fromCodePoint(parseInt(unicode, 16));
          break;
        }
        default:
          result += source[i];
      }
    } else {
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
export function parse<T extends protobuf.Message>(
  text: string,
  message: T,
  options?: ParserOptions,
): T {
  const parser = new Parser(options);
  return parser.parse(text, message);
}

export interface ParserOptions {
  allowUnknownExtension?: boolean;
  allowFieldNumber?: boolean;
  descriptorPool?: protobuf.Root;
  allowUnknownField?: boolean;
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

class Parser {
  private readonly allowUnknownExtension: boolean;
  private readonly allowFieldNumber: boolean;
  private readonly descriptorPool: protobuf.Root;
  private readonly allowUnknownField: boolean;

  constructor(options: ParserOptions = {}) {
    this.allowUnknownExtension = options.allowUnknownExtension ?? false;
    this.allowFieldNumber = options.allowFieldNumber ?? false;
    this.descriptorPool = options.descriptorPool ?? new protobuf.Root();
    this.allowUnknownField = options.allowUnknownField ?? false;
  }

  public parse<T extends protobuf.Message>(text: string, message: T): T {
    this.parseLines(text.split('\n'), message);
    return message;
  }

  public parseLines<T extends protobuf.Message>(lines: string[], message: T): T {
    const tokenizer = new Tokenizer(lines);
    while (!tokenizer.atEnd()) {
      this.mergeField(tokenizer, message);
    }
    return message;
  }

  private mergeField<T extends protobuf.Message>(tokenizer: Tokenizer, message: T): void {
    const messageDescriptor = message.$type;
    let field: protobuf.Field | null = null;
    let fieldName: string | null = null;

    if (tokenizer.tryConsume('[')) {
      // Extension
      let name = tokenizer.consumeIdentifier();
      while (tokenizer.tryConsume('.')) {
        name += '.' + tokenizer.consumeIdentifier();
      }
      tokenizer.consume(']');
      fieldName = name;

      field = this.descriptorPool.lookup(name) as protobuf.Field | null;

      // Use duck-typing to check if it's a field. A Field object has an `id`.
      if (!field || !('id' in field)) {
        if (!this.allowUnknownExtension) {
          throw tokenizer.parseErrorPreviousToken(`Extension "${name}" not found.`);
        }
      } else if (field.parent !== messageDescriptor) {
        throw tokenizer.parseErrorPreviousToken(`Extension "${name}" does not extend message type "${messageDescriptor.fullName}".`);
      }
    } else {
      const name = tokenizer.consumeIdentifierOrNumber();
      fieldName = name;
      if (this.allowFieldNumber && /^\d+$/.test(name)) {
        const number = parseInt(name, 10);
        field = messageDescriptor.fieldsById[number];
      } else {
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
    } else if (field.resolvedType) {
      // Use duck-typing to check for an enum. An Enum object has `valuesById`.
      if ('valuesById' in field.resolvedType) {
        // Enum
        tokenizer.consume(':');
        this.mergeScalarField(tokenizer, message, field);
      } else {
        // Message
        tokenizer.tryConsume(':');
        this.mergeMessageField(tokenizer, message, field, false);
      }
    } else { // Scalar
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
      } else {
        this.mergeScalarField(tokenizer, message, field);
      }
    }

    if (tokenizer.tryConsume(',')) {
      // consume optional separator
    }
  }

  private parseEnum(field: protobuf.Field, value: string): number {
    const enumType = field.resolvedType as protobuf.Enum;
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

  private mergeScalarField<T extends protobuf.Message>(tokenizer: Tokenizer, message: T, field: protobuf.Field): void {
    let value: any;

    // Use duck-typing to check for an enum. An Enum object has `valuesById`.
    if (field.resolvedType && ('valuesById' in field.resolvedType)) {
      const enumValueStr = tokenizer.consumeIdentifierOrNumber();
      value = this.parseEnum(field, enumValueStr);
    } else {
      value = this.parseScalar(tokenizer, field.type);
    }

    if (field.repeated) {
      if (!Array.isArray((message as any)[field.name])) {
        (message as any)[field.name] = [];
      }
      (message as any)[field.name].push(value);
    } else {
      (message as any)[field.name] = value;
    }
  }

  private mergeMapField<T extends protobuf.Message>(tokenizer: Tokenizer, message: T, field: protobuf.Field): void {
    tokenizer.tryConsume(':');
    const endToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');
    const mapField = field as unknown as protobuf.MapField;

    let key: any;
    let value: any;

    // Maps can be empty
    if (tokenizer.tryConsume(endToken)) {
      return;
    }

    while (true) {
      const name = tokenizer.consumeIdentifier();
      tokenizer.consume(':');

      if (name === 'key') {
        key = this.parseScalar(tokenizer, mapField.keyType);
      } else if (name === 'value') {
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
        } catch(_e) {
          value = this.parseScalar(tokenizer, valueType);
        }
      } else {
        throw tokenizer.parseError(`Unexpected field in map entry: ${name}`);
      }

      tokenizer.tryConsume(',');

      if (tokenizer.tryConsume(endToken)) {
        break;
      }
    }

    if (!(message as any)[field.name]) {
      (message as any)[field.name] = {};
    }
    (message as any)[field.name][key] = value;
  }

  private parseScalar(tokenizer: Tokenizer, type: string): any {
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

  private mergeMessageField<T extends protobuf.Message>(tokenizer: Tokenizer, message: T, field: protobuf.Field, isMapEntry: boolean): void {
    const endToken = tokenizer.tryConsume('<') ? '>' : (tokenizer.consume('{'), '}');

    let subMessage: protobuf.Message;
    if (isMapEntry) {
      const mapEntryTypeName = toPascalCase(field.name) + 'Entry';
      const mapEntryType = field.root.lookupType(mapEntryTypeName);
      subMessage = mapEntryType.create();
    } else if (field.repeated) {
      subMessage = (field.resolvedType as protobuf.Type).create();
      if (!Array.isArray((message as any)[field.name])) {
        (message as any)[field.name] = [];
      }
      (message as any)[field.name].push(subMessage);
    } else {
      subMessage = (message as any)[field.name] || (field.resolvedType as protobuf.Type).create();
      (message as any)[field.name] = subMessage;
    }

    while (!tokenizer.tryConsume(endToken)) {
      if (tokenizer.atEnd()) {
        throw tokenizer.parseError(`Expected "${endToken}"`);
      }
      this.mergeField(tokenizer, subMessage);
    }

    if (isMapEntry) {
      const key = (subMessage as any)['key'];
      const value = (subMessage as any)['value'];

      if (!(message as any)[field.name]) {
        (message as any)[field.name] = {};
      }
      (message as any)[field.name][key] = value;
    }
  }

  private skipField(tokenizer: Tokenizer): void {
    if (tokenizer.tryConsume(':')) {
      // Scalar value
      tokenizer.consumeIdentifierOrNumber();
    } else {
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
