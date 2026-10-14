import React from 'react';
import { NavItem } from '../../types/dashboard';

interface NavigationRailProps {
  items: NavItem[];
  activeId: string;
  onSelect?: (id: string) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  items,
  activeId,
  onSelect,
}) => {
  return (
    <aside className="nav-rail" id="stella-nav-rail" aria-label="Main Navigation">
      <nav className="nav-group" aria-label="Primary Navigation Links">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const tooltip = item.planned ? `${item.label} (Planned)` : item.label;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              type="button"
              className={`nav-link ${isActive ? 'active' : ''}`}
              title={tooltip}
              aria-label={tooltip}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect?.(item.id)}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile Badge */}
      <div className="nav-group">
        <button
          type="button"
          id="btn-profile-badge"
          className="profile-avatar-badge"
          title="Cosmic Architect (Core Local)"
          aria-label="User Profile: Cosmic Architect (Core Local)"
        >
          <span className="material-symbols-outlined">person</span>
        </button>
      </div>
    </aside>
  );
};
