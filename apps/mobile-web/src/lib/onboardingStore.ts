import { create } from 'zustand';
import type { LevelsByArea } from '@repo/schemas';

export type OnboardingStep = 'goal' | 'picker' | 'levels' | 'generating';

export interface AreaMeta {
  slug: string;
  name: string;
  description: string;
  icon: string;
}

export const CANONICAL_AREAS: AreaMeta[] = [
  {
    slug: 'editors-ides',
    name: 'Editors & IDEs',
    description: 'Modern editors, keybindings, LSP, and extension ecosystems',
    icon: '💻',
  },
  {
    slug: 'ai-assistants',
    name: 'AI Coding Assistants',
    description: 'In-line completions, chat debugging, and prompt engineering',
    icon: '🤖',
  },
  {
    slug: 'languages-frameworks',
    name: 'Languages & Frameworks',
    description: 'Type systems, SDKs, modern runtimes, and ecosystem idioms',
    icon: '⚡',
  },
  {
    slug: 'testing',
    name: 'Testing & Quality',
    description: 'Unit testing, mocking, assertions, and test generation',
    icon: '🧪',
  },
  {
    slug: 'deployment',
    name: 'CI/CD & Deployment',
    description: 'Git workflows, automated CI pipelines, and cloud deploys',
    icon: '🚀',
  },
  {
    slug: 'agents-automation',
    name: 'Autonomous Agents & Tooling',
    description: 'Multi-agent orchestration, MCP protocols, and automation',
    icon: '🧠',
  },
];

export const DEFAULT_LEVELS: LevelsByArea = {
  'editors-ides': 'working',
  'ai-assistants': 'working',
  'languages-frameworks': 'working',
  'testing': 'working',
  'deployment': 'working',
  'agents-automation': 'working',
};

const STORAGE_KEY = '__atlas_onboarding_state__';

export interface OnboardingState {
  step: OnboardingStep;
  domainId: string;
  domainSlug: string;
  domainTitle: string;
  selectedNodeIds: string[];
  levelsByArea: LevelsByArea;
  searchQuery: string;
  selectedAreaFilter: string | null;
  startedAt: number | null;
  isGenerating: boolean;
  generationError: string | null;

  // Actions
  setStep: (step: OnboardingStep) => void;
  toggleNode: (nodeId: string) => void;
  selectAllInArea: (area: string, nodeIds: string[]) => void;
  clearArea: (nodeIds: string[]) => void;
  selectAll: (allNodeIds: string[]) => void;
  clearAll: () => void;
  setLevel: (area: string, level: 'beginner' | 'working' | 'expert') => void;
  setSearchQuery: (query: string) => void;
  setSelectedAreaFilter: (area: string | null) => void;
  startOnboarding: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setGenerationError: (error: string | null) => void;
  reset: () => void;
  persist: () => void;
  restore: () => boolean;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  step: 'goal',
  domainId: '00000000-0000-0000-0000-000000000001',
  domainSlug: 'ai-assisted-software-development',
  domainTitle: 'AI-Assisted Software Development',
  selectedNodeIds: [],
  levelsByArea: { ...DEFAULT_LEVELS },
  searchQuery: '',
  selectedAreaFilter: null,
  startedAt: null,
  isGenerating: false,
  generationError: null,

  setStep: (step: OnboardingStep) => {
    set({ step });
    get().persist();
  },

  toggleNode: (nodeId: string) => {
    const current = get().selectedNodeIds;
    const exists = current.includes(nodeId);
    const updated = exists
      ? current.filter((id) => id !== nodeId)
      : [...current, nodeId];
    set({ selectedNodeIds: updated });
    get().persist();
  },

  selectAllInArea: (_area: string, nodeIds: string[]) => {
    const current = new Set(get().selectedNodeIds);
    for (const id of nodeIds) {
      current.add(id);
    }
    set({ selectedNodeIds: Array.from(current) });
    get().persist();
  },

  clearArea: (nodeIds: string[]) => {
    const toRemove = new Set(nodeIds);
    const updated = get().selectedNodeIds.filter((id) => !toRemove.has(id));
    set({ selectedNodeIds: updated });
    get().persist();
  },

  selectAll: (allNodeIds: string[]) => {
    set({ selectedNodeIds: [...allNodeIds] });
    get().persist();
  },

  clearAll: () => {
    set({ selectedNodeIds: [] });
    get().persist();
  },

  setLevel: (area: string, level: 'beginner' | 'working' | 'expert') => {
    set((state) => ({
      levelsByArea: {
        ...state.levelsByArea,
        [area]: level,
      },
    }));
    get().persist();
  },

  setSearchQuery: (searchQuery: string) => {
    set({ searchQuery });
  },

  setSelectedAreaFilter: (selectedAreaFilter: string | null) => {
    set({ selectedAreaFilter });
  },

  startOnboarding: () => {
    const now = Date.now();
    set({
      step: 'picker',
      startedAt: get().startedAt ?? now,
    });
    get().persist();
  },

  setIsGenerating: (isGenerating: boolean) => {
    set({ isGenerating });
  },

  setGenerationError: (generationError: string | null) => {
    set({ generationError });
  },

  reset: () => {
    set({
      step: 'goal',
      selectedNodeIds: [],
      levelsByArea: { ...DEFAULT_LEVELS },
      searchQuery: '',
      selectedAreaFilter: null,
      startedAt: null,
      isGenerating: false,
      generationError: null,
    });
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  },

  persist: () => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const state = get();
        const payload = {
          step: state.step,
          domainId: state.domainId,
          domainSlug: state.domainSlug,
          selectedNodeIds: state.selectedNodeIds,
          levelsByArea: state.levelsByArea,
          startedAt: state.startedAt,
        };
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }
  },

  restore: () => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          set({
            step: parsed.step ?? 'goal',
            domainId: parsed.domainId ?? get().domainId,
            domainSlug: parsed.domainSlug ?? get().domainSlug,
            selectedNodeIds: Array.isArray(parsed.selectedNodeIds)
              ? parsed.selectedNodeIds
              : [],
            levelsByArea: parsed.levelsByArea ?? { ...DEFAULT_LEVELS },
            startedAt: parsed.startedAt ?? null,
          });
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  },
}));
