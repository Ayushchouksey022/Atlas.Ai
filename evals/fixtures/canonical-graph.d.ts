import type { CanonicalNode, CanonicalEdge } from '@repo/schemas';
export declare const EVAL_DOMAIN_ID = "00000000-0000-0000-0000-000000000001";
export declare const MOBILE_DOMAIN_ID = "00000000-0000-0000-0000-000000000002";
export declare const EMBEDDED_DOMAIN_ID = "00000000-0000-0000-0000-000000000003";
export interface SupersedesLink {
    old_node_id: string;
    new_node_id: string;
    old_slug: string;
    new_slug: string;
}
export declare const EVAL_CANONICAL_NODES: CanonicalNode[];
export declare const EVAL_CANONICAL_EDGES: CanonicalEdge[];
export declare const EVAL_SUPERSEDES_LINKS: SupersedesLink[];
//# sourceMappingURL=canonical-graph.d.ts.map