import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { getStarSpriteTexture } from './textures';

export const StellaCore: React.FC = () => {
  const crystalRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.LineSegments>(null);
  const innerCoreRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Group>(null);
  const ring2Ref = useRef<THREE.Group>(null);
  const ring3Ref = useRef<THREE.Group>(null);
  const fogRef = useRef<THREE.Points>(null);
  const auraRef = useRef<THREE.Mesh>(null);

  const starTexture = useMemo(() => getStarSpriteTexture(), []);

  // Fog mist particles around the central crystal
  const fogPositions = useMemo(() => {
    const count = 220;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 1.8 + Math.random() * 5.2;
      const y = (Math.random() - 0.5) * 2.2;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
    }
    return pos;
  }, []);

  // Beacons along the middle orbital ring
  const beacons = useMemo(() => [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3], []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // 1. Crystal gentle rotation & harmonic breathing pulse
    if (crystalRef.current) {
      crystalRef.current.rotation.y += delta * 0.22;
      const pulse = 1.0 + Math.sin(time * 1.8) * 0.05;
      crystalRef.current.scale.set(1.4 * pulse, 3.2 * pulse, 1.4 * pulse);
    }

    if (wireframeRef.current) {
      wireframeRef.current.rotation.y -= delta * 0.14;
      const pulse = 1.0 + Math.sin(time * 1.8) * 0.05;
      wireframeRef.current.scale.set(1.42 * pulse, 3.24 * pulse, 1.42 * pulse);
    }

    if (innerCoreRef.current) {
      innerCoreRef.current.rotation.y += delta * 0.35;
      innerCoreRef.current.rotation.x += delta * 0.25;
    }

    // 2. Orbital energy rings differential rotation
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += delta * 0.16;
      ring1Ref.current.rotation.x = Math.sin(time * 0.5) * 0.12 + 0.08;
    }

    if (ring2Ref.current) {
      ring2Ref.current.rotation.z -= delta * 0.1;
      ring2Ref.current.rotation.y = Math.cos(time * 0.4) * 0.1 - 0.04;
    }

    if (ring3Ref.current) {
      ring3Ref.current.rotation.z += delta * 0.05;
    }

    // 3. Swirling core celestial fog
    if (fogRef.current) {
      fogRef.current.rotation.y += delta * 0.035;
    }

    // 4. Soft atmospheric aura breathing
    if (auraRef.current) {
      const auraPulse = 1.0 + Math.sin(time * 1.5) * 0.08;
      auraRef.current.scale.set(auraPulse, auraPulse, auraPulse);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Dynamic Luminous Point Light from Core */}
      <pointLight color="#22d3ee" intensity={4.2} distance={38} decay={2} />
      <pointLight color="#a5f3fc" intensity={2.5} distance={18} decay={2} />

      {/* 0. Soft Atmospheric Radial Halo Aura behind crystal */}
      <mesh ref={auraRef} position={[0, 0, -0.5]}>
        <planeGeometry args={[14, 14]} />
        <meshBasicMaterial
          map={starTexture}
          color="#06b6d4"
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 1. Central Translucent Faceted Crystal (Octahedron / Double Pyramid) */}
      <mesh ref={crystalRef} scale={[1.4, 3.2, 1.4]}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial
          color="#22d3ee"
          emissive="#0891b2"
          emissiveIntensity={0.85}
          roughness={0.08}
          metalness={0.12}
          transmission={0.7}
          ior={1.65}
          thickness={1.6}
          transparent
          opacity={0.94}
        />
      </mesh>

      {/* 2. Emissive Edge Lines on Crystal Facets */}
      <lineSegments ref={wireframeRef} scale={[1.42, 3.24, 1.42]}>
        <edgesGeometry args={[new THREE.OctahedronGeometry(1, 0)]} />
        <lineBasicMaterial
          color="#cffafe"
          transparent
          opacity={0.9}
          linewidth={2}
        />
      </lineSegments>

      {/* 3. Intense Inner Singularity Spark */}
      <mesh ref={innerCoreRef}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshBasicMaterial
          color="#ffffff"
          wireframe
        />
      </mesh>

      {/* 4. Concentric Orbital Energy Rings */}
      {/* Ring 1 (Inner tight glowing ring) */}
      <group ref={ring1Ref} rotation={[Math.PI * 0.45, 0, 0]}>
        <mesh>
          <ringGeometry args={[3.8, 3.92, 64]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.75}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Ring 2 (Middle ring with beacon nodes) */}
      <group ref={ring2Ref} rotation={[Math.PI * 0.48, 0.15, 0]}>
        <mesh>
          <ringGeometry args={[5.2, 5.28, 64]} />
          <meshBasicMaterial
            color="#22d3ee"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* Orbital Beacon Spheres */}
        {beacons.map((angle, idx) => (
          <mesh
            key={idx}
            position={[Math.cos(angle) * 5.24, Math.sin(angle) * 5.24, 0]}
          >
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>

      {/* Ring 3 (Outer delicate halo ring) */}
      <group ref={ring3Ref} rotation={[Math.PI * 0.5, 0, 0]}>
        <mesh>
          <ringGeometry args={[7.2, 7.25, 64]} />
          <meshBasicMaterial
            color="#06b6d4"
            transparent
            opacity={0.38}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* 5. Celestial Core Fog / Particle Mist with Soft Gaussian PSF */}
      <points ref={fogRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={fogPositions.length / 3}
            array={fogPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={starTexture}
          size={1.1}
          color="#67e8f9"
          transparent
          opacity={0.42}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 6. Central Core 3D Floating Label matching the visual reference */}
      <Html
        position={[0, -3.8, 0]}
        center
        distanceFactor={32}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div className="stella-core-3d-label">
          <div className="core-label-title">Stella Core</div>
          <div className="core-label-sub">The heart of your universe</div>
        </div>
      </Html>
    </group>
  );
};
