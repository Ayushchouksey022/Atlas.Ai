/**
 * Canonical Graph Validator
 *
 * Validates canonical graph seed files against the PRD invariants:
 * 1. Schema conformance (Zod validation)
 * 2. Unique slugs
 * 3. Every edge references existing nodes
 * 4. No cycles (DAG verification via @repo/graph validateAcyclic & wouldCreateCycle)
 * 5. Every supersedes pair references existing nodes
 * 6. Every node has an area and a level consistent with its prerequisites (level(to) > level(from))
 * 7. No orphan nodes except level-0 foundations:
 *    - Level 0 nodes must have no incoming edges
 *    - Level > 0 nodes must have at least one incoming edge and reach a level 0 node
 */
export interface ValidationReport {
    filePath: string;
    domain: string;
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary: {
        totalNodes: number;
        approvedNodes: number;
        draftNodes: number;
        deprecatedNodes: number;
        totalEdges: number;
        totalSupersedes: number;
        areaBreakdown: Record<string, number>;
        levelBreakdown: Record<number, number>;
        maxTopologicalDepth: number;
    };
}
export declare function validateCanonicalGraphFile(filePath: string): ValidationReport;
export declare function printValidationReport(report: ValidationReport): void;
//# sourceMappingURL=validate-graph.d.ts.map