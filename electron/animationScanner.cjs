/**
 * animationScanner.cjs
 *
 * Backend animation asset discovery and binary glTF inspection service for Stella.
 * Discovers and validates .vrma, .glb, and .gltf animation files from the designated
 * animation directory without preloading heavy asset payloads into memory.
 */

const fs = require('fs');
const path = require('path');

// Curated metadata registry for known animations
const KNOWN_ANIMATION_METADATA = {
  'reading (loop).vrma': {
    id: 'reading_loop',
    displayName: 'Reading (Sitting Loop)',
    displayNameJp: '読書（ループ）',
    category: 'idle',
    isLoop: true,
    aliases: [
      'reading',
      'read',
      'read a book',
      'sitting and reading',
      'reading loop',
      'sit and read',
      'read for me',
    ],
    description: 'Sitting relaxed while reading a book in a peaceful loop',
    tags: ['idle', 'sitting', 'reading', 'peaceful', 'loop'],
  },
  'ハッピーシンセサイザ.vrma': {
    id: 'happy_synthesizer',
    displayName: 'Happy Synthesizer',
    displayNameJp: 'ハッピーシンセサイザ',
    category: 'dance',
    isLoop: false,
    aliases: [
      'happy synthesizer',
      'dance',
      'can you dance',
      'dance for me',
      'synthesizer dance',
      'happy dance',
    ],
    description: 'Upbeat energetic dance to Happy Synthesizer',
    tags: ['dance', 'energetic', 'music', 'vocaloid'],
  },
  'vrma_01.vrma': {
    id: 'VRMA_01',
    displayName: 'Show Full Body',
    displayNameJp: '全身を見せる',
    category: 'action',
    isLoop: false,
    aliases: [
      'show full body',
      'full body',
      'show yourself',
      'present yourself',
      'presentation',
      'look at you',
      'show your outfit',
      'show full avatar',
      'vrma_01',
    ],
    description: 'Full body presentation gesture',
    tags: ['presentation', 'full_body', 'action'],
  },
  'vrma_02.vrma': {
    id: 'VRMA_02',
    displayName: 'Greeting Bow',
    displayNameJp: '挨拶',
    category: 'conversational',
    isLoop: false,
    aliases: [
      'greeting',
      'greeting bow',
      'bow',
      'curtsy',
      'polite bow',
      'formal bow',
      'bow for me',
      'give a bow',
      'vrma_02',
    ],
    description: 'Polite greeting bow gesture',
    tags: ['greeting', 'bow', 'polite', 'conversational'],
  },
  'vrma_03.vrma': {
    id: 'VRMA_03',
    displayName: 'Peace Sign',
    displayNameJp: 'Vサイン',
    category: 'cute_poses',
    isLoop: false,
    aliases: [
      'peace sign',
      'peace',
      'victory sign',
      'v sign',
      'peace pose',
      'show peace sign',
      'give me a peace sign',
      'two fingers',
      'vrma_03',
    ],
    description: 'Cheerful peace sign pose',
    tags: ['peace', 'cute', 'pose', 'cheerful'],
  },
  'vrma_04.vrma': {
    id: 'VRMA_04',
    displayName: 'Shoot (Finger Gun)',
    displayNameJp: '撃つ',
    category: 'cute_poses',
    isLoop: false,
    aliases: [
      'shoot',
      'finger gun',
      'finger guns',
      'pew pew',
      'bang',
      'shoot me',
      'celestial shot',
      'playful shot',
      'fire finger guns',
      'vrma_04',
    ],
    description: 'Playful celestial finger-gun gesture',
    tags: ['shoot', 'finger_gun', 'playful', 'cute'],
  },
  'vrma_05.vrma': {
    id: 'VRMA_05',
    displayName: 'Spin (360)',
    displayNameJp: '回る',
    category: 'action',
    isLoop: false,
    aliases: [
      'spin',
      'spin around',
      'twirl',
      'turn around',
      'rotate',
      'do a spin',
      'can you spin',
      'give me a spin',
      'do that spin again',
      'spin for me',
      '360 spin',
      'vrma_05',
    ],
    description: 'Graceful 360-degree spin',
    tags: ['spin', 'twirl', 'action', 'movement'],
  },
  'vrma_06.vrma': {
    id: 'VRMA_06',
    displayName: 'Model Pose',
    displayNameJp: 'モデルポーズ',
    category: 'cute_poses',
    isLoop: false,
    aliases: [
      'model pose',
      'strike a pose',
      'pose for me',
      'pose',
      'show me a pose',
      'runway pose',
      'strike another pose',
      'fashion pose',
      'cute pose',
      'vrma_06',
    ],
    description: 'Confident runway model pose',
    tags: ['pose', 'model', 'runway', 'cute'],
  },
  'vrma_07.vrma': {
    id: 'VRMA_07',
    displayName: 'Squat Warmup',
    displayNameJp: '屈伸運動',
    category: 'action',
    isLoop: false,
    aliases: [
      'squat',
      'do a squat',
      'bend down',
      'warmup squat',
      'crouch',
      'exercise squat',
      'do squats',
      'squat for me',
      'vrma_07',
    ],
    description: 'Light warmup bending gesture',
    tags: ['squat', 'warmup', 'exercise', 'action'],
  },
  'うでぶんぶん.vrma': {
    id: 'VRMA_EXTRA',
    displayName: 'Arm Flailing',
    displayNameJp: 'うでぶんぶん',
    category: 'reactions_surprised',
    isLoop: false,
    aliases: [
      'arm flailing',
      'flail your arms',
      'flail',
      'wave arms',
      'udebunbun',
      'flailing',
      'flail arms',
      'wave your arms around',
      'vrma_extra',
    ],
    description: 'Playful arm flailing motion',
    tags: ['flailing', 'surprised', 'excited', 'playful'],
  },
};

