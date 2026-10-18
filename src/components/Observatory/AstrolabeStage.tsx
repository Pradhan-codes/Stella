import React, { useMemo } from 'react';
import { ObservatoryNode } from './types';
import { CantarellaAvatar } from '../CompanionPanel/CantarellaAvatar';

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

      {/* 3. Dedicated Stella Celestial Companion Stage Rig */}
      <div
        className="rig px"
        role="img"
        aria-label="Stella Celestial Companion Cantarella"
      >
        <div>
          <CantarellaAvatar framing="portrait" />
        </div>
      </div>

      {/* 4. Nebula Mist Layer */}
      <div className="mist px" aria-hidden="true" />
      <p className="note">Cantarella • Celestial Companion</p>

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
