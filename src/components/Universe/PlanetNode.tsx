import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { PlanetData, PlanetId } from './types';
import { getPlanetLivePosition } from './planetData';
import { getPlanetTexture, getRingTexture, getStarSpriteTexture, getGlintStarSpriteTexture } from './textures';

interface PlanetNodeProps {
  planet: PlanetData;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (id: PlanetId | null) => void;
  onSelect: (planet: PlanetData) => void;
  reducedMotion?: boolean;
}

export const PlanetNode: React.FC<PlanetNodeProps> = ({
  planet,
  isHovered,
  isSelected,
  onHover,
  onSelect,
  reducedMotion = false,
}) => {
  const planetRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const ringsRef = useRef<THREE.Mesh>(null);
  const sakuraDiscRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const satelliteGroupRef = useRef<THREE.Group>(null);

  // Textures generated procedurally
  const surfaceTexture = useMemo(
    () => getPlanetTexture(planet.features.surfaceTextureType, planet.accentColor, planet.glowColor),
    [planet.features.surfaceTextureType, planet.accentColor, planet.glowColor]
  );

  const ringTexture = useMemo(
    () => (planet.ringColor ? getRingTexture(planet.ringColor) : null),
    [planet.ringColor]
  );

  const auraTexture = useMemo(() => getStarSpriteTexture(), []);
  const glintTexture = useMemo(() => getGlintStarSpriteTexture(), []);

  // Initial base position
  const initialPosition = useMemo(() => {
    return getPlanetLivePosition(planet, 0, true);
  }, [planet]);

  // Directional text alignment matching reference image
  const alignClass = useMemo(() => {
    if (planet.id === 'asuna' || planet.id === 'rei') return 'align-right';
    if (planet.id === 'sakura') return 'align-left';
    return 'align-center';
  }, [planet.id]);

  // Optimal label placement vector relative to planet matching Reference Image
  const labelOffset = useMemo((): [number, number, number] => {
    switch (planet.id) {
      case 'asuna':
        return [-planet.size - 1.15, planet.size * 0.15, 0];
      case 'rei':
        return [-planet.size - 1.35, planet.size * 0.35, 0];
      case 'sakura':
        return [planet.size + 1.45, planet.size * 0.15, 0];
      case 'rin':
      case 'hina':
      case 'rem':
      case 'akari':
      case 'yuki':
      default:
        return [0, -planet.size - 0.72, 0];
    }
  }, [planet.id, planet.size]);

  // Planetary Revolution & Axial Motion (Requirement 4.1)
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // 1. Move planet along its elliptical orbital track in real time
    if (planetRef.current) {
      const livePos = getPlanetLivePosition(planet, t, reducedMotion);
      planetRef.current.position.copy(livePos);

      // Hover scale interpolation
      const targetScale = isHovered ? 1.15 : isSelected ? 1.25 : 1.0;
      planetRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }

    // 2. Subtle axial rotation around own axis
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * planet.rotationSpeed * 2;
    }

    // 3. Ring rotation
    if (ringsRef.current) {
      ringsRef.current.rotation.z += delta * 0.02;
    }

    // 4. Sakura diffuse dust disc rotation
    if (sakuraDiscRef.current) {
      sakuraDiscRef.current.rotation.z += delta * 0.015;
    }

    // 5. Satellites orbiting
    if (satelliteGroupRef.current) {
      satelliteGroupRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <group
      ref={planetRef}
      position={[initialPosition.x, initialPosition.y, initialPosition.z]}
    >
      {/* Interactive Raycast Hitbox (comfortably sized for clicking) */}
      <mesh
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(planet.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(planet);
        }}
      >
        <sphereGeometry args={[Math.max(1.1, planet.size * 2.2), 16, 16]} />
        <meshBasicMaterial />
      </mesh>

      {/* 0. Soft Atmospheric Aura Halo Diffusion behind planet (subtle, restrained) */}
      <mesh position={[0, 0, -0.08]}>
        <planeGeometry args={[planet.size * 2.5, planet.size * 2.5]} />
        <meshBasicMaterial
          map={auraTexture}
          color={planet.glowColor}
          transparent
          opacity={isHovered ? 0.45 : isSelected ? 0.55 : 0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Radiant Optical Diffraction Glint Flare (Akari & Hina starlight features) */}
      {(planet.id === 'akari' || planet.id === 'hina') && (
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[planet.size * (planet.id === 'akari' ? 3.2 : 2.5), planet.size * (planet.id === 'akari' ? 3.2 : 2.5)]} />
          <meshBasicMaterial
            map={glintTexture}
            color={planet.id === 'akari' ? '#ffffff' : '#fbcfe8'}
            transparent
            opacity={planet.id === 'akari' ? 0.6 : 0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Sakura Broad Particulate Dust Ring (Reference Image Feature) */}
      {planet.id === 'sakura' && (
        <mesh
          ref={sakuraDiscRef}
          rotation={[-Math.PI * 0.5 + 0.18, -0.15, 0.10]}
        >
          <ringGeometry args={[planet.size * 1.4, planet.size * 3.8, 64]} />
          <meshBasicMaterial
            map={ringTexture || undefined}
            color="#f472b6"
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 1. Primary Planet Sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(planet.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(planet);
        }}
      >
        <sphereGeometry args={[planet.size, 48, 48]} />
        <meshStandardMaterial
          map={surfaceTexture}
          roughness={0.45}
          metalness={0.15}
          emissive={planet.glowColor}
          emissiveIntensity={isHovered ? 0.35 : isSelected ? 0.5 : 0.12}
        />
      </mesh>

      {/* 2. Atmospheric Rim Glow Shell */}
      <mesh
        ref={atmosphereRef}
        scale={[1.04, 1.04, 1.04]}
      >
        <sphereGeometry args={[planet.size, 32, 32]} />
        <meshBasicMaterial
          color={planet.glowColor}
          transparent
          opacity={isHovered ? 0.35 : 0.16}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Orbital Rings (if configured, excluding Sakura's special disc) */}
      {planet.features.hasRings && planet.id !== 'sakura' && planet.features.ringInnerRadius && planet.features.ringOuterRadius && (
        <mesh
          ref={ringsRef}
          rotation={planet.features.ringTilt || [-Math.PI * 0.5 + 0.25, 0.2, 0]}
        >
          <ringGeometry
            args={[
              planet.features.ringInnerRadius,
              planet.features.ringOuterRadius,
              64,
            ]}
          />
          <meshBasicMaterial
            map={ringTexture || undefined}
            color={planet.ringColor || planet.accentColor}
            transparent
            opacity={isHovered ? 0.85 : 0.6}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 4. Orbital Satellites / Beacons */}
      {planet.features.satellitesCount && planet.features.satellitesCount > 0 && (
        <group ref={satelliteGroupRef}>
          {Array.from({ length: planet.features.satellitesCount }).map((_, idx) => {
            const angle = (idx / (planet.features.satellitesCount || 1)) * Math.PI * 2;
            const dist = planet.size * 1.6 + idx * 0.25;
            return (
              <mesh
                key={idx}
                position={[Math.cos(angle) * dist, Math.sin(angle * 2) * 0.15, Math.sin(angle) * dist]}
              >
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            );
          })}
        </group>
      )}

      {/* 5. 3D Billboarding HTML UI Label & Hover Card matching Reference Image */}
      <Html
        position={labelOffset}
        center
        distanceFactor={32}
        zIndexRange={[20, 5]}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className={`planet-3d-wrapper ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(planet);
          }}
          onMouseEnter={() => onHover(planet.id)}
          onMouseLeave={() => onHover(null)}
          role="button"
          tabIndex={0}
          aria-label={`${planet.name} planet - ${planet.role}: ${planet.tagline}`}
        >
          {/* Reference Image Minimalist Floating Typography */}
          <div className={`reference-planet-label ${alignClass}`}>
            <div className="ref-category">{planet.category || planet.role.toUpperCase()}</div>
            <div className="ref-name">{planet.name}</div>
            <div className="ref-stat" style={{ color: planet.accentColor }}>
              {planet.statBadge || planet.sampleStatus.activeItems}
            </div>
          </div>

          {/* Expanded Rich Preview Card on Hover */}
          {isHovered && (
            <div className="planet-expanded-preview">
              <div className="preview-divider" />
              <div className="preview-desc">{planet.description}</div>
              <div className="preview-meta-row">
                <div className="meta-pill">
                  <span className="status-dot-mini" />
                  <span>{planet.sampleStatus.health}</span>
                </div>
                <div className="meta-pill">
                  <span>{planet.sampleStatus.activeItems}</span>
                </div>
              </div>
              <div className="preview-action-row">
                <button
                  type="button"
                  className="preview-enter-btn"
                  style={{
                    backgroundColor: `${planet.accentColor}25`,
                    borderColor: `${planet.accentColor}90`,
                    color: planet.accentColor,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(planet);
                  }}
                >
                  <span>Enter {planet.name} Workspace</span>
                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
};

