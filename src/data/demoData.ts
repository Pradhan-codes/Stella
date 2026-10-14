import { WorkspaceCardData, ActivityItem, NavItem } from '../types/dashboard';

/**
 * Clearly labelled sample data reflecting the Phase 1 & Stitch design reference.
 * Note: No live backend or real agent telemetries are fabricated.
 */

export const SAMPLE_WORKSPACES: WorkspaceCardData[] = [
  {
    id: 'ws-memory',
    name: 'Memory',
    codename: 'Yuki Core',
    description: 'Offline vault index and relational context cache.',
    status: 'Standby [Demo]',
    accent: 'primary',
    icon: 'neurology',
    metaLeft: 'Vault: 2025-Notes',
    metaRight: 'v0.5 Seed',
  },
  {
    id: 'ws-coding',
    name: 'Coding',
    codename: 'Rin Agent',
    description: 'Isolated dev sandbox for local script runs.',
    status: 'Offline [Demo]',
    accent: 'tertiary',
    icon: 'terminal',
    metaLeft: 'WASM runtime',
    metaRight: 'Isolated',
  },
  {
    id: 'ws-creativity',
    name: 'Creativity',
    codename: 'Sakura Pod',
    description: 'Ideation & visual canvas buffer boards.',
    status: 'Ready [Demo]',
    accent: 'secondary',
    icon: 'palette',
    metaLeft: 'Canvas #04',
    metaRight: 'Local Draft',
  },
];

export const SAMPLE_ACTIVITIES: ActivityItem[] = [
  {
    id: 'act-1',
    action: 'Memory Indexing',
    workspace: 'Yuki Core',
    workspaceAccent: 'primary',
    status: 'Sample - Completed',
    time: '2m ago',
  },
  {
    id: 'act-2',
    action: 'Code Refactor Check',
    workspace: 'Rin Agent',
    workspaceAccent: 'tertiary',
    status: 'Sample - Standby',
    time: '18m ago',
  },
  {
    id: 'act-3',
    action: 'Visual Ideation Sync',
    workspace: 'Sakura Pod',
    workspaceAccent: 'secondary',
    status: 'Sample - Completed',
    time: '1h ago',
  },
];

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', active: true },
  { id: 'universe', label: 'Universe Map', icon: 'hub', planned: true },
  { id: 'projects', label: 'Projects', icon: 'folder', planned: true },
  { id: 'memory', label: 'Memory Graph', icon: 'grain', planned: true },
  { id: 'agents', label: 'Autonomous Agents', icon: 'smart_toy', planned: true },
  { id: 'settings', label: 'Settings', icon: 'settings', planned: true },
];
