/** BOM data types matching mcp-bomsolar format. */

export interface BomItem {
  part_number: string;
  part_name: string;
  manufacturer: string;
  category: BomCategory;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string;
}

export type BomCategory =
  | "cable"
  | "isolator"
  | "general"
  | "mounting_rail"
  | "mounting_roof_anchor"
  | "mounting_clamp"
  | "mounting_other"
  | "โมดูล"
  | "อินเวอร์เตอร์";

export interface BomData {
  company_name: string;
  project_name: string;
  project_address: string;
  order_date: string;
  notes: string;
  items: BomItem[];
}

/** Conversation flow steps. */
export type BomStep =
  | "project_name"
  | "project_address"
  | "add_items"
  | "confirm"
  | "generating";
