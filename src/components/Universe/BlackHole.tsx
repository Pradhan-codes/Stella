import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getAccretionDiskTexture, getStarSpriteTexture, getNebulaTexture } from './textures';

interface BlackHoleProps {
  position?: [number, number, number];
}

export const BlackHole: React.FC<BlackHoleProps> = ({ position = [0, 0, 0] }) => {
  const diskRef = useRef<THREE.Mesh>(null);
  const warpedLensRef = useRef<THREE.Mesh>(null);
  const fogRef1 = useRef<THREE.Mesh>(null);
  const fogRef2 = useRef<THREE.Mesh>(null);
  const streamsRef = useRef<THREE.Points>(null);

  const accretionTexture = useMemo(() => getAccretionDiskTexture(), []);
  const starTexture = useMemo(() => getStarSpriteTexture(), []);
  // Subtle, restrained muted cosmic haze matching reference image (not oversized vibrant purple)
  const fogSlateTexture = useMemo(() => getNebulaTexture('#0f172a', '#38bdf8', 19), []);
  const fogCharcoalTexture = useMemo(() => getNebulaTexture('#090714', '#1e1b4b', 73), []);

  // Subtle infalling relativistic particle stream (small, restrained)
  const { streamPositions, streamColors } = useMemo(() => {
    const count = 75;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color('#e2e8f0'); // soft white
    const c2 = new THREE.Color('#38bdf8'); // subtle cyan

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.35 + Math.random() * 2.8;
      const height = (Math.random() - 0.5) * 0.15 * (dist / 4);

      positions[i * 3] = Math.cos(angle) * dist;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * dist;

      const lerped = c1.clone().lerp(c2, Math.random());
      colors[i * 3] = lerped.r;
      colors[i * 3 + 1] = lerped.g;
      colors[i * 3 + 2] = lerped.b;
    }

    return { streamPositions: positions, streamColors: colors };
  }, []);

  useFrame((_, delta) => {
    if (diskRef.current) {
      diskRef.current.rotation.z += delta * 0.04;
    }
    if (warpedLensRef.current) {
      warpedLensRef.current.rotation.z -= delta * 0.015;
    }
    if (fogRef1.current) {
      fogRef1.current.rotation.z += delta * 0.01;
    }
    if (fogRef2.current) {
      fogRef2.current.rotation.z -= delta * 0.008;
    }
    if (streamsRef.current) {
      streamsRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <group position={position}>
      {/* 1. Subtle, compact surrounding cosmic fog (faint grey-cyan haze, radius ~5) */}
      <mesh ref={fogRef1} position={[0, -0.05, 0]} rotation={[-Math.PI * 0.5 + 0.04, 0, -0.10]}>
        <planeGeometry args={[11, 11]} />
        <meshBasicMaterial
          map={fogSlateTexture}
          color="#38bdf8"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={fogRef2} position={[0, 0.02, 0]} rotation={[-Math.PI * 0.5 + 0.08, 0, -0.06]}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial
          map={fogCharcoalTexture}
          color="#818cf8"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 2. Gravitational Lensing Arc (arched light above silhouette) */}
      <mesh
        ref={warpedLensRef}
        position={[0, 0.2, -0.1]}
        rotation={[-Math.PI * 0.12, 0.1, 0.05]}
      >
        <ringGeometry args={[1.2, 2.1, 64]} />
        <meshBasicMaterial
          map={accretionTexture}
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Subtle, realistic tilted accretion disk crossing horizontally */}
      <mesh
        ref={diskRef}
        rotation={[-Math.PI * 0.5 + 0.04, 0, -0.10]}
      >
        <ringGeometry args={[1.24, 3.4, 64]} />
        <meshBasicMaterial
          map={accretionTexture}
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 4. Fine infalling relativistic particle stream */}
      <group rotation={[-Math.PI * 0.5 + 0.04, 0, -0.10]}>
        <points ref={streamsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={streamPositions.length / 3}
              array={streamPositions}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              count={streamColors.length / 3}
              array={streamColors}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            map={starTexture}
            size={0.4}
            vertexColors
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>

      {/* 5. Razor-thin brilliant white photon ring */}
      <mesh rotation={[-Math.PI * 0.5 + 0.04, 0, -0.10]}>
        <ringGeometry args={[1.16, 1.23, 128]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.96}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 6. Pitch Black Event Horizon Singularity (small, sharp silhouette matching reference) */}
      <mesh>
        <sphereGeometry args={[1.15, 64, 64]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
};
