const fs = require('fs');
const path = require('path');

function inspectGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonBuf = buf.subarray(20, 20 + jsonChunkLength);
  const gltf = JSON.parse(jsonBuf.toString('utf8'));

  const binChunkOffset = 20 + jsonChunkLength;
  const binDataOffset = binChunkOffset + 8;

  const vrmc = gltf.extensions?.VRMC_vrm_animation;
  const headNodeIndex = vrmc?.humanoid?.humanBones?.head?.node;
  console.log('Head bone node index:', headNodeIndex);

  const anim = gltf.animations?.[0];
  if (!anim) return;

  const headChannel = anim.channels.find(c => c.target.node === headNodeIndex && c.target.path === 'rotation');
  if (!headChannel) {
    console.log('No rotation channel found for head node');
    return;
  }

  const sampler = anim.samplers[headChannel.sampler];
  const inputAccessor = gltf.accessors[sampler.input];
  const outputAccessor = gltf.accessors[sampler.output];

  // Helper to read float32 array from accessor
  function readAccessor(acc) {
    const bv = gltf.bufferViews[acc.bufferView];
    const byteOffset = binDataOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const count = acc.count;
    const numComponents = acc.type === 'SCALAR' ? 1 : acc.type === 'VEC4' ? 4 : 3;
    const result = [];
    for (let i = 0; i < count; i++) {
      const item = [];
      for (let c = 0; c < numComponents; c++) {
        item.push(buf.readFloatLE(byteOffset + (i * numComponents + c) * 4));
      }
      result.push(numComponents === 1 ? item[0] : item);
    }
    return result;
  }

  const times = readAccessor(inputAccessor);
  const quats = readAccessor(outputAccessor);

  console.log(`Total keyframes for head rotation: ${times.length}`);
  const range = times
    .map((t, i) => ({ t, q: quats[i] }))
    .filter(k => k.t >= 6.5 && k.t <= 7.27);
  console.log('Keyframes between 6.5s and 7.27s (count = ' + range.length + '):');
  range.slice(0, 10).forEach(k => console.log(`  t=${k.t.toFixed(4)}: q=[${k.q.map(v => v.toFixed(4)).join(', ')}]`));
  if (range.length > 10) {
    console.log('  ...');
    range.slice(-10).forEach(k => console.log(`  t=${k.t.toFixed(4)}: q=[${k.q.map(v => v.toFixed(4)).join(', ')}]`));
  }
}

const vrmaPath = path.join(__dirname, '../public/animations/VRMA_02.vrma');
inspectGlb(vrmaPath);
