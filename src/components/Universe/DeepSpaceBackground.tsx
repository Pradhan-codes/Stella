import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getStarSpriteTexture, getGlintStarSpriteTexture } from './textures';

export const DeepSpaceBackground: React.FC = () => {
  const microFieldRef = useRef<THREE.Points>(null);
  const midStarsRef = useRef<THREE.Points>(null);
  const glintStarsRef = useRef<THREE.Points>(null);

  const starTexture = useMemo(() => getStarSpriteTexture(), []);
  const glintTexture = useMemo(() => getGlintStarSpriteTexture(), []);

  // 1. Distant Microscopic Starfield: 1,100 subtle, tiny stars with natural cosmic voids
  const { microPos, microCols } = useMemo(() => {
    const count = 1100;
    const microPos = new Float32Array(count * 3);
    const microCols = new Float32Array(count * 3);

    const palette = [
      new THREE.Color('#ffffff'), // pure white
      new THREE.Color('#bfdbfe'), // soft electric blue
      new THREE.Color('#ddd6fe'), // celestial lavender
      new THREE.Color('#fbcfe8'), // subtle rose
      new THREE.Color('#fef08a'), // warm stellar gold
      new THREE.Color('#a5f3fc'), // cyan tint
    ];

    for (let i = 0; i < count; i++) {
      // Cosmic galactic clustering with large dark negative voids
      const r = 85 + Math.random() * 80;
      // Bias angle toward an inclined celestial galactic band
      const galacticBand = Math.random() > 0.35;
      const theta = Math.random() * Math.PI * 2;
      const phi = galacticBand
        ? Math.PI * 0.5 + (Math.random() - 0.5) * 0.9
        : Math.acos(Math.random() * 2 - 1);

      microPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      microPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      microPos[i * 3 + 2] = r * Math.cos(phi);

      const color = palette[Math.floor(Math.random() * palette.length)];
      // Natural magnitude variation (dimmer background)
      const brightness = 0.35 + Math.random() * 0.55;
      microCols[i * 3] = color.r * brightness;
      microCols[i * 3 + 1] = color.g * brightness;
      microCols[i * 3 + 2] = color.b * brightness;
    }

    return { microPos, microCols };
  }, []);

  // 2. Mid-Distance Clustered Stars: 320 distinct stars with soft Airy point spread function
  const { midPos, midCols } = useMemo(() => {
    const count = 320;
    const midPos = new Float32Array(count * 3);
    const midCols = new Float32Array(count * 3);

    const palette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#93c5fd'),
      new THREE.Color('#c4b5fd'),
      new THREE.Color('#67e8f9'),
      new THREE.Color('#fed7aa'),
    ];

    for (let i = 0; i < count; i++) {
      const r = 50 + Math.random() * 55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.PI * 0.45 + (Math.random() - 0.5) * 1.4;

      midPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      midPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      midPos[i * 3 + 2] = r * Math.cos(phi);

      const color = palette[Math.floor(Math.random() * palette.length)];
      const brightness = 0.7 + Math.random() * 0.3;
      midCols[i * 3] = color.r * brightness;
      midCols[i * 3 + 1] = color.g * brightness;
      midCols[i * 3 + 2] = color.b * brightness;
    }

    return { midPos, midCols };
  }, []);

  // 3. Rare Luminous Focal Beacons with 4-Point Optical Diffraction Flares: 24 prominent stars
  const { glintPos, glintCols } = useMemo(() => {
    const count = 26;
    const glintPos = new Float32Array(count * 3);
    const glintCols = new Float32Array(count * 3);

    const palette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#a5f3fc'),
      new THREE.Color('#e0e7ff'),
      new THREE.Color('#fef08a'),
      new THREE.Color('#fbcfe8'),
    ];

    for (let i = 0; i < count; i++) {
      const r = 45 + Math.random() * 40;
      const theta = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const phi = Math.PI * 0.4 + (Math.random() - 0.5) * 0.8;

      glintPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      glintPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      glintPos[i * 3 + 2] = r * Math.cos(phi) - 8;

      const color = palette[i % palette.length];
      glintCols[i * 3] = color.r;
      glintCols[i * 3 + 1] = color.g;
      glintCols[i * 3 + 2] = color.b;
    }

    return { glintPos, glintCols };
  }, []);

  // Subtle asynchronous cosmic scintillation
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    if (microFieldRef.current) {
      microFieldRef.current.rotation.y += delta * 0.0006;
    }

    if (midStarsRef.current) {
      midStarsRef.current.rotation.y += delta * 0.001;
      // Gentle pulse on material opacity to simulate global atmosphere scintillation
      const mat = midStarsRef.current.material as THREE.PointsMaterial;
      if (mat) {
        mat.opacity = 0.78 + Math.sin(t * 1.2) * 0.08;
      }
    }

    if (glintStarsRef.current) {
      glintStarsRef.current.rotation.y += delta * 0.0008;
      const mat = glintStarsRef.current.material as THREE.PointsMaterial;
      if (mat) {
        // Slow elegant breathing of beacon stars
        mat.opacity = 0.85 + Math.sin(t * 0.9) * 0.12;
      }
    }
  });

  return (
    <group>
      {/* Layer 1: Distant Microscopic Starfield */}
      <points ref={microFieldRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={microPos.length / 3}
            array={microPos}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={microCols.length / 3}
            array={microCols}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={starTexture}
          size={0.9}
          vertexColors
          transparent
          opacity={0.65}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Layer 2: Mid-Distance Clustered Stars with Soft PSF */}
      <points ref={midStarsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={midPos.length / 3}
            array={midPos}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={midCols.length / 3}
            array={midCols}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={starTexture}
          size={1.65}
          vertexColors
          transparent
          opacity={0.82}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Layer 3: Rare Luminous Focal Beacons with 4-Point Optical Diffraction Spikes */}
      <points ref={glintStarsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={glintPos.length / 3}
            array={glintPos}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={glintCols.length / 3}
            array={glintCols}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={glintTexture}
          size={3.4}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
};
