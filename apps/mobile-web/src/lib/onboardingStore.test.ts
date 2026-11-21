import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore, DEFAULT_LEVELS } from './onboardingStore';

describe('useOnboardingStore — Picker and Onboarding State Logic', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('initializes at the goal step with default levels and empty selections', () => {
    const state = useOnboardingStore.getState();
    expect(state.step).toBe('goal');
    expect(state.selectedNodeIds).toEqual([]);
    expect(state.levelsByArea).toEqual(DEFAULT_LEVELS);
    expect(state.startedAt).toBeNull();
    expect(state.isGenerating).toBe(false);
  });

  it('starts onboarding and transitions to picker step with timestamp', () => {
    useOnboardingStore.getState().startOnboarding();
    const state = useOnboardingStore.getState();
    expect(state.step).toBe('picker');
    expect(typeof state.startedAt).toBe('number');
    expect(state.startedAt).toBeGreaterThan(0);
  });

  it('toggles node selection accurately', () => {
    const store = useOnboardingStore.getState();
    store.toggleNode('node-1');
    expect(useOnboardingStore.getState().selectedNodeIds).toEqual(['node-1']);

    store.toggleNode('node-2');
    expect(useOnboardingStore.getState().selectedNodeIds).toEqual(['node-1', 'node-2']);

    // Toggle off node-1
    store.toggleNode('node-1');
    expect(useOnboardingStore.getState().selectedNodeIds).toEqual(['node-2']);
  });

  it('handles edge case: selectAllInArea and clearArea', () => {
    const store = useOnboardingStore.getState();
    const areaNodes = ['node-10', 'node-11', 'node-12'];

    store.selectAllInArea('testing', areaNodes);
    expect(useOnboardingStore.getState().selectedNodeIds).toEqual(
      expect.arrayContaining(areaNodes),
    );

    // Add another node from different area
    store.toggleNode('other-node');
    expect(useOnboardingStore.getState().selectedNodeIds).toContain('other-node');

    // Clear only testing area
    store.clearArea(areaNodes);
    const updated = useOnboardingStore.getState().selectedNodeIds;
    expect(updated).toEqual(['other-node']);
    expect(updated).not.toContain('node-10');
  });

  it('handles edge case: user selects nothing (empty array allowed)', () => {
    const store = useOnboardingStore.getState();
    store.clearAll();
    expect(useOnboardingStore.getState().selectedNodeIds).toEqual([]);
  });

  it('handles edge case: user selects everything (selectAll)', () => {
    const store = useOnboardingStore.getState();
    const all = ['a', 'b', 'c', 'd', 'e'];
    store.selectAll(all);
    expect(useOnboardingStore.getState().selectedNodeIds).toEqual(all);
  });

  it('updates experience level per area', () => {
    const store = useOnboardingStore.getState();
    store.setLevel('editors-ides', 'expert');
    store.setLevel('testing', 'beginner');

    const state = useOnboardingStore.getState();
    expect(state.levelsByArea['editors-ides']).toBe('expert');
    expect(state.levelsByArea['testing']).toBe('beginner');
    expect(state.levelsByArea['ai-assistants']).toBe('working');
  });

  it('handles edge case: abandon midway and return (persistence and restore)', () => {
    // Mock window sessionStorage
    const storageMock: Record<string, string> = {};
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => storageMock[k] ?? null,
        setItem: (k: string, v: string) => {
          storageMock[k] = v;
        },
        removeItem: (k: string) => {
          delete storageMock[k];
        },
        clear: () => {},
        key: () => null,
        length: 0,
      },
    };

    const store = useOnboardingStore.getState();
    store.startOnboarding();
    store.toggleNode('vscode-lsp');
    store.setLevel('editors-ides', 'expert');
    store.setStep('levels');

    // Simulate page reload: reset memory store, then call restore()
    useOnboardingStore.setState({
      step: 'goal',
      selectedNodeIds: [],
      levelsByArea: { ...DEFAULT_LEVELS },
    });

    const restored = useOnboardingStore.getState().restore();
    expect(restored).toBe(true);

    const reloadedState = useOnboardingStore.getState();
    expect(reloadedState.step).toBe('levels');
    expect(reloadedState.selectedNodeIds).toEqual(['vscode-lsp']);
    expect(reloadedState.levelsByArea['editors-ides']).toBe('expert');
  });
});
