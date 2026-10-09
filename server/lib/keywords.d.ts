// Types for keywords.js (imported by the admin panel: web/admin/util.ts).
export declare const foldText: (s: unknown) => string;
export declare const SHORT_KEYWORD: number;
export declare function keywordMatches(foldedText: string, keyword: string): boolean;
export declare function findKeyword<R extends { match?: string[] }>(rules: R[], text: string): { rule: R; keyword: string; index: number } | null;
