import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateCanonicalGraphFile } from './validate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Canonical Graph Seed Dataset & Validation', () => {
  const seedPath = path.resolve(
    __dirname,
    '../../../supabase/seed/canonical-graph/ai-assisted-software-development.json',
  );

  it('validates the official launch seed dataset cleanly', () => {
    const report = validateCanonicalGraphFile(seedPath);

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.domain).toBe('ai-assisted-software-development');

    // 40-60 nodes as required by Prompt 3
    expect(report.summary.totalNodes).toBeGreaterThanOrEqual(40);
    expect(report.summary.totalNodes).toBeLessThanOrEqual(60);

    // Edges and supersedes present
    expect(report.summary.totalEdges).toBeGreaterThan(0);
    expect(report.summary.totalSupersedes).toBeGreaterThan(0);

    // All 6 core areas represented
    const expectedAreas = [
      'editors-ides',
      'ai-assistants',
      'languages-frameworks',
      'testing',
      'deployment',
      'agents-automation',
    ];
    for (const area of expectedAreas) {
      expect(report.summary.areaBreakdown[area]).toBeGreaterThan(0);
    }

    // Topological depth
    expect(report.summary.maxTopologicalDepth).toBeGreaterThanOrEqual(3);
  });

  it('ensures commercial tools are marked draft with a TODO note', () => {
    const content = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    const draftNodes = content.nodes.filter((n: { status?: string }) => n.status === 'draft');

    expect(draftNodes.length).toBeGreaterThan(0);
    for (const node of draftNodes) {
      expect(node.todo_note).toBeDefined();
      expect(node.todo_note).toContain('TODO');
    }
  });

  describe('Validator Error Detection (Adversarial Cases)', () => {
    const tempDir = path.resolve(__dirname, '../../../tmp-test-seeds');

    function validateSynthetic(data: unknown): ReturnType<typeof validateCanonicalGraphFile> {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
      try {
        return validateCanonicalGraphFile(tempFile);
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    }

    it('rejects duplicate slugs', () => {
      const data = {
        domain: 'test-domain',
        nodes: [
          { slug: 'dup-slug', name: 'N1', type: 'skill', level: 0, area: 'testing' },
          { slug: 'dup-slug', name: 'N2', type: 'tool', level: 0, area: 'testing' },
        ],
        edges: [],
        supersedes: [],
      };
      const report = validateSynthetic(data);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('Duplicate node slug'))).toBe(true);
    });

    it('rejects edge pointing to non-existent node', () => {
      const data = {
        domain: 'test-domain',
        nodes: [{ slug: 'root', name: 'Root', type: 'skill', level: 0, area: 'testing' }],
        edges: [['root', 'non-existent']],
        supersedes: [],
      };
      const report = validateSynthetic(data);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('non-existent'))).toBe(true);
    });

    it('rejects level inconsistency (to_node level <= from_node level)', () => {
      const data = {
        domain: 'test-domain',
        nodes: [
          { slug: 'a', name: 'A', type: 'skill', level: 2, area: 'testing' },
          { slug: 'b', name: 'B', type: 'skill', level: 1, area: 'testing' },
        ],
        edges: [['a', 'b']],
        supersedes: [],
      };
      const report = validateSynthetic(data);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('Level inconsistency'))).toBe(true);
    });

    it('rejects orphan node with level > 0 and 0 prerequisites', () => {
      const data = {
        domain: 'test-domain',
        nodes: [
          { slug: 'root', name: 'Root', type: 'skill', level: 0, area: 'testing' },
          { slug: 'orphan', name: 'Orphan', type: 'skill', level: 2, area: 'testing' },
        ],
        edges: [],
        supersedes: [],
      };
      const report = validateSynthetic(data);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('Orphan node'))).toBe(true);
    });

    it('rejects foundation node with prerequisites (level 0)', () => {
      const data = {
        domain: 'test-domain',
        nodes: [
          { slug: 'a', name: 'A', type: 'skill', level: 0, area: 'testing' },
          { slug: 'b', name: 'B', type: 'skill', level: 0, area: 'testing' },
        ],
        edges: [['a', 'b']],
        supersedes: [],
      };
      const report = validateSynthetic(data);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('Foundation node'))).toBe(true);
    });

    it('rejects cyclic seed graph', () => {
      const data = {
        domain: 'test-domain',
        nodes: [
          { slug: 'root', name: 'Root', type: 'skill', level: 0, area: 'testing' },
          { slug: 'a', name: 'A', type: 'skill', level: 1, area: 'testing' },
          { slug: 'b', name: 'B', type: 'skill', level: 2, area: 'testing' },
        ],
        // a -> b, b -> a creates cycle
        edges: [
          ['root', 'a'],
          ['a', 'b'],
          ['b', 'a'],
        ],
        supersedes: [],
      };
      const report = validateSynthetic(data);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('Cycle') || e.includes('Level inconsistency'))).toBe(true);
    });

    it('handles non-existent file path gracefully', () => {
      const report = validateCanonicalGraphFile('/path/that/does/not/exist.json');
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('does not exist'))).toBe(true);
    });
  });
});
