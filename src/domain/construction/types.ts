export type Vector3 = [number, number, number];
export interface ConstructionBounds { min: Vector3; max: Vector3 }
export interface ConstructionAnchor {
  id: string; kind: 'foundation' | 'wall-pocket' | 'post-top' | 'beam-top' | 'door' | 'window' | 'storage';
  position: Vector3; normal: Vector3; clearance?: ConstructionBounds;
  supportedBy?: string;
}
export interface ConstructionMember extends ConstructionBounds {
  id: string; role: 'floor' | 'ceiling' | 'wall' | 'post' | 'joist' | 'rafter';
  material: 'stone' | 'floor' | 'timber'; axis: 0 | 1 | 2; uvOrigin: Vector3;
  /** Bearing identity survives renderer clipping/batching and export. */
  bearings?: [string, string];
  sourceMemberId?: string; storey?: 0 | 1;
}
export interface ConstructionFurnishing {
  id: string; assetId: string; position: Vector3; yaw: number; bounds: ConstructionBounds; anchorId: string;
  storey?: 0 | 1;
}
export interface RoomConstructionBrief {
  id: string; seed: number; columns: 3 | 5; rows: 3 | 5; purpose: 'empty' | 'library';
  storageExclusions?: ConstructionBounds[];
}
export interface BuildingConstructionBrief { id: string; seed: number; purpose: 'empty' | 'library'; storeys: 2 }
export interface ConstructionPlan {
  version: 'construction-plan-v1'; profile: 'framed-room-v1' | 'stairwell-assembly-v1' | 'two-storey-building-v1'; id: string;
  frame: { units: 'world'; axes: 'right-handed-y-up'; forward: '-z' };
  brief: RoomConstructionBrief | BuildingConstructionBrief | { id: string; seed: number; purpose: 'stairwell'; rise: number; tread: number; steps: number }; bounds: ConstructionBounds;
  members: ConstructionMember[]; anchors: ConstructionAnchor[]; furnishings: ConstructionFurnishing[];
  routes: ConstructionBounds[];
  dependencies?: { recipe: string; revision: string }[];
}
export interface ConstructionFragment extends ConstructionBounds {
  id: string; memberId: string; capStart: boolean; capEnd: boolean;
}
