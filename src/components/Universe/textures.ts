import * as THREE from 'three';

// Cache generated textures so we don't recreate them on re-renders
const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Procedural pseudo-random 2D hash for deterministic noise
 */
function hash2D(x: number, y: number, seed: number = 1337): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Smooth cosine interpolation between two values
 */
function interpolate(a: number, b: number, t: number): number {
  const ft = t * Math.PI;
  const f = (1 - Math.cos(ft)) * 0.5;
  return a * (1 - f) + b * f;
}

/**
 * 2D Value Noise with smooth interpolation
 */
function smoothNoise2D(x: number, y: number, seed: number = 1337): number {
  const iX = Math.floor(x);
  const iY = Math.floor(y);
  const fX = x - iX;
  const fY = y - iY;

  const v00 = hash2D(iX, iY, seed);
  const v10 = hash2D(iX + 1, iY, seed);
  const v01 = hash2D(iX, iY + 1, seed);
  const v11 = hash2D(iX + 1, iY + 1, seed);

  const i1 = interpolate(v00, v10, fX);
  const i2 = interpolate(v01, v11, fX);
  return interpolate(i1, i2, fY);
}

/**
 * Fractal Brownian Motion (fBm) for organic cloud structures
 */
function fbm2D(x: number, y: number, octaves: number = 4, seed: number = 1337): number {
  let val = 0;
  let amp = 0.55;
  let freq = 1.0;
  let max = 0;

  for (let i = 0; i < octaves; i++) {
    val += smoothNoise2D(x * freq, y * freq, seed + i * 19.3) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return val / max;
}

/**
 * Soft Gaussian Circular Star Sprite
 * Eliminates square particle rendering artifacts and provides natural point-spread function
 */
export function getStarSpriteTexture(): THREE.CanvasTexture {
  const cacheKey = 'star_sprite_gaussian';
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const cx = 32;
  const cy = 32;
  const imgData = ctx.createImageData(64, 64);
  const data = imgData.data;

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = (y * 64 + x) * 4;
      const dx = (x - cx) / 30;
      const dy = (y - cy) / 30;
      const r2 = dx * dx + dy * dy;

      if (r2 < 1.0) {
        // Multi-tier Gaussian falloff: intense white nucleus + soft ambient envelope
        const core = Math.exp(-r2 * 14.0);
        const halo = Math.exp(-r2 * 3.5) * 0.45;
        const outer = Math.max(0, 1.0 - Math.sqrt(r2)) * 0.15;
        const alpha = Math.min(1.0, core + halo + outer);

        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = Math.floor(alpha * 255);
      } else {
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Luminous Focal Star with 4-Point Optical Diffraction Flare
 */
export function getGlintStarSpriteTexture(): THREE.CanvasTexture {
  const cacheKey = 'star_sprite_glint';
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const cx = 64;
  const cy = 64;

  // 1. Soft spherical halo
  const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
  radGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  radGrad.addColorStop(0.12, 'rgba(240, 245, 255, 0.9)');
  radGrad.addColorStop(0.35, 'rgba(190, 220, 255, 0.4)');
  radGrad.addColorStop(0.7, 'rgba(160, 190, 255, 0.1)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, 128, 128);

  // 2. Optical 4-point cross diffraction spikes (horizontal & vertical)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 56, cy);
  ctx.lineTo(cx + 56, cy);
  ctx.moveTo(cx, cy - 56);
  ctx.lineTo(cx, cy + 56);
  ctx.stroke();

  // Secondary soft flare line
  ctx.strokeStyle = 'rgba(165, 215, 255, 0.4)';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.moveTo(cx - 36, cy);
  ctx.lineTo(cx + 36, cy);
  ctx.moveTo(cx, cy - 36);
  ctx.lineTo(cx, cy + 36);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Organic Diffuse Nebula Texture with Multi-Octave Fractal Clouds
 * Guarantees zero rectangular plane seams through smooth boundary attenuation
 */
export function getNebulaTexture(color1: string, color2: string, seed: number = 42): THREE.CanvasTexture {
  const cacheKey = `nebula_fbm_${color1}_${color2}_${seed}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Parse color strings into RGB
  const c1 = new THREE.Color(color1);
  const c2 = new THREE.Color(color2);

  const cx = 256;
  const cy = 256;
  const maxRadius = 240;

  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= maxRadius) {
        data[idx + 3] = 0;
        continue;
      }

      // Smooth radial envelope to ensure seamless blending at boundaries
      const normDist = dist / maxRadius;
      const envelope = Math.cos(normDist * (Math.PI * 0.5));
      const envelope2 = envelope * envelope;

      // Multi-octave fractal turbulence
      const nx = x * 0.009;
      const ny = y * 0.009;
      const noise = fbm2D(nx, ny, 4, seed);
      const noiseWisp = fbm2D(nx * 2.2 + 5.0, ny * 2.2 + 5.0, 3, seed + 101);

      // Organic density modulated by envelope
      const density = Math.max(0, (noise * 0.75 + noiseWisp * 0.35 - 0.15) * envelope2);

      if (density <= 0.005) {
        data[idx + 3] = 0;
        continue;
      }

      // Color temperature mapping: deep tone -> vibrant ridge -> soft white peak
      const mixFactor = Math.min(1.0, density * 1.8);
      const r = THREE.MathUtils.lerp(c1.r, c2.r, mixFactor);
      const g = THREE.MathUtils.lerp(c1.g, c2.g, mixFactor);
      const b = THREE.MathUtils.lerp(c1.b, c2.b, mixFactor);

      // Highlight core
      const highlight = Math.max(0, density - 0.6) * 0.8;

      data[idx] = Math.min(255, Math.floor((r + highlight) * 255));
      data[idx + 1] = Math.min(255, Math.floor((g + highlight) * 255));
      data[idx + 2] = Math.min(255, Math.floor((b + highlight) * 255));
      data[idx + 3] = Math.min(255, Math.floor(density * 255));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Relativistic Accretion Disk Texture
 * Incorporates Doppler boosting asymmetry, temperature gradient, and gravitational spiral filaments
 */
export function getAccretionDiskTexture(): THREE.CanvasTexture {
  const cacheKey = 'accretion_disk_v2';
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const cx = 512;
  const cy = 512;
  const imgData = ctx.createImageData(1024, 1024);
  const data = imgData.data;

  const innerR = 145;
  const outerR = 500;

  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const idx = (y * 1024 + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      if (r < innerR || r > outerR) {
        data[idx + 3] = 0;
        continue;
      }

      const angle = Math.atan2(dy, dx);
      const normR = (r - innerR) / (outerR - innerR);

      // Relativistic Doppler Beaming asymmetry (approaching side is significantly brighter and hotter)
      const dopplerBoost = 1.0 + 0.38 * Math.cos(angle - 0.35);

      // Spiral turbulence and accretion streams
      const spiralPhase = angle * 4.0 - Math.log(r) * 12.0;
      const filament = 0.85 + 0.15 * Math.sin(spiralPhase) + 0.1 * Math.sin(angle * 8.0 - r * 0.1);

      // Radial density profile (steep inner photon edge, gradual outer dissipation)
      let radialAlpha = 0;
      if (normR < 0.1) {
        radialAlpha = Math.sin((normR / 0.1) * (Math.PI * 0.5));
      } else {
        radialAlpha = Math.pow(1.0 - (normR - 0.1) / 0.9, 1.6);
      }

      const finalAlpha = Math.min(1.0, radialAlpha * dopplerBoost * filament);

      // Thermal gradient: Blinding White/Cyan (inner) -> Electric Violet -> Vivid Magenta -> Deep Indigo (outer)
      let cr = 0;
      let cg = 0;
      let cb = 0;

      if (normR < 0.08) {
        // High-energy photon ring core
        cr = 255;
        cg = 255;
        cb = 255;
      } else if (normR < 0.25) {
        // Electric cyan to violet
        const t = (normR - 0.08) / 0.17;
        cr = THREE.MathUtils.lerp(180, 216, t);
        cg = THREE.MathUtils.lerp(245, 130, t);
        cb = THREE.MathUtils.lerp(255, 255, t);
      } else if (normR < 0.6) {
        // Violet to hot magenta
        const t = (normR - 0.25) / 0.35;
        cr = THREE.MathUtils.lerp(216, 244, t);
        cg = THREE.MathUtils.lerp(130, 114, t);
        cb = THREE.MathUtils.lerp(255, 182, t);
      } else {
        // Magenta to deep indigo
        const t = (normR - 0.6) / 0.4;
        cr = THREE.MathUtils.lerp(244, 99, t);
        cg = THREE.MathUtils.lerp(114, 102, t);
        cb = THREE.MathUtils.lerp(182, 241, t);
      }

      data[idx] = Math.floor(cr);
      data[idx + 1] = Math.floor(cg);
      data[idx + 2] = Math.floor(cb);
      data[idx + 3] = Math.floor(finalAlpha * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedurally generates an astrophotography-grade planetary surface texture
 */
export function getPlanetTexture(type: string, baseColor: string, detailColor: string): THREE.CanvasTexture {
  const cacheKey = `planet_${type}_${baseColor}_${detailColor}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. Base gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, detailColor);
  grad.addColorStop(0.35, baseColor);
  grad.addColorStop(0.5, detailColor);
  grad.addColorStop(0.7, baseColor);
  grad.addColorStop(1, detailColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Type-specific procedural surface features
  if (type === 'crystalline') {
    // Frost crystal patterns, icy fissures
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      let x = Math.random() * canvas.width;
      let y = Math.random() * canvas.height;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (Math.random() - 0.5) * 80;
        y += (Math.random() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (type === 'sanctuary') {
    // Elegant luminous city spires & soft cloud veils
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 50; i++) {
      const cx = Math.random() * canvas.width;
      const cy = Math.random() * canvas.height;
      const r = 20 + Math.random() * 80;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'cyber') {
    // Digital matrix grid & glowing neon circuit lines
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (let y = 40; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    for (let x = 40; x < canvas.width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      // nodes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, (x * 1.5) % canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'chronos') {
    // Astrolabe arcs & golden radial bands
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(canvas.width * 0.5, canvas.height * 0.5, 40 + i * 50, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Meridian ticks
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      ctx.beginPath();
      const cx = canvas.width * 0.5;
      const cy = canvas.height * 0.5;
      ctx.moveTo(cx + Math.cos(angle) * 80, cy + Math.sin(angle) * 80);
      ctx.lineTo(cx + Math.cos(angle) * 220, cy + Math.sin(angle) * 220);
      ctx.stroke();
    }
  } else if (type === 'blossom') {
    // Organic petal clusters / cloud nebulas
    ctx.fillStyle = '#fce7f3';
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) {
      const cx = Math.random() * canvas.width;
      const cy = Math.random() * canvas.height;
      const r = 15 + Math.random() * 50;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'network') {
    // Interconnected graph nodes
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    const pts: [number, number][] = [];
    for (let i = 0; i < 35; i++) {
      pts.push([Math.random() * canvas.width, Math.random() * canvas.height]);
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0];
        const dy = pts[i][1] - pts[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
          ctx.beginPath();
          ctx.moveTo(pts[i][0], pts[i][1]);
          ctx.lineTo(pts[j][0], pts[j][1]);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Oceanic / swirl atmosphere
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < canvas.height; y += 25) {
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += 10) {
        const wave = Math.sin(x * 0.02 + y * 0.03) * 15;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.lineWidth = 12;
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedurally generates a smooth translucent ring texture
 */
export function getRingTexture(color: string): THREE.CanvasTexture {
  const cacheKey = `ring_${color}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.15, `${color}40`);
  grad.addColorStop(0.3, `${color}bb`);
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.48, `${color}30`);
  grad.addColorStop(0.65, `${color}e0`);
  grad.addColorStop(0.85, `${color}50`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}