/**
 * Infer category from filename keywords for dynamically added files.
 */
function inferCategoryFromFilename(filename) {
  const lower = filename.toLowerCase();
  if (/\b(idle|breath|breathe|resting|sit|sitting|read|sleep)\b/.test(lower)) {
    return 'idle';
  }
  if (/\b(dance|dancing|waltz|step|disco)\b/.test(lower)) {
    return 'dance';
  }
  if (/\b(cute|pose|peace|shoot|gun|fashion|model|wink)\b/.test(lower)) {
    return 'cute_poses';
  }
  if (/\b(bow|greet|greeting|curtsy|nod|wave|talk|speak|chat)\b/.test(lower)) {
    return 'conversational';
  }
  if (/\b(spin|jump|squat|run|walk|exercise|action|flip)\b/.test(lower)) {
    return 'action';
  }
  if (/\b(happy|joy|laugh|cheer)\b/.test(lower)) {
    return 'reactions_happy';
  }
  if (/\b(sad|cry|grief|sorrow|depressed)\b/.test(lower)) {
    return 'reactions_sad';
  }
  if (/\b(flail|scared|surprised|shock|panic)\b/.test(lower)) {
    return 'reactions_surprised';
  }
  return 'custom';
}

/**
 * Clean human-readable display title from filename.
 */
