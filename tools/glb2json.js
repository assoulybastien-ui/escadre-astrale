// GLB -> glTF JSON autonome (buffer en data URI), servable en .json
const fs = require('fs');
const [inp, out] = process.argv.slice(2);
const b = fs.readFileSync(inp);
if (b.readUInt32LE(0) !== 0x46546C67) throw new Error('not glb');
let off = 12, json = null, bin = null;
while (off < b.length) {
  const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
  const data = b.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8').replace(/[\u0000 ]+$/, ''));
  else if (type === 0x004E4942) bin = data;
  off += 8 + len;
}
json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
fs.writeFileSync(out, JSON.stringify(json));
console.log(out, fs.statSync(out).size);
