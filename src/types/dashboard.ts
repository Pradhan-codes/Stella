export type WorkspaceStatus = 'Standby [Demo]' | 'Offline [Demo]' | 'Ready [Demo]';

export interface WorkspaceCardData {
  id: string;
  name: string;
  codename: string;
  description: string;
  status: WorkspaceStatus;
  accent: 'primary' | 'tertiary' | 'secondary';
  icon: string;
  metaLeft: string;
  metaRight: string;
}

export type ActivityStatus = 'Sample - Completed' | 'Sample - Standby' | 'Sample - Running';

export interface ActivityItem {
  id: string;
  action: string;
  workspace: string;
  workspaceAccent: 'primary' | 'tertiary' | 'secondary';
  status: ActivityStatus;
  time: string;
}

export type NavItemId = 'home' | 'universe' | 'projects' | 'memory' | 'agents' | 'settings';

export interface NavItem {
  id: NavItemId;
  label: string;
  icon: string;
  active?: boolean;
  planned?: boolean;
}