function beautifyTitle(filename) {
  const base = path.basename(filename, path.extname(filename));
  // Replace underscores and hyphens with spaces
  const spaced = base.replace(/[_-]+/g, ' ').trim();
  // Capitalize words
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse binary glTF (GLB/VRMA) header and JSON chunk to inspect compatibility,
 * duration, and humanoid bone tracks without loading heavy vertex buffers.
 */
function inspectGltfBinary(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(20);
    const bytesRead = fs.readSync(fd, headerBuffer, 0, 20, 0);

    if (bytesRead < 20) {
      return {
        compatibility: 'incompatible',
        compatibilityReason: 'File too small to be a valid glTF binary header',
      };
    }

    // 1. Magic check (0x46546C67 = "glTF")
    const magic = headerBuffer.readUInt32LE(0);
    if (magic !== 0x46546c67) {
      return {
        compatibility: 'incompatible',
        compatibilityReason: 'Invalid glTF binary magic (expected glTF, got 0x' + magic.toString(16) + ')',
      };
    }

    const version = headerBuffer.readUInt32LE(4);
    if (version !== 2) {
      return {
        compatibility: 'incompatible',
        compatibilityReason: `Unsupported glTF version: ${version} (expected version 2)`,
      };
    }

    // Chunk 0 (JSON chunk)
    const jsonChunkLength = headerBuffer.readUInt32LE(12);
    const jsonChunkType = headerBuffer.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) {
      return {
        compatibility: 'incompatible',
        compatibilityReason: 'First chunk is not a valid glTF JSON chunk',
      };
    }

    // Read JSON chunk data
    const jsonBuffer = Buffer.alloc(jsonChunkLength);
    fs.readSync(fd, jsonBuffer, 0, jsonChunkLength, 20);

    const jsonText = jsonBuffer.toString('utf8');
    const gltf = JSON.parse(jsonText);

    // Check extensions
    const extensionsUsed = gltf.extensionsUsed || [];
    const hasVrmAnim =
      extensionsUsed.includes('VRMC_vrm_animation') ||
      Boolean(gltf.extensions && gltf.extensions.VRMC_vrm_animation);

    // Humanoid bones inspection
    let boneCount = 0;
    let hasFacialTracks = false;
    let vrmcAnim = gltf.extensions && gltf.extensions.VRMC_vrm_animation;
    if (vrmcAnim && vrmcAnim.humanoid && vrmcAnim.humanoid.humanBones) {
      const bones = Object.keys(vrmcAnim.humanoid.humanBones);
      boneCount = bones.length;
    }
    if (vrmcAnim && vrmcAnim.expressions) {
      hasFacialTracks = true;
    }

    // Duration extraction from accessors
    let maxDuration = 0;
    if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
      // Find bin chunk start offset
      const binChunkOffset = 20 + jsonChunkLength;
      let binDataStart = -1;
      const fileSize = fs.fstatSync(fd).size;
      if (headerBuffer.length >= 12 && fileSize >= binChunkOffset + 8) {
        const binHeader = Buffer.alloc(8);
        fs.readSync(fd, binHeader, 0, 8, binChunkOffset);
        const binType = binHeader.readUInt32LE(4);
        if (binType === 0x004e4942) {
          binDataStart = binChunkOffset + 8;
        }
      }

      for (const anim of gltf.animations) {
        if (Array.isArray(anim.samplers)) {
          for (const sampler of anim.samplers) {
            const inputAccIndex = sampler.input;
            if (gltf.accessors && gltf.accessors[inputAccIndex]) {
              const acc = gltf.accessors[inputAccIndex];
              if (acc.max && typeof acc.max[0] === 'number') {
                if (acc.max[0] > maxDuration) {
                  maxDuration = acc.max[0];
                }
              } else if (binDataStart > 0 && acc.bufferView !== undefined && acc.count > 0 && acc.componentType === 5126) {
                // Read last float from buffer view
                const bv = gltf.bufferViews && gltf.bufferViews[acc.bufferView];
                if (bv) {
                  const bvOffset = bv.byteOffset || 0;
                  const accOffset = acc.byteOffset || 0;
                  const lastFloatPos = binDataStart + bvOffset + accOffset + (acc.count - 1) * 4;
                  if (lastFloatPos + 4 <= fileSize) {
                    const floatBuf = Buffer.alloc(4);
                    fs.readSync(fd, floatBuf, 0, 4, lastFloatPos);
                    const lastVal = floatBuf.readFloatLE(0);
                    if (!isNaN(lastVal) && lastVal > maxDuration) {
                      maxDuration = lastVal;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!hasVrmAnim && boneCount === 0) {
      return {
        compatibility: 'incompatible',
        compatibilityReason: 'Missing VRMC_vrm_animation humanoid extension',
        duration: maxDuration,
        boneCount: 0,
      };
    }

    return {
      compatibility: 'compatible',
      compatibilityReason: `Validated VRM animation: ${boneCount} retargetable humanoid bones, duration ${maxDuration.toFixed(2)}s`,
      duration: maxDuration,
      boneCount,
      hasFacialTracks,
    };
  } catch (err) {
    return {
      compatibility: 'incompatible',
      compatibilityReason: `Error parsing binary glTF structure: ${err.message}`,
    };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

/**
 * Scan the animations directory, inspect all files, categorize them,
 * write a manifest for web/electron usage, and return the discovery report.
 */
function scanAnimationDirectory(customDir) {
  const rootDir = path.resolve(__dirname, '..');
  const primaryDir = customDir || path.join(rootDir, 'public', 'animations');
  const distDir = path.join(rootDir, 'dist', 'animations');

  const targetDir = fs.existsSync(primaryDir) ? primaryDir : distDir;
  if (!fs.existsSync(targetDir)) {
    return {
      scannedAt: Date.now(),
      directory: targetDir,
      totalFound: 0,
      compatibleCount: 0,
      incompatibleCount: 0,
      animations: [],
    };
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const animations = [];

  for (const entry of entries) {
    // Skip directories and existing manifest files
    if (entry.isDirectory() || entry.name.toLowerCase() === 'manifest.json') {
      continue;
    }

    const fileName = entry.name;
    const filePath = path.join(targetDir, fileName);
    const stats = fs.statSync(filePath);
    const fileSizeBytes = stats.size;
    const ext = path.extname(fileName).toLowerCase();

    const lowerName = fileName.toLowerCase();
    const curated = KNOWN_ANIMATION_METADATA[lowerName];

    let format = 'unknown';
    if (ext === '.vrma') format = 'vrma';
    else if (ext === '.glb') format = 'glb';
    else if (ext === '.gltf') format = 'gltf';

    // Check supported format
    if (format === 'unknown') {
      animations.push({
        id: `unknown_${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        fileName,
        url: `./animations/${encodeURIComponent(fileName)}`,
        displayName: beautifyTitle(fileName),
        category: 'custom',
        format: 'unknown',
        compatibility: 'unsupported_format',
        compatibilityReason: `Unsupported file format '${ext}'. Stella animation system requires .vrma or .glb binary glTF containers.`,
        duration: 0,
        fileSizeBytes,
        tags: ['unsupported'],
        aliases: [],
      });
      continue;
    }

    // Inspect binary glTF
    const inspectResult = inspectGltfBinary(filePath);

    const id = curated ? curated.id : fileName.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const displayName = curated ? curated.displayName : beautifyTitle(fileName);
    const displayNameJp = curated ? curated.displayNameJp : undefined;
    const category = curated ? curated.category : inferCategoryFromFilename(fileName);
    const isLoop = curated ? curated.isLoop : (inspectResult.duration > 60 || lowerName.includes('loop'));
    const aliases = curated ? curated.aliases : [displayName.toLowerCase()];
    const tags = curated ? curated.tags : [category, format];
    const description = curated ? curated.description : `Locally discovered ${format.toUpperCase()} animation`;

    animations.push({
      id,
      fileName,
      url: `./animations/${encodeURIComponent(fileName)}`,
      displayName,
      displayNameJp,
      category,
      format,
      compatibility: inspectResult.compatibility,
      compatibilityReason: inspectResult.compatibilityReason,
      duration: inspectResult.duration || (curated && curated.duration) || 0,
      fileSizeBytes,
      boneCount: inspectResult.boneCount || 0,
      hasFacialTracks: Boolean(inspectResult.hasFacialTracks),
      isLoop,
      tags,
      aliases,
      description,
    });

    // Ensure asset is also present in dist/animations if running in built mode and scanning primary animations dir
    if (!customDir && targetDir === primaryDir && fs.existsSync(distDir)) {
      try {
        const destFile = path.join(distDir, fileName);
        if (!fs.existsSync(destFile) || fs.statSync(destFile).mtimeMs < stats.mtimeMs) {
          fs.copyFileSync(filePath, destFile);
        }
      } catch (copyErr) {
        // Non-fatal
      }
    }
  }

  const compatibleCount = animations.filter((a) => a.compatibility === 'compatible').length;
  const incompatibleCount = animations.filter((a) => a.compatibility !== 'compatible').length;

  const report = {
    scannedAt: Date.now(),
    directory: targetDir,
    totalFound: animations.length,
    compatibleCount,
    incompatibleCount,
    animations,
  };

  // Write manifest.json so web-based and dev servers can load it statically
  try {
    const manifestJson = JSON.stringify(report, null, 2);
    const manifestPath = path.join(targetDir, 'manifest.json');
    fs.writeFileSync(manifestPath, manifestJson, 'utf8');

    if (!customDir && targetDir === primaryDir && fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, 'manifest.json'), manifestJson, 'utf8');
    }
  } catch (manifestErr) {
    console.warn('[AnimationScanner] Failed to write manifest.json:', manifestErr.message);
  }

  return report;
}

module.exports = {
  scanAnimationDirectory,
  KNOWN_ANIMATION_METADATA,
};
