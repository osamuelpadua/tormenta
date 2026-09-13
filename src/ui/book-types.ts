export type BookBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string; lead?: string }
  | { type: "lines"; text: string }
  | {
      type: "table";
      caption: string;
      headers: string[];
      rows: string[][];
      notes: string[];
    };

export interface BookPage {
  page: number;
  printed: number;
  text: string;
  blocks: BookBlock[];
}
