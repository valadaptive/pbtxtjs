import { default as protobuf } from 'protobufjs';
/**
 * Thrown in case of text parsing or tokenizing error.
 */
export declare class ParseError extends Error {
    line?: number | undefined;
    column?: number | undefined;
    constructor(message: string, line?: number | undefined, column?: number | undefined);
}
/**
 * Parses a text representation of a protocol message into a message.
 *
 * @param text Message text representation.
 * @param message A protocol buffer message to merge into.
 * @param options Parser options.
 * @returns The message passed as argument.
 */
export declare function parse<T extends protobuf.Message>(text: string, message: T, options?: ParserOptions): T;
export interface ParserOptions {
    allowUnknownExtension?: boolean;
    allowFieldNumber?: boolean;
    descriptorPool?: protobuf.Root;
    allowUnknownField?: boolean;
}
