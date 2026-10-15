import { useState, useEffect } from 'react';
import { SystemMetrics, CompanionState, WeatherState } from './types';

export function useSystemMonitoring() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpuCores: typeof navigator !== 'undefined' && navigator.hardwareConcurrency 
      ? `${navigator.hardwareConcurrency} Logical Cores` 
      : 'Unavailable',
    cpuUtilization: 'Offline (Host daemon not connected)',
    cpuTemp: 'Offline (Sensor daemon not connected)',
    gpuRenderer: 'Detecting GPU...',
    gpuUtilization: 'Offline (Host daemon not connected)',
    gpuTemp: 'Offline (Sensor daemon not connected)',
    ramApprox: typeof navigator !== 'undefined' && (navigator as unknown as { deviceMemory?: number }).deviceMemory
      ? `${(navigator as unknown as { deviceMemory: number }).deviceMemory} GB (Reported)`
      : 'Unavailable (Browser restricted)',
    vram: '6 GB Target • Real-time telemetry offline',
    batteryStatus: 'Checking power...',
  });

  const companionState: CompanionState = {
    engineStatus: 'Offline (Local standby)',
    presenceState: 'Standby (Awaiting activation)',
    personaMood: 'Resting / Contemplative (Default)',
    speechEngine: 'Offline (Microphone standby)',
  };

  const weatherState: WeatherState = {
    status: 'Not configured',
    temperature: 'Unavailable',
    condition: 'Offline',
    forecast: 'Unavailable',
    note: 'Weather telemetry requires local provider key in environment.',
  };

  useEffect(() => {
    // 1. Detect GPU via WebGL if supported
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          const renderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL);
          if (typeof renderer === 'string' && renderer.trim().length > 0) {
            // Clean common verbose wrapper strings if present
            const clean = renderer
              .replace(/ANGLE \(/g, '')
              .replace(/\)$/g, '')
              .replace(/Direct3D11 vs_5_0 ps_5_0/g, '')
              .replace(/,\s*$/, '');
            setMetrics((prev) => ({ ...prev, gpuRenderer: clean.trim() }));
          } else {
            setMetrics((prev) => ({ ...prev, gpuRenderer: 'WebGL Standard Accelerator' }));
          }
        } else {
          setMetrics((prev) => ({ ...prev, gpuRenderer: 'Standard WebGL Renderer' }));
        }
      } else {
        setMetrics((prev) => ({ ...prev, gpuRenderer: 'Unavailable (WebGL Disabled)' }));
      }
    } catch {
      setMetrics((prev) => ({ ...prev, gpuRenderer: 'Unavailable' }));
    }

    // 2. Detect Battery status where supported (e.g. Chrome/Edge)
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean; addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void }> })
        .getBattery()
        .then((battery) => {
          const updateBattery = () => {
            const pct = Math.round(battery.level * 100);
            const state = battery.charging ? 'AC Connected • Charging' : 'On Battery';
            setMetrics((prev) => ({
              ...prev,
              batteryStatus: `${pct}% • ${state}`,
            }));
          };

          updateBattery();
          battery.addEventListener('levelchange', updateBattery);
          battery.addEventListener('chargingchange', updateBattery);
        })
        .catch(() => {
          setMetrics((prev) => ({
            ...prev,
            batteryStatus: 'Unavailable (Battery API restricted)',
          }));
        });
    } else {
      setMetrics((prev) => ({
        ...prev,
        batteryStatus: 'Unavailable (Browser sandbox)',
      }));
    }
  }, []);

  return { metrics, companionState, weatherState };
}
