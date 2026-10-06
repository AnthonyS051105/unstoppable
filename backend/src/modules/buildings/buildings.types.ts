export interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface ScoreAspect {
  score: number | null;
  note: string;
}

export interface ScoreBreakdown {
  entrance: ScoreAspect;
  verticalAccess: ScoreAspect;
  paths: ScoreAspect;
  facilities: ScoreAspect;
}

export interface BuildingRow {
  id: string;
  name: string;
  code: string | null;
  faculty: string | null;
  location: GeoJsonPoint;
  floorCount: number;
  hasLift: boolean;
  hasAccessibleToilet: boolean;
  surveyedAt: Date | null;
}

export interface Building extends BuildingRow {
  accessibilityScore: number | null;
  scoreBreakdown: ScoreBreakdown | null;
}

export interface GraphStats {
  entranceCount: number;
  stairFreeEntranceCount: number;
  liftFloorCount: number;
  measuredEdgeCount: number;
  compliantEdgeCount: number;
}

export interface BuildingBarrier {
  reportId: string;
  category: string;
  severity: string;
  description: string | null;
  corroborationCount: number;
  effect: string;
  edgeId: string | null;
  nodeId: string | null;
  createdAt: Date;
}
