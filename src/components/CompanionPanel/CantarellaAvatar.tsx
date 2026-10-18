import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { CelestialAvatar } from './CelestialAvatar';
import {
  CantarellaExpressionController,
  cantarellaExpressionController,
  CantarellaExpressionName,
} from './CantarellaExpressionController';
import { CantarellaIdleController } from './CantarellaIdleController';
import { cantarellaAnimationManager } from './CantarellaAnimationManager';

export interface CantarellaAvatarProps {
  className?: string;
  style?: React.CSSProperties;
  modelUrl?: string;
  framing?: 'full' | 'portrait';
  controller?: CantarellaExpressionController;
  activeExpression?: CantarellaExpressionName;
  onLoaded?: (vrm: VRM) => void;
  onError?: (error: unknown) => void;
}

// Module-level cache for the loaded VRM instance to avoid re-fetching 53MB & re-parsing
let cachedVrm: VRM | null = null;
let loadPromise: Promise<VRM> | null = null;

export const CantarellaAvatar: React.FC<CantarellaAvatarProps> = ({
  className,
  style,
  modelUrl = './models/cantarella.vrm',
  framing = 'full',
  controller,
  activeExpression,
  onLoaded,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>(() => {
    return cachedVrm ? 'success' : 'loading';
  });

  const expressionCtrl = controller || cantarellaExpressionController;

  // React to external activeExpression changes
  useEffect(() => {
    if (activeExpression) {
      expressionCtrl.setExpression(activeExpression);
    }
  }, [activeExpression, expressionCtrl]);

  useEffect(() => {
    let isMounted = true;
    let animId: number | null = null;
    let currentVrm: VRM | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let idleController: CantarellaIdleController | null = null;

    const container = containerRef.current;
    if (!container) return;

    // 1. Measure container dimensions
    const width = container.clientWidth || 300;
    const height = container.clientHeight || 520;

    // 2. Setup Three.js Scene, Camera, and Lights
    const scene = new THREE.Scene();

    // Full-body framing (Cantarella height: 1.618m from Y=0.00 to Y=1.616m; center at Y=0.81m)
    // vs Portrait framing (waist-up for astrolabe circle ring)
    const isFullFraming = framing === 'full';
    const cameraFov = isFullFraming ? 30 : 29;
    const cameraPosY = isFullFraming ? 0.81 : 1.25;
    const cameraPosZ = isFullFraming ? 3.28 : 2.05;
    const targetPosY = isFullFraming ? 0.81 : 1.20;

    const camera = new THREE.PerspectiveCamera(cameraFov, width / height, 0.1, 20.0);
    camera.position.set(0, cameraPosY, cameraPosZ);
    camera.lookAt(0, targetPosY, 0);

    // 3. Initialize WebGLRenderer dynamically on container
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'default',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);

      renderer.domElement.className = 'cantarella-canvas';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.top = '0';
      renderer.domElement.style.left = '0';
      renderer.domElement.style.pointerEvents = 'none';
      renderer.domElement.style.objectFit = 'contain';

      container.appendChild(renderer.domElement);
    } catch (err) {
      console.warn('CantarellaAvatar: WebGLRenderer creation failed:', err);
      setLoadState('error');
      onError?.(err);
      return;
    }

    // Directional Key Light (soft warm illumination)
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.35);
    keyLight.position.set(1.0, 1.6, 1.5);
    scene.add(keyLight);

    // Ambient Fill Light (celestial lilac hue matching Stella aesthetic)
    const ambientLight = new THREE.AmbientLight(0xd5cdf0, 0.85);
    scene.add(ambientLight);

    // Rim / Backlight for ethereal celestial separation
    const rimLight = new THREE.DirectionalLight(0x9d85e4, 0.55);
    rimLight.position.set(-1.2, 1.4, -1.0);
    scene.add(rimLight);

    // 4. Load or reuse cached VRM model
    const applyVrm = (vrm: VRM) => {
      scene.add(vrm.scene);
      currentVrm = vrm;
      const box = new THREE.Box3().setFromObject(vrm.scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      console.log(`[Cantarella Bounds] minY=${box.min.y.toFixed(3)}, maxY=${box.max.y.toFixed(3)}, height=${size.y.toFixed(3)}, centerY=${center.y.toFixed(3)}`);

      // Initialize idle animation controller (breathing, biological blinking, Lissajous head drift, eye gaze)
      idleController = new CantarellaIdleController(vrm, camera, scene, { framing });
      if (typeof window !== 'undefined') {
        (window as unknown as { __stellaIdleController?: CantarellaIdleController }).__stellaIdleController = idleController;
      }

      // Attach VRM to imported VRMA animation manager (AnimationMixer)
      cantarellaAnimationManager.attachVRM(vrm);

      // Connect active VRM to facial expression controller and gesture handler
      expressionCtrl.attachVRM(vrm);
      expressionCtrl.setGestureHandler((gesture) => {
        const isMotionActive = cantarellaAnimationManager.isPlaying();
        return idleController?.playGesture(gesture, isMotionActive) ?? false;
      });
      if (activeExpression) {
        expressionCtrl.setExpression(activeExpression);
      }

      setLoadState('success');
      onLoaded?.(vrm);
    };

    if (cachedVrm) {
      console.log('[Cantarella Perf] Fast path: Reusing cached VRM model instantly (0ms network & parse)');
      applyVrm(cachedVrm);
    } else if (loadPromise) {
      loadPromise
        .then((vrm) => {
          if (isMounted) applyVrm(vrm);
        })
        .catch((err) => {
          if (isMounted) {
            setLoadState('error');
            onError?.(err);
          }
        });
    } else {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const tStart = performance.now();
      console.log('[Cantarella Perf] Initial download & parse started for:', modelUrl);

      loadPromise = new Promise<VRM>((resolve, reject) => {
        loader.load(
          modelUrl,
          (gltf) => {
            const vrm: VRM | undefined = gltf.userData.vrm;
            if (!vrm) {
              reject(new Error('No VRM metadata found in loaded glTF'));
              return;
            }

            // VRM 0.0 models face -Z by default; rotate 180 deg to face +Z
            VRMUtils.rotateVRM0(vrm);

            // Natural companion resting pose (lower arms from default bind T-pose to relaxed A-pose)
            if (vrm.humanoid) {
              const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
              const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
              const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
              const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

              if (leftUpperArm) {
                leftUpperArm.rotation.set(0.08, 0.04, 1.25);
              }
              if (rightUpperArm) {
                rightUpperArm.rotation.set(0.08, -0.04, -1.25);
              }
              if (leftLowerArm) {
                leftLowerArm.rotation.set(0, 0.12, 0.1);
              }
              if (rightLowerArm) {
                rightLowerArm.rotation.set(0, -0.12, -0.1);
              }
            }

            cachedVrm = vrm;
            resolve(vrm);
          },
          undefined,
          (err) => {
            loadPromise = null;
            reject(err);
          }
        );
      });

      loadPromise
        .then((vrm) => {
          if (isMounted) {
            console.log(
              `[Cantarella Perf] Initial load & parse completed in ${(performance.now() - tStart).toFixed(1)}ms`
            );
            applyVrm(vrm);
          }
        })
        .catch((error) => {
          console.warn('CantarellaAvatar: Failed to load VRM model from', modelUrl, error);
          if (isMounted) {
            setLoadState('error');
            onError?.(error);
          }
        });
    }

    // 5. Responsive Resize Observer
    const handleResize = () => {
      if (!container || !renderer) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth > 0 && newHeight > 0) {
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight, false);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 6. Animation Frame Loop with Visibility-Aware Pausing (IntersectionObserver + visibilitychange)
    const clock = new THREE.Clock();
    let isVisible = true;

    const animate = () => {
      if (!isVisible || document.hidden) {
        animId = null;
        return;
      }

      animId = requestAnimationFrame(animate);

      // Cap delta time to prevent physics anomalies on tab switch
      const delta = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;

      if (currentVrm) {
        // 1. Advance imported VRMA animation mixer (if active)
        cantarellaAnimationManager.update(delta);

        // 2. Natural idle animation (gentle breathing, biological blinking, Lissajous head drift, eye gaze)
        // Suppresses conflicting body/head drift while an imported motion is playing
        const isMotionActive = cantarellaAnimationManager.isPlaying();
        idleController?.update(delta, time, isMotionActive);

        // 3. Smooth facial expression transitions
        expressionCtrl.update(delta);

        // 4. Update VRM (updates humanoid, spring bone physics, expressions, materials)
        currentVrm.update(delta);
      }

      if (renderer) {
        renderer.render(scene, camera);
      }
    };

    // Start animation loop
    animId = requestAnimationFrame(animate);

    // IntersectionObserver pauses rendering when container is hidden (e.g. during Universe mode)
    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        isVisible = entry.isIntersecting;
        if (isVisible && !document.hidden) {
          clock.getDelta(); // Reset clock delta so there is no time jump
          if (!animId) {
            animId = requestAnimationFrame(animate);
          }
        } else {
          if (animId !== null) {
            cancelAnimationFrame(animId);
            animId = null;
          }
        }
      }
    });
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animId !== null) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      } else if (isVisible && !animId) {
        clock.getDelta();
        animId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Desktop IPC hooks to explicitly pause/resume rendering during window hiding
    const unbindPause = window.stellaDesktop?.onPauseRendering?.(() => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    });

    const unbindResume = window.stellaDesktop?.onResumeRendering?.(() => {
      if (isVisible && !document.hidden && !animId) {
        clock.getDelta();
        animId = requestAnimationFrame(animate);
      }
    });

    // 7. Cleanup on unmount (prevents GPU memory leaks)
    return () => {
      isMounted = false;
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      unbindPause?.();
      unbindResume?.();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (idleController) {
        idleController.dispose();
        idleController = null;
      }
      cantarellaAnimationManager.detachVRM();
      expressionCtrl.setGestureHandler(null);
      expressionCtrl.detachVRM();

      if (currentVrm) {
        scene.remove(currentVrm.scene);
        currentVrm = null;
      }

      if (renderer) {
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
        renderer = null;
      }
    };
  }, [modelUrl, framing, expressionCtrl, onLoaded, onError]);

  return (
    <div
      ref={containerRef}
      className={`cantarella-avatar-root ${className || ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {/* Fallback & Loading State: Displays existing SVG CelestialAvatar until VRM is ready */}
      {loadState !== 'success' && (
        <div
          className="cantarella-fallback"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loadState === 'loading' ? 0.8 : 1.0,
            transition: 'opacity 0.4s ease',
            pointerEvents: 'none',
          }}
        >
          <CelestialAvatar />
        </div>
      )}
    </div>
  );
};

export default CantarellaAvatar;
