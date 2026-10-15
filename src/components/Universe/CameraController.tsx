import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import { PlanetData, CameraViewMode } from './types';
import { getPlanetLivePosition } from './planetData';

interface CameraControllerProps {
  mode: CameraViewMode;
  selectedPlanet: PlanetData | null;
  onEntryComplete: () => void;
  onZoomComplete: () => void;
  onReturnComplete: () => void;
  reducedMotion: boolean;
}

const OVERVIEW_POS = new THREE.Vector3(0, 30.0, 23.4);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);

export const CameraController: React.FC<CameraControllerProps> = ({
  mode,
  selectedPlanet,
  onEntryComplete,
  onZoomComplete,
  onReturnComplete,
  reducedMotion,
}) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsType>(null);
  const animProgress = useRef<number>(0);
  const startPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const startTarget = useRef<THREE.Vector3>(new THREE.Vector3());
  const destPos = useRef<THREE.Vector3>(OVERVIEW_POS.clone());
  const destTarget = useRef<THREE.Vector3>(OVERVIEW_TARGET.clone());
  const isTransitioning = useRef<boolean>(false);
  const currentMode = useRef<CameraViewMode>(mode);

  // Initialize camera
  useEffect(() => {
    if (reducedMotion) {
      camera.position.copy(OVERVIEW_POS);
      camera.lookAt(OVERVIEW_TARGET);
      onEntryComplete();
      return;
    }

    // High cosmic entry start position
    camera.position.set(0, 65, 50);
    camera.lookAt(0, 0, 0);
    startPos.current.set(0, 65, 50);
    startTarget.current.set(0, 0, 0);
    destPos.current.copy(OVERVIEW_POS);
    destTarget.current.copy(OVERVIEW_TARGET);
    animProgress.current = 0;
    isTransitioning.current = true;
    currentMode.current = 'entering';
  }, [reducedMotion]);

  // Mode or selected planet changes
  useEffect(() => {
    if (reducedMotion) {
      if (mode === 'zoomed' && selectedPlanet) {
        const livePos = getPlanetLivePosition(selectedPlanet, 0, true);
        camera.position.set(livePos.x, livePos.y + 1.8, livePos.z + 2.5);
        camera.lookAt(livePos.x, livePos.y, livePos.z);
        if (controlsRef.current) {
          controlsRef.current.target.copy(livePos);
        }
        onZoomComplete();
      } else if (mode === 'overview' || mode === 'returning') {
        camera.position.copy(OVERVIEW_POS);
        camera.lookAt(OVERVIEW_TARGET);
        if (controlsRef.current) {
          controlsRef.current.target.copy(OVERVIEW_TARGET);
        }
        onReturnComplete();
      }
      return;
    }

    if (mode === 'zoomed' && selectedPlanet) {
      startPos.current.copy(camera.position);
      if (controlsRef.current) {
        startTarget.current.copy(controlsRef.current.target);
      } else {
        startTarget.current.copy(OVERVIEW_TARGET);
      }

      // Initial approach destination
      const livePos = getPlanetLivePosition(selectedPlanet, 0, false);
      destPos.current.set(
        livePos.x,
        livePos.y + 1.8,
        livePos.z + 2.5
      );
      destTarget.current.copy(livePos);

      animProgress.current = 0;
      isTransitioning.current = true;
      currentMode.current = 'zoomed';
    } else if (mode === 'returning') {
      startPos.current.copy(camera.position);
      if (controlsRef.current) {
        startTarget.current.copy(controlsRef.current.target);
      } else {
        startTarget.current.set(0, 0, 0);
      }
      destPos.current.copy(OVERVIEW_POS);
      destTarget.current.copy(OVERVIEW_TARGET);

      animProgress.current = 0;
      isTransitioning.current = true;
      currentMode.current = 'returning';
    }
  }, [mode, selectedPlanet, reducedMotion]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // 1. Maintain smooth damping and update OrbitControls during interactive overview
    if (controlsRef.current && currentMode.current === 'overview' && !isTransitioning.current) {
      controlsRef.current.update();
    }

    // 2. If zoomed and not transitioning, smoothly track the revolving planet
    if (!isTransitioning.current && currentMode.current === 'zoomed' && selectedPlanet) {
      const livePos = getPlanetLivePosition(selectedPlanet, t, reducedMotion);
      camera.position.set(
        livePos.x,
        livePos.y + 1.8,
        livePos.z + 2.5
      );
      camera.lookAt(livePos);
      if (controlsRef.current) {
        controlsRef.current.target.copy(livePos);
      }
      return;
    }

    if (!isTransitioning.current) return;

    // Advance smooth ease transition
    const speed = currentMode.current === 'entering' ? 0.75 : 1.05;
    animProgress.current = Math.min(1.0, animProgress.current + delta * speed);

    // Smooth cubic ease-out
    const progress = 1 - Math.pow(1 - animProgress.current, 3);

    // If zooming into moving planet, dynamically update destination to its live position
    if (currentMode.current === 'zoomed' && selectedPlanet) {
      const livePos = getPlanetLivePosition(selectedPlanet, t, reducedMotion);
      destPos.current.set(
        livePos.x,
        livePos.y + 1.8,
        livePos.z + 2.5
      );
      destTarget.current.copy(livePos);
    }

    camera.position.lerpVectors(startPos.current, destPos.current, progress);

    const currentLookAt = new THREE.Vector3().lerpVectors(
      startTarget.current,
      destTarget.current,
      progress
    );
    camera.lookAt(currentLookAt);

    if (controlsRef.current) {
      controlsRef.current.target.copy(currentLookAt);
      controlsRef.current.update();
    }

    if (animProgress.current >= 1.0) {
      isTransitioning.current = false;
      if (currentMode.current === 'entering') {
        currentMode.current = 'overview';
        onEntryComplete();
      } else if (currentMode.current === 'zoomed') {
        onZoomComplete();
      } else if (currentMode.current === 'returning') {
        currentMode.current = 'overview';
        onReturnComplete();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={!isTransitioning.current && mode === 'overview'}
      enableDamping
      dampingFactor={0.06}
      minDistance={14}
      maxDistance={85}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI * 0.55}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      enablePan={false}
      target={OVERVIEW_TARGET}
    />
  );
};
