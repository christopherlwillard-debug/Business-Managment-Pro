export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const AssetType = {
  Vehicle: "Vehicle",
  Equipment: "Equipment",
  Tool: "Tool",
  Trailer: "Trailer",
  LandImprovement: "Land Improvement",
  Building: "Building",
  Other: "Other",
} as const;

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetStatus = {
  active: "active",
  sold: "sold",
  retired: "retired",
} as const;

export type DepreciationMethod = (typeof DepreciationMethod)[keyof typeof DepreciationMethod];

export const DepreciationMethod = {
  "straight-line": "straight-line",
  "section-179": "section-179",
  "bonus": "bonus",
} as const;

export interface Asset {
  id: number;
  name: string;
  assetType: AssetType;
  purchaseDate: string;
  purchasePrice: number;
  vendor?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
  section179Eligible: boolean;
  status: AssetStatus;
  saleDate?: string | null;
  salePrice?: number | null;
  usefulLifeYears?: number | null;
  salvageValue?: number | null;
  depreciationMethod?: string | null;
  bonusDepreciationPct?: number | null;
  createdAt: string;
}

export interface CreateAssetRequest {
  name: string;
  assetType?: AssetType;
  purchaseDate: string;
  purchasePrice: number;
  vendor?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
  section179Eligible?: boolean;
  status?: AssetStatus;
  saleDate?: string | null;
  salePrice?: number | null;
  usefulLifeYears?: number | null;
  salvageValue?: number | null;
  depreciationMethod?: string | null;
  bonusDepreciationPct?: number | null;
}

export type UpdateAssetRequest = Partial<CreateAssetRequest>;

export type ListAssetsParams = {
  status?: AssetStatus;
  year?: string | number;
};
