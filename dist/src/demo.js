import pb from 'protobufjs';
import { parse } from './parser.js';
import * as fs from 'node:fs/promises';
const namespace = await pb.load('./fonts_public.proto');
const type = namespace.lookupType('FamilyProto');
const message = type.create({});
const pbFile = process.argv[2];
const contents = await fs.readFile(pbFile, 'utf-8');
// eslint-disable-next-line no-console
console.log(parse(contents, message));
//# sourceMappingURL=demo.js.map