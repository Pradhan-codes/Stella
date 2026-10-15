import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export const AsteroidsAndLimb: React.FC = () => {
  const asteroidGroupRef = useRef<THREE.Group>(null);
  const asteroids = useRef<THREE.Mesh[]>([]);

  // Generate 24 irregular asteroid rocks tumbling in the lower foreground
  const asteroidData = useMemo(() => {
    const list = [];
    for (let i = 0; i < 24; i++) {
      // Curve along the lower-left to mid-lower arc
      const t = i / 24;
      const x = -36 + t * 45 + (Math.random() - 0.5) * 6;
      const y = -14 - t * 4 + (Math.random() - 0.5) * 5;
      const z = 8 - t * 14 + (Math.random() - 0.5) * 6;
      const scale = 0.4 + Math.random() * 0.9;
      const rotSpeed: [number, number, number] = [
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
      ];
      list.push({ pos: [x, y, z] as [number, number, number], scale, rotSpeed });
    }
    return list;
  }, []);

  useFrame((_, delta) => {
    asteroids.current.forEach((mesh, index) => {
      if (mesh && asteroidData[index]) {
        const { rotSpeed } = asteroidData[index];
        mesh.rotation.x += rotSpeed[0] * delta;
        mesh.rotation.y += rotSpeed[1] * delta;
        mesh.rotation.z += rotSpeed[2] * delta;
      }
    });
  });

  return (
    <group>
      {/* 1. Large Foreground Planet Rim in Lower-Left Corner */}
      <group position={[-38, -32, 6]}>
        {/* Giant Dark Celestial Sphere */}
        <mesh>
          <sphereGeometry args={[26, 48, 48]} />
          <meshStandardMaterial
            color="#0b0a1a"
            roughness={0.8}
            metalness={0.1}
          />
        </mesh>

        {/* Atmospheric Blue-Pink Horizon Rim Glow */}
        <mesh scale={[1.018, 1.018, 1.018]}>
          <sphereGeometry args={[26, 48, 48]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.35}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Outer Soft Lavender Scatter */}
        <mesh scale={[1.035, 1.035, 1.035]}>
          <sphereGeometry args={[26, 32, 32]} />
          <meshBasicMaterial
            color="#e879f9"
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
          />
        </mesh>
      </group>

      {/* 2. Floating 3D Asteroid Belt Rocks */}
      <group ref={asteroidGroupRef}>
        {asteroidData.map((ast, idx) => (
          <mesh
            key={idx}
            ref={(el) => {
              if (el) asteroids.current[idx] = el;
            }}
            position={ast.pos}
            scale={[ast.scale, ast.scale * (0.8 + Math.random() * 0.4), ast.scale]}
          >
            {/* Irregular rock geometry */}
            <dodecahedronGeometry args={[1, 1]} />
            <meshStandardMaterial
              color="#2a273b"
              roughness={0.9}
              metalness={0.2}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
