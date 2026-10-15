import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PLANETS_DATA, getPlanetOrbitPosition } from './planetData';
import { getStarSpriteTexture } from './textures';

export const OrbitalGuideLines: React.FC = () => {
  const dotTexture = useMemo(() => getStarSpriteTexture(), []);
  const pulsePointsRef = useRef<THREE.Points>(null);

  // 1. Eight distinct, individually defined planetary orbit tracks
  const planetTracks = useMemo(() => {
    return PLANETS_DATA.map((planet) => {
      const segments = 160;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(getPlanetOrbitPosition(planet, theta));
      }
      return {
        id: planet.id,
        geometry: new THREE.BufferGeometry().setFromPoints(pts),
        color: planet.accentColor,
      };
    });
  }, []);

  // 2. Delicate travelling photon highlights (one along each of the 8 distinct orbits)
  const pulseGeometry = useMemo(() => {
    const pulseCount = PLANETS_DATA.length;
    const pulsePositions = new Float32Array(pulseCount * 3);
    const pulseColors = new Float32Array(pulseCount * 3);

    PLANETS_DATA.forEach((planet, idx) => {
      const col = new THREE.Color(planet.accentColor).lerp(new THREE.Color('#ffffff'), 0.45);
      pulseColors[idx * 3] = col.r;
      pulseColors[idx * 3 + 1] = col.g;
      pulseColors[idx * 3 + 2] = col.b;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));
    return geo;
  }, []);

  // 3. Central concentric guide rings around black hole in shared reference plane
  const innerRings = useMemo(() => {
    const rings = [2.2, 3.8, 5.4];
    const tiltAngle = -0.10;
    const cosT = Math.cos(tiltAngle);
    const sinT = Math.sin(tiltAngle);

    return rings.map((radius, idx) => {
      const dotCount = idx === 0 ? 28 : idx === 1 ? 40 : 52;
      const positions = new Float32Array(dotCount * 3);
      for (let i = 0; i < dotCount; i++) {
        const theta = (i / dotCount) * Math.PI * 2;
        const x0 = (radius * 0.78) * Math.sin(theta);
        const z0 = -radius * Math.cos(theta);
        positions[i * 3] = x0 * cosT - z0 * sinT;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = x0 * sinT + z0 * cosT;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      return { radius, geometry: geo };
    });
  }, []);

  // Animate traveling photon highlights along each planet's individual orbit
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (pulsePointsRef.current) {
      const posAttr = pulsePointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;

      PLANETS_DATA.forEach((planet, idx) => {
        // Offset from the planet position by 180 degrees so it moves along the opposite side of the orbit
        const theta = planet.orbitAngle + Math.PI + t * (planet.orbitSpeed * 1.5);
        const pt = getPlanetOrbitPosition(planet, theta);
        array[idx * 3] = pt.x;
        array[idx * 3 + 1] = pt.y;
        array[idx * 3 + 2] = pt.z;
      });

      posAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* A. Concentric inner guide rings around Black Hole */}
      {innerRings.map((ring, idx) => (
        <points key={idx} geometry={ring.geometry}>
          <pointsMaterial
            map={dotTexture}
            size={0.28}
            color="#94a3b8"
            transparent
            opacity={0.14}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      ))}

      {/* B. The Eight Distinct Planetary Orbit Tracks */}
      {planetTracks.map((item) => (
        <lineLoop key={item.id} geometry={item.geometry}>
          <lineBasicMaterial
            color={item.color}
            transparent
            opacity={0.20}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineLoop>
      ))}

      {/* C. Delicate traveling photon highlights along each individual orbit */}
      <points ref={pulsePointsRef} geometry={pulseGeometry}>
        <pointsMaterial
          map={dotTexture}
          size={0.65}
          vertexColors
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
};

