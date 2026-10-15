import React, { useMemo } from 'react';
import { ObservatoryNode } from './types';

interface AstrolabeStageProps {
  nodes: ObservatoryNode[];
  selectedNodeIndex: number;
  hoveredNodeIndex: number | null;
  onHoverNode: (index: number | null) => void;
  onSelectNode: (index: number) => void;
}

export const AstrolabeStage: React.FC<AstrolabeStageProps> = ({
  nodes,
  selectedNodeIndex,
  hoveredNodeIndex,
  onHoverNode,
  onSelectNode,
}) => {
  // Generate 96 radial ticks for the astronomical circle
  const ticks = useMemo(() => {
    const lines = [];
    const r = 392;
    for (let i = 0; i < 96; i++) {
      const a = (i * 3.75 * Math.PI) / 180;
      const l = i % 8 === 0 ? 16 : 6;
      const x1 = 400 + r * Math.cos(a);
      const y1 = 400 + r * Math.sin(a);
      const x2 = 400 + (r - l) * Math.cos(a);
      const y2 = 400 + (r - l) * Math.sin(a);
      const opacity = i % 8 === 0 ? 0.4 : 0.16;

      lines.push(
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`rgba(226, 222, 239, ${opacity})`}
          strokeWidth={i % 8 === 0 ? 1.5 : 1}
        />
      );
    }
    return lines;
  }, []);

  return (
    <div className="ring" id="ring">
      {/* 1. Astrolabe Celestial Coordinates Background */}
      <div className="decor px" aria-hidden="true">
        <svg viewBox="0 0 800 800" id="astro">
          <circle cx="400" cy="400" r="392" fill="none" stroke="rgba(226, 222, 239, 0.16)" />
          <circle
            className="dash"
            cx="400"
            cy="400"
            r="320"
            fill="none"
            stroke="rgba(143, 120, 212, 0.35)"
            strokeDasharray="3 10"
          />
          <circle cx="400" cy="400" r="250" fill="none" stroke="rgba(226, 222, 239, 0.07)" />
          <g className="tick" id="ticks">
            {ticks}
          </g>
        </svg>
      </div>

      {/* 2. Atmospheric Pulsing Halo */}
      <div className="halo" aria-hidden="true" />

      {/* 3. Dedicated 2D Stella Companion Stage Rig */}
      <div
        className="rig px"
        role="img"
        aria-label="Stella's companion stage. Placeholder silhouette until artwork is connected."
      >
        <div>
          <svg viewBox="0 0 300 520" id="sil" aria-hidden="true">
            <defs>
              <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#eaaac7" />
                <stop offset="100%" stopColor="#8f78d4" />
              </linearGradient>
              <linearGradient id="bd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3a2656" />
                <stop offset="100%" stopColor="#170f26" />
              </linearGradient>
              <radialGradient id="fc">
                <stop offset="0%" stopColor="#f4dbe8" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#f4dbe8" stopOpacity="0.07" />
              </radialGradient>
              <radialGradient id="cy">
                <stop offset="0%" stopColor="#a3f5ea" />
                <stop offset="100%" stopColor="#5fd1c4" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Layered Rig Geometry */}
            <g id="layer-hair-back">
              <path
                d="M150 36C88 36 66 100 70 172C74 252 46 332 60 424C80 446 112 434 120 402L180 402C188 434 220 446 240 424C254 332 226 252 230 172C234 100 212 36 150 36Z"
                fill="url(#bd)"
                stroke="url(#rim)"
                strokeOpacity="0.55"
              />
            </g>
            <g id="layer-body">
              <path
                d="M133 268L167 268L170 302C200 304 214 322 220 350L246 520L54 520L80 350C86 322 100 304 130 302Z"
                fill="#26183c"
                stroke="url(#rim)"
                strokeOpacity="0.4"
              />
            </g>
            <g id="layer-head">
              <ellipse cx="150" cy="172" rx="54" ry="64" fill="url(#fc)" stroke="url(#rim)" strokeOpacity="0.35" />
            </g>
            <g id="layer-hair-front">
              <path
                d="M94 160C102 98 198 98 206 160C190 136 172 124 150 142C128 124 110 136 94 160Z"
                fill="#2d1c48"
                stroke="url(#rim)"
                strokeOpacity="0.5"
              />
            </g>
            <g id="layer-crystal" className="crystal">
              <circle cx="150" cy="316" r="16" fill="url(#cy)" />
              <path d="M150 306L156 316L150 328L144 316Z" fill="#5fd1c4" />
            </g>
          </svg>
        </div>
      </div>

      {/* 4. Nebula Mist Layer */}
      <div className="mist px" aria-hidden="true" />
      <p className="note">Placeholder silhouette. Artwork or a layered rig attaches here.</p>

      {/* 5. 8 Celestial Astrolabe Workspace Nodes */}
      {nodes.map((node, i) => {
        const a = (-90 + i * 45) * (Math.PI / 180);
        const left = 50 + 44.2 * Math.cos(a);
        const top = 50 + 44.2 * Math.sin(a);
        const isSelected = (hoveredNodeIndex !== null ? hoveredNodeIndex : selectedNodeIndex) === i;

        return (
          <button
            key={node.id}
            type="button"
            className={`node ${isSelected ? 'on' : ''}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              ['--bg' as string]: node.gradient,
              ['--g' as string]: `${node.color}99`,
              ['--s' as string]: `${node.size}px`,
            }}
            aria-label={`${node.name}, ${node.role}`}
            onClick={() => onSelectNode(i)}
            onMouseEnter={() => onHoverNode(i)}
            onFocus={() => onHoverNode(i)}
            onMouseLeave={() => onHoverNode(null)}
          >
            <i aria-hidden="true" />
            <span>{node.name}</span>
          </button>
        );
      })}
    </div>
  );
};
