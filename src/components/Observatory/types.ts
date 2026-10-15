export interface ObservatoryNode {
  id: string;
  name: string;
  role: string;
  color: string;
  gradient: string;
  size: number;
  description: string;
}

export interface SystemMetrics {
  cpuCores: string;
  cpuUtilization: string;
  cpuTemp: string;
  gpuRenderer: string;
  gpuUtilization: string;
  gpuTemp: string;
  ramApprox: string;
  vram: string;
  batteryStatus: string;
}

export interface CompanionState {
  engineStatus: string;
  presenceState: string;
  personaMood: string;
  speechEngine: string;
}

export interface WeatherState {
  status: string;
  temperature: string;
  condition: string;
  forecast: string;
  note: string;
}
