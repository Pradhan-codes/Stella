import React, { useState, useCallback, useRef } from 'react';
import { StarCanvas } from './StarCanvas';
import { AstrolabeStage } from './AstrolabeStage';
import { StellaStatePanel } from './StellaStatePanel';
import { OBSERVATORY_NODES } from './observatoryData';
import { PLANETS_DATA } from '../Universe/planetData';
import { PlanetData } from '../Universe/types';
import { PlanetWorkspaceModal } from '../Universe/PlanetWorkspaceModal';
import './observatory.css';

interface ObservatoryHomeProps {
  onLaunchUniverse: () => void;
}

export const ObservatoryHome: React.FC<ObservatoryHomeProps> = ({ onLaunchUniverse }) => {
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number>(0);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeWorkspacePlanet, setActiveWorkspacePlanet] = useState<PlanetData | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const displayNodeIndex = hoveredNodeIndex !== null ? hoveredNodeIndex : selectedNodeIndex;
  const currentNode = OBSERVATORY_NODES[displayNodeIndex] || OBSERVATORY_NODES[0];

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const handlePickNode = useCallback(
    (index: number) => {
      setSelectedNodeIndex(index);
      const node = OBSERVATORY_NODES[index];
      // Find matching planet from existing 3D universe planet dataset
      const matchedPlanet = PLANETS_DATA.find((p) => p.id.toLowerCase() === node.id.toLowerCase());
      if (matchedPlanet) {
        setActiveWorkspacePlanet(matchedPlanet);
      } else {
        showToast(`Workspace: ${node.name} (${node.role})`);
      }
    },
    [showToast]
  );

  const handleQuickAction = useCallback(
    (planetName: string) => {
      const idx = OBSERVATORY_NODES.findIndex((n) => n.name.toLowerCase() === planetName.toLowerCase());
      if (idx !== -1) {
        handlePickNode(idx);
      }
    },
    [handlePickNode]
  );

  return (
    <>
      {/* 1. Atmospheric Ambient Nebula & Twinkling Starfield */}
      <div className="nebula px" aria-hidden="true" />
      <StarCanvas />

      {/* 2. Main Observatory Application Shell */}
      <div className="observatory-app" id="observatory-root">
        {/* Header */}
        <header className="observatory-header">
          <div className="brand">Stella</div>
          <span className="chip" title="System running in local offline standby mode">
            <i aria-hidden="true" />
            Local engine offline
          </span>
          <button
            type="button"
            className="enter-universe-btn"
            id="enterBtn"
            onClick={onLaunchUniverse}
            aria-label="Enter the 3D Stella celestial universe"
          >
            Enter the Universe
          </button>
        </header>

        {/* 3-Column Scene */}
        <div className="observatory-scene">
          {/* Left Column: Greeting & Selected Workspace Readout */}
          <div className="side">
            <h1 className="hello">
              Welcome back.
              <span>Your universe is waiting.</span>
            </h1>

            <div
              className="read"
              id="read"
              aria-live="polite"
              style={{ ['--c' as string]: currentNode.color }}
            >
              <h2 id="rN">{currentNode.name}</h2>
              <p id="rR">{currentNode.role}</p>
              <p>{currentNode.description}</p>
              <button
                type="button"
                className="read-btn"
                id="rO"
                onClick={() => handlePickNode(displayNodeIndex)}
                aria-label={`Open workspace for ${currentNode.name}`}
              >
                Open {currentNode.name}
              </button>
            </div>
          </div>

          {/* Center Column: Astrolabe Ring & Companion Stage */}
          <AstrolabeStage
            nodes={OBSERVATORY_NODES}
            selectedNodeIndex={selectedNodeIndex}
            hoveredNodeIndex={hoveredNodeIndex}
            onHoverNode={setHoveredNodeIndex}
            onSelectNode={handlePickNode}
          />

          {/* Right Column: Extended Stella's State Panel */}
          <StellaStatePanel />
        </div>

        {/* Bottom Quick Actions Dock */}
        <div className="dock" role="toolbar" aria-label="Quick actions">
          <button
            type="button"
            className="speak"
            onClick={() =>
              showToast('Concept only: the engine is offline, so conversation is not available yet.')
            }
            aria-label="Speak to Stella (Offline)"
          >
            <span>Speak to Stella</span>
            <small>Engine offline</small>
          </button>

          <button
            type="button"
            style={{ ['--c' as string]: '#a08ce6' }}
            onClick={() => handleQuickAction('Yuki')}
            aria-label="Open Yuki memory vault"
          >
            <i aria-hidden="true" />
            Open memory
          </button>

          <button
            type="button"
            style={{ ['--c' as string]: '#6fa5e0' }}
            onClick={() => handleQuickAction('Rin')}
            aria-label="Enter Rin coding workspace"
          >
            <i aria-hidden="true" />
            Enter coding
          </button>

          <button
            type="button"
            style={{ ['--c' as string]: '#eaaac7' }}
            onClick={() => handleQuickAction('Sakura')}
            aria-label="Continue a creative project in Sakura"
          >
            <i aria-hidden="true" />
            Continue a creative project
          </button>
        </div>
      </div>

      {/* 3. Toast Feedback Pill */}
      <div
        className={`observatory-toast ${toastMessage ? 'show' : ''}`}
        id="toast"
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>

      {/* 4. Connected Planet Workspace Modal (Reusing existing workspace UI) */}
      {activeWorkspacePlanet && (
        <PlanetWorkspaceModal
          planet={activeWorkspacePlanet}
          onClose={() => setActiveWorkspacePlanet(null)}
          onGoHome={() => setActiveWorkspacePlanet(null)}
        />
      )}
    </>
  );
};
