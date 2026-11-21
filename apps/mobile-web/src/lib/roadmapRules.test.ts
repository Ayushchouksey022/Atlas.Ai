import { describe, it, expect } from 'vitest';
import {
  computeNodeVisualStatus,
  canTransitionToStatus,
} from './roadmapRules';

describe('Roadmap Rules & Invariants (PRD Section 8.1, 11.3, 14)', () => {
  it('marks node completed if raw status is completed or known', () => {
    const userNodeMap = new Map();
    expect(computeNodeVisualStatus('completed', [], userNodeMap)).toBe('completed');
    expect(computeNodeVisualStatus('known', [], userNodeMap)).toBe('completed');
  });

  it('marks node archived if raw status is archived', () => {
    const userNodeMap = new Map();
    expect(computeNodeVisualStatus('archived', [], userNodeMap)).toBe('archived');
  });

  it('marks todo node as available when all prerequisites are satisfied', () => {
    const userNodeMap = new Map<string, { status: string }>([
      ['prereq-1', { status: 'completed' }],
      ['prereq-2', { status: 'known' }],
    ]);

    const status = computeNodeVisualStatus('todo', ['prereq-1', 'prereq-2'], userNodeMap);
    expect(status).toBe('available');
  });

  it('marks todo node as locked when any prerequisite is incomplete', () => {
    const userNodeMap = new Map<string, { status: string }>([
      ['prereq-1', { status: 'completed' }],
      ['prereq-2', { status: 'todo' }], // not completed
    ]);

    const status = computeNodeVisualStatus('todo', ['prereq-1', 'prereq-2'], userNodeMap);
    expect(status).toBe('locked');
  });

  it('PRD invariant: prevents completing a locked node and provides reason', () => {
    const result = canTransitionToStatus('completed', 'locked', ['Git Basics', 'Unit Testing']);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot start or complete this node yet');
    expect(result.reason).toContain('Git Basics');
  });

  it('allows completing an available or in_progress node', () => {
    const resAvailable = canTransitionToStatus('completed', 'available', []);
    expect(resAvailable.allowed).toBe(true);

    const resInProgress = canTransitionToStatus('completed', 'in_progress', []);
    expect(resInProgress.allowed).toBe(true);
  });
});
