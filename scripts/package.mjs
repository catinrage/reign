// Zips a build for another site (see docs/publishing.md): `node scripts/package.mjs itch` packs
// dist/itch into dist/reign-itch.zip, with index.html at the top as itch.io and CrazyGames want.
// Written out by hand (store + deflate, no zip64) so the build needs nothing installed.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const site = process.argv[2];
if (!site) {
	console.error('Usage: node scripts/package.mjs <itch|crazygames>');
	process.exit(1);
}
const dir = join('dist', site);
const out = join('dist', `reign-${site}.zip`);

const CRC = new Uint32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf) {
	let c = 0xffffffff;
	for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function walk(d) {
	return readdirSync(d).flatMap((name) => {
		const p = join(d, name);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

const locals = [];
const centrals = [];
let offset = 0;
// 1980-01-01, the earliest time a zip can say: the same build makes the same zip.
const TIME = 0;
const DATE = (0 << 9) | (1 << 5) | 1;
for (const file of walk(dir).sort()) {
	const name = Buffer.from(relative(dir, file).split(sep).join('/'));
	const data = readFileSync(file);
	const packed = deflateRawSync(data, { level: 9 });
	// Already-compressed files (images, sound, fonts) are stored as they are when deflate can't help.
	const deflate = packed.length < data.length;
	const body = deflate ? packed : data;
	const crc = crc32(data);
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(0x0800, 6); // names are UTF-8
	local.writeUInt16LE(deflate ? 8 : 0, 8);
	local.writeUInt16LE(TIME, 10);
	local.writeUInt16LE(DATE, 12);
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(body.length, 18);
	local.writeUInt32LE(data.length, 22);
	local.writeUInt16LE(name.length, 26);
	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(0x0800, 8);
	central.writeUInt16LE(deflate ? 8 : 0, 10);
	central.writeUInt16LE(TIME, 12);
	central.writeUInt16LE(DATE, 14);
	central.writeUInt32LE(crc, 16);
	central.writeUInt32LE(body.length, 20);
	central.writeUInt32LE(data.length, 24);
	central.writeUInt16LE(name.length, 28);
	central.writeUInt32LE(offset, 42);
	locals.push(local, name, body);
	centrals.push(central, name);
	offset += local.length + name.length + body.length;
}
const dirSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(dirSize, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`${out}: ${centrals.length / 2} files, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
