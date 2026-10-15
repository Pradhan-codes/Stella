import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getNebulaTexture, getStarSpriteTexture } from './textures';

export const NebulaAtmosphere: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.Points>(null);

  // Distinct procedural fractal nebulae with custom color temperatures & random seeds
  const deepIndigoNebula = useMemo(() => getNebulaTexture('#1e1b4b', '#3b0764', 11), []);
  const centralVioletNebula = useMemo(() => getNebulaTexture('#2e1065', '#8b5cf6', 89), []);

  const dustTexture = useMemo(() => getStarSpriteTexture(), []);

  // Sparse, organic cosmic dust particles (quality over quantity)
  const dustPositions = useMemo(() => {
    const count = 180;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Disperse across depth with voids
      pos[i * 3] = (Math.random() - 0.5) * 75;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 45;
    }
    return pos;
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    if (groupRef.current) {
      // Very slow, subtle organic breathing & parallax drift
      groupRef.current.position.y = Math.sin(t * 0.12) * 0.35;
      groupRef.current.rotation.z = Math.sin(t * 0.06) * 0.012;
    }

    if (dustRef.current) {
      dustRef.current.rotation.y += delta * 0.0015;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Deep, subtle interstellar cosmic background (preserves dark negative space) */}
        <mesh position={[0, 0, -55]}>
          <planeGeometry args={[110, 75]} />
          <meshBasicMaterial
            map={deepIndigoNebula}
            transparent
            opacity={0.16}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Very faint, subtle central atmospheric depth */}
        <mesh position={[0, 0, -35]} rotation={[0, 0, 0.05]}>
          <planeGeometry args={[38, 30]} />
          <meshBasicMaterial
            map={centralVioletNebula}
            transparent
            opacity={0.10}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Sparse Floating Cosmic Dust with Soft Circular PSF */}
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={dustPositions.length / 3}
            array={dustPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          map={dustTexture}
          size={0.4}
          color="#94a3b8"
          transparent
          opacity={0.2}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </>
  );
};
