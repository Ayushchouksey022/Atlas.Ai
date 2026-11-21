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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanonicalGraphSeedSchema, } from '@repo/schemas';
import { validateAcyclic, topoLayers } from '@repo/graph';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function validateCanonicalGraphFile(filePath) {
    const errors = [];
    const warnings = [];
    if (!fs.existsSync(filePath)) {
        return {
            filePath,
            domain: 'unknown',
            valid: false,
            errors: [`File does not exist: ${filePath}`],
            warnings: [],
            summary: {
                totalNodes: 0,
                approvedNodes: 0,
                draftNodes: 0,
                deprecatedNodes: 0,
                totalEdges: 0,
                totalSupersedes: 0,
                areaBreakdown: {},
                levelBreakdown: {},
                maxTopologicalDepth: 0,
            },
        };
    }
    let rawJson;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        rawJson = JSON.parse(content);
    }
    catch (err) {
        return {
            filePath,
            domain: 'unknown',
            valid: false,
            errors: [`Invalid JSON in ${filePath}: ${err.message}`],
            warnings: [],
            summary: {
                totalNodes: 0,
                approvedNodes: 0,
                draftNodes: 0,
                deprecatedNodes: 0,
                totalEdges: 0,
                totalSupersedes: 0,
                areaBreakdown: {},
                levelBreakdown: {},
                maxTopologicalDepth: 0,
            },
        };
    }
    // 1. Schema check
    const parseResult = CanonicalGraphSeedSchema.safeParse(rawJson);
    if (!parseResult.success) {
        for (const issue of parseResult.error.issues) {
            errors.push(`Schema error at ${issue.path.join('.')}: ${issue.message}`);
        }
        return {
            filePath,
            domain: rawJson?.domain ?? 'unknown',
            valid: false,
            errors,
            warnings,
            summary: {
                totalNodes: 0,
                approvedNodes: 0,
                draftNodes: 0,
                deprecatedNodes: 0,
                totalEdges: 0,
                totalSupersedes: 0,
                areaBreakdown: {},
                levelBreakdown: {},
                maxTopologicalDepth: 0,
            },
        };
    }
    const data = parseResult.data;
    const nodes = data.nodes;
    const edges = data.edges;
    const supersedes = data.supersedes;
    // 2. Unique slugs
    const slugSet = new Set();
    const slugToNode = new Map();
    for (const node of nodes) {
        if (slugSet.has(node.slug)) {
            errors.push(`Duplicate node slug: "${node.slug}"`);
        }
        else {
            slugSet.add(node.slug);
            slugToNode.set(node.slug, node);
        }
    }
    // 3. Edges reference existing nodes
    const inDegree = new Map();
    const outDegree = new Map();
    const adj = new Map();
    const revAdj = new Map();
    for (const slug of slugSet) {
        inDegree.set(slug, 0);
        outDegree.set(slug, 0);
        adj.set(slug, new Set());
        revAdj.set(slug, new Set());
    }
    for (let i = 0; i < edges.length; i++) {
        const [fromSlug, toSlug] = edges[i];
        if (!slugSet.has(fromSlug)) {
            errors.push(`Edge #${i + 1} references non-existent from_node slug: "${fromSlug}"`);
        }
        if (!slugSet.has(toSlug)) {
            errors.push(`Edge #${i + 1} references non-existent to_node slug: "${toSlug}"`);
        }
        if (fromSlug === toSlug) {
            errors.push(`Edge #${i + 1} has a self-loop on node: "${fromSlug}"`);
        }
        if (slugSet.has(fromSlug) && slugSet.has(toSlug) && fromSlug !== toSlug) {
            if (adj.get(fromSlug).has(toSlug)) {
                warnings.push(`Duplicate edge: ["${fromSlug}", "${toSlug}"]`);
            }
            else {
                adj.get(fromSlug).add(toSlug);
                revAdj.get(toSlug).add(fromSlug);
                outDegree.set(fromSlug, (outDegree.get(fromSlug) ?? 0) + 1);
                inDegree.set(toSlug, (inDegree.get(toSlug) ?? 0) + 1);
            }
        }
    }
    // 4. Supersedes reference existing nodes
    for (let i = 0; i < supersedes.length; i++) {
        const item = supersedes[i];
        const oldSlug = Array.isArray(item) ? item[0] : item.old_node;
        const newSlug = Array.isArray(item) ? item[1] : item.new_node;
        if (!slugSet.has(oldSlug)) {
            errors.push(`Supersedes #${i + 1} references non-existent old_node: "${oldSlug}"`);
        }
        if (!slugSet.has(newSlug)) {
            errors.push(`Supersedes #${i + 1} references non-existent new_node: "${newSlug}"`);
        }
        if (oldSlug === newSlug) {
            errors.push(`Supersedes #${i + 1} self-reference on: "${oldSlug}"`);
        }
    }
    // 5. Level consistency: for every edge from -> to, level(to) > level(from)
    for (const [fromSlug, toSlug] of edges) {
        const fromNode = slugToNode.get(fromSlug);
        const toNode = slugToNode.get(toSlug);
        if (fromNode && toNode) {
            if (toNode.level <= fromNode.level) {
                errors.push(`Level inconsistency on edge ["${fromSlug}", "${toSlug}"]: to_node level (${toNode.level}) must be greater than from_node level (${fromNode.level})`);
            }
        }
    }
    // 6. No orphan nodes except level-0 foundations:
    // - level 0 nodes must have in-degree 0
    // - level > 0 nodes must have in-degree >= 1
    for (const node of nodes) {
        const inDeg = inDegree.get(node.slug) ?? 0;
        if (node.level === 0 && inDeg > 0) {
            errors.push(`Foundation node "${node.slug}" has level 0 but has ${inDeg} prerequisite edge(s). Level-0 nodes must have no prerequisites.`);
        }
        if (node.level > 0 && inDeg === 0) {
            errors.push(`Orphan node detected: "${node.slug}" has level ${node.level} (> 0) but has 0 prerequisite edges.`);
        }
    }
    // Reachability from level 0 foundations
    const level0Slugs = nodes.filter((n) => n.level === 0).map((n) => n.slug);
    const reachableFromRoot = new Set();
    const queue = [...level0Slugs];
    for (const s of level0Slugs)
        reachableFromRoot.add(s);
    while (queue.length > 0) {
        const cur = queue.shift();
        for (const next of adj.get(cur) ?? []) {
            if (!reachableFromRoot.has(next)) {
                reachableFromRoot.add(next);
                queue.push(next);
            }
        }
    }
    for (const node of nodes) {
        if (!reachableFromRoot.has(node.slug)) {
            errors.push(`Disconnected node: "${node.slug}" is not reachable from any level-0 foundation node.`);
        }
    }
    // 7. No cycles: run validateAcyclic from @repo/graph
    const syntheticCanonicalNodes = nodes.map((n) => ({
        id: n.slug,
        domain_id: data.domain,
        slug: n.slug,
        name: n.name,
        description: n.description ?? '',
        node_type: n.type,
        level: n.level,
        area: n.area,
        status: n.status ?? 'approved',
        external_url: n.external_url ?? null,
        version_tag: n.version_tag ?? null,
    }));
    const syntheticCanonicalEdges = edges.map(([from, to]) => ({
        id: `${from}->${to}`,
        from_node: from,
        to_node: to,
    }));
    const acyclicResult = validateAcyclic(syntheticCanonicalNodes, syntheticCanonicalEdges);
    let maxTopologicalDepth = 0;
    if (!acyclicResult.ok) {
        errors.push(`Cycle detected in graph: ${acyclicResult.detail ?? 'cyclic dependency'}`);
    }
    else {
        try {
            const layers = topoLayers(syntheticCanonicalNodes, syntheticCanonicalEdges);
            for (const layer of layers.values()) {
                if (layer > maxTopologicalDepth)
                    maxTopologicalDepth = layer;
            }
        }
        catch (e) {
            errors.push(`Error computing topological layers: ${e.message}`);
        }
    }
    // Summary breakdown
    const areaBreakdown = {};
    const levelBreakdown = {};
    let approvedCount = 0;
    let draftCount = 0;
    let deprecatedCount = 0;
    for (const n of nodes) {
        areaBreakdown[n.area] = (areaBreakdown[n.area] ?? 0) + 1;
        levelBreakdown[n.level] = (levelBreakdown[n.level] ?? 0) + 1;
        const st = n.status ?? 'approved';
        if (st === 'approved')
            approvedCount++;
        else if (st === 'draft')
            draftCount++;
        else if (st === 'deprecated')
            deprecatedCount++;
    }
    return {
        filePath,
        domain: data.domain,
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
            totalNodes: nodes.length,
            approvedNodes: approvedCount,
            draftNodes: draftCount,
            deprecatedNodes: deprecatedCount,
            totalEdges: edges.length,
            totalSupersedes: supersedes.length,
            areaBreakdown,
            levelBreakdown,
            maxTopologicalDepth,
        },
    };
}
export function printValidationReport(report) {
    console.log('====================================================');
    console.log(` Canonical Graph Validation Report: ${path.basename(report.filePath)}`);
    console.log('====================================================');
    console.log(`Domain:          ${report.domain}`);
    console.log(`Total Nodes:     ${report.summary.totalNodes} (${report.summary.approvedNodes} approved, ${report.summary.draftNodes} draft, ${report.summary.deprecatedNodes} deprecated)`);
    console.log(`Total Edges:     ${report.summary.totalEdges}`);
    console.log(`Supersedes:      ${report.summary.totalSupersedes}`);
    console.log(`Max DAG Depth:   ${report.summary.maxTopologicalDepth}`);
    console.log('\nNodes by Area:');
    for (const [area, count] of Object.entries(report.summary.areaBreakdown)) {
        console.log(`  - ${area.padEnd(25)}: ${count} nodes`);
    }
    console.log('\nNodes by Level:');
    for (const [lvl, count] of Object.entries(report.summary.levelBreakdown)) {
        console.log(`  - Level ${lvl.padEnd(20)}: ${count} nodes`);
    }
    if (report.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const w of report.warnings) {
            console.log(`  ⚠️  ${w}`);
        }
    }
    if (report.errors.length > 0) {
        console.log('\nErrors:');
        for (const e of report.errors) {
            console.log(`  ❌ ${e}`);
        }
        console.log('\nRESULT: FAILED ❌');
    }
    else {
        console.log('\nAll PRD invariants passed cleanly! ✅');
        console.log('RESULT: PASSED ✅');
    }
    console.log('====================================================\n');
}
// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const seedDir = path.resolve(__dirname, '../supabase/seed/canonical-graph');
    const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'));
    let anyFailed = false;
    for (const file of files) {
        const fullPath = path.join(seedDir, file);
        const report = validateCanonicalGraphFile(fullPath);
        printValidationReport(report);
        if (!report.valid)
            anyFailed = true;
    }
    if (anyFailed) {
        process.exit(1);
    }
    else {
        process.exit(0);
    }
}
