import type { CanonicalEdge } from '@repo/schemas';
import type { EnrichedRoadmapNode } from './graphLayout';

export interface JourneyMilestone {
  id: string;
  slug: string;
  name: string;
  description: string;
  node_type: 'skill' | 'tool' | 'workflow';
  level: number;
  area: string;
  duration_minutes: number;
  tools: string[];
  prerequisites: string[]; // Milestone IDs
  external_url: string;
  key_takeaways: string[];
  injected_from_news?: boolean;
  news_title?: string;
}

export interface SkillJourney {
  id: string;
  title: string;
  icon: string;
  tagline: string;
  color: string;
  domain_id: string;
  milestones: JourneyMilestone[];
  edges: CanonicalEdge[];
}

export const SKILL_JOURNEYS: SkillJourney[] = [
  // 1. VIDEO EDITING AI
  {
    id: 'video-editing-ai',
    title: 'Video Editing AI',
    icon: '🎬',
    tagline: 'From automated rough cuts to generative video & AI voiceovers',
    color: '#ec4899',
    domain_id: '00000000-0000-0000-0000-000000000010',
    milestones: [
      {
        id: 'vid-1',
        slug: 'ai-scripting-hooks',
        name: 'AI Scripting & Retention Hooks',
        description: 'Engineer high-retention video hooks, 3-act pacing, and viral script outlines using Claude 3.5 & ChatGPT.',
        node_type: 'skill',
        level: 0,
        area: 'Pre-Production',
        duration_minutes: 15,
        tools: ['ChatGPT', 'Claude 3.5'],
        prerequisites: [],
        external_url: 'https://claude.ai',
        key_takeaways: [
          'First 3-second hook formulas that stop user scroll',
          'Pacing frameworks for short-form Reels/Shorts vs long-form YouTube',
          'Prompt templates for scene-by-scene storyboard prompts',
        ],
      },
      {
        id: 'vid-2',
        slug: 'auto-rough-cuts',
        name: 'Automated Rough Cuts & Transcription',
        description: 'Edit video as easily as editing text. Auto-remove filler words, pauses, and generate dynamic subtitles.',
        node_type: 'tool',
        level: 1,
        area: 'Editing & Timeline',
        duration_minutes: 20,
        tools: ['Descript', 'CapCut AI'],
        prerequisites: ['vid-1'],
        external_url: 'https://descript.com',
        key_takeaways: [
          'Text-based editing: cut pauses and repeated takes in one click',
          'Generate animated kinetic captions with custom brand typography',
          'Export multicam syncs and timeline XML to Premiere / DaVinci',
        ],
      },
      {
        id: 'vid-3',
        slug: 'ai-voice-audio-polish',
        name: 'AI Voiceovers & Audio Restoration',
        description: 'Clone natural voices, synthesize studio-grade voiceovers, and remove ambient background noise.',
        node_type: 'tool',
        level: 1,
        area: 'Audio & Voice',
        duration_minutes: 20,
        tools: ['ElevenLabs', 'Adobe Podcast AI'],
        prerequisites: ['vid-1'],
        external_url: 'https://elevenlabs.io',
        key_takeaways: [
          'Create professional voice clones with realistic emotional inflection',
          '1-click speech enhancement: turn phone mic audio into studio quality',
          'AI background music ducking and volume leveling',
        ],
      },
      {
        id: 'vid-4',
        slug: 'generative-b-roll',
        name: 'Generative AI B-Roll & Visuals',
        description: 'Generate cinematic B-roll shots, camera movements, and visual transitions using text-to-video diffusion models.',
        node_type: 'workflow',
        level: 2,
        area: 'Visual Effects',
        duration_minutes: 30,
        tools: ['Runway Gen-3 Alpha', 'Pika 1.0'],
        prerequisites: ['vid-2', 'vid-3'],
        external_url: 'https://runwayml.com',
        key_takeaways: [
          'Camera motion control: zooms, pans, orbit shots via prompt directives',
          'First-and-last frame interpolation for seamless visual loops',
          'Upscaling 720p generative outputs to crisp 4K timeline assets',
        ],
      },
      {
        id: 'vid-5',
        slug: 'upscaling-magic-masking',
        name: 'AI Upscaling & Object Masking',
        description: 'Isolate subjects without green screens, track moving objects, and upscale footage with neural networks.',
        node_type: 'tool',
        level: 3,
        area: 'Post-Production',
        duration_minutes: 25,
        tools: ['Topaz Video AI', 'DaVinci Magic Mask'],
        prerequisites: ['vid-4'],
        external_url: 'https://www.topazlabs.com/topaz-video-ai',
        key_takeaways: [
          'Neural motion tracking and background rotoscoping in seconds',
          'De-noising, face recovery, and 60fps frame interpolation',
          'Color grading matching across mixed camera sources',
        ],
      },
      {
        id: 'vid-6',
        slug: 'batch-social-distribution',
        name: 'Automated Multi-Platform Distribution',
        description: 'Automatically reframe 16:9 videos to 9:16 vertical, generate viral clips, and design high-CTR thumbnails.',
        node_type: 'workflow',
        level: 4,
        area: 'Distribution',
        duration_minutes: 20,
        tools: ['Opus Clip', 'Midjourney Thumbnails'],
        prerequisites: ['vid-5'],
        external_url: 'https://opus.pro',
        key_takeaways: [
          'Auto-face tracking smart reframing for TikTok, YouTube Shorts & IG',
          'AI-generated thumbnail variants with facial expression exaggeration',
          'Metadata and title generation for maximum engagement',
        ],
      },
    ],
    edges: [
      { id: 've-1-2', from_node: 'vid-1', to_node: 'vid-2' },
      { id: 've-1-3', from_node: 'vid-1', to_node: 'vid-3' },
      { id: 've-2-4', from_node: 'vid-2', to_node: 'vid-4' },
      { id: 've-3-4', from_node: 'vid-3', to_node: 'vid-4' },
      { id: 've-4-5', from_node: 'vid-4', to_node: 'vid-5' },
      { id: 've-5-6', from_node: 'vid-5', to_node: 'vid-6' },
    ],
  },

  // 2. GRAPHIC DESIGN AI
  {
    id: 'graphic-design-ai',
    title: 'Graphic Design AI',
    icon: '🎨',
    tagline: 'Generate brand identities, commercial vectors, and stunning visual art',
    color: '#8b5cf6',
    domain_id: '00000000-0000-0000-0000-000000000020',
    milestones: [
      {
        id: 'des-1',
        slug: 'visual-prompt-engineering',
        name: 'Prompt Crafting for Visual Styles',
        description: 'Master lighting, aspect ratios, composition, color palettes, and seed controls for generative image engines.',
        node_type: 'skill',
        level: 0,
        area: 'Foundations',
        duration_minutes: 15,
        tools: ['Midjourney v6', 'Leonardo.ai'],
        prerequisites: [],
        external_url: 'https://midjourney.com',
        key_takeaways: [
          'Lighting and camera parameters: volumetric, cinematic, rim light, 35mm lens',
          'Stylize `--s`, chaos `--c`, and weird `--w` parameter tuning',
          'Excluding unwanted elements with negative weighting `--no`',
        ],
      },
      {
        id: 'des-2',
        slug: 'midjourney-precision-control',
        name: 'Midjourney v6 Precision Control',
        description: 'Inpaint specific regions, expand canvas boundaries, and iterate on character poses with pin-point accuracy.',
        node_type: 'tool',
        level: 1,
        area: 'Raster Art',
        duration_minutes: 25,
        tools: ['Midjourney v6', 'Flux.1'],
        prerequisites: ['des-1'],
        external_url: 'https://midjourney.com',
        key_takeaways: [
          'Vary Region: replace or edit objects inside an existing image',
          'Pan & Zoom Out: seamlessly expand scene backgrounds without distortion',
          'Style references `--sref` for unified aesthetic across an entire campaign',
        ],
      },
      {
        id: 'des-3',
        slug: 'vector-brand-synthesis',
        name: 'Vector & Brand Icon Synthesis',
        description: 'Generate clean, infinitely scalable SVG vectors, app icons, and logo concepts ready for production.',
        node_type: 'tool',
        level: 1,
        area: 'Vector & Branding',
        duration_minutes: 20,
        tools: ['Recraft AI', 'Adobe Illustrator AI'],
        prerequisites: ['des-1'],
        external_url: 'https://recraft.ai',
        key_takeaways: [
          'Generating clean vector paths with minimal anchor points',
          'App icon design: Flat, 3D claymorphic, and glassmorphic styles',
          'Color palette enforcement according to brand hex codes',
        ],
      },
      {
        id: 'des-4',
        slug: 'character-product-consistency',
        name: 'Consistent Characters & Product Mockups',
        description: 'Maintain identical faces, brand mascots, and real physical products across different poses and environments.',
        node_type: 'workflow',
        level: 2,
        area: 'Commercial Design',
        duration_minutes: 30,
        tools: ['Flux.1 ControlNet', 'Midjourney `--cref`'],
        prerequisites: ['des-2', 'des-3'],
        external_url: 'https://blackforestlabs.ai',
        key_takeaways: [
          'Character reference tags `--cref` to preserve identity across 20+ scenes',
          'Product placement: inserting real packaging into realistic lifestyle scenes',
          'ControlNet edge & pose detection for exact layout matching',
        ],
      },
      {
        id: 'des-5',
        slug: 'generative-fill-retouching',
        name: 'Generative Fill & Photo Retouching',
        description: 'Expand, modify, and composite high-resolution photos using Adobe Firefly Generative Fill and AI masking.',
        node_type: 'tool',
        level: 3,
        area: 'Compositing',
        duration_minutes: 25,
        tools: ['Photoshop Firefly', 'Krea AI'],
        prerequisites: ['des-4'],
        external_url: 'https://adobe.com/products/photoshop.html',
        key_takeaways: [
          'Seamless background replacement matching perspective and shadows',
          'Removing unwanted objects, blemishes, and photobombers with one stroke',
          'Generative expand: turning square banners into billboard aspect ratios',
        ],
      },
      {
        id: 'des-6',
        slug: 'print-commercial-asset-delivery',
        name: 'Commercial Asset Packaging & Delivery',
        description: 'Upscale assets to 300 DPI for print, prepare CMYK color separations, and create Figma marketing components.',
        node_type: 'workflow',
        level: 4,
        area: 'Final Delivery',
        duration_minutes: 20,
        tools: ['Magnific AI', 'Figma AI'],
        prerequisites: ['des-5'],
        external_url: 'https://magnific.ai',
        key_takeaways: [
          'Hallucination-guided upscaling to 16K resolution without blurring',
          'Vectorizing raster details into production-ready SVG and EPS',
          'Figma auto-layout components for responsive social & web ad sets',
        ],
      },
    ],
    edges: [
      { id: 'de-1-2', from_node: 'des-1', to_node: 'des-2' },
      { id: 'de-1-3', from_node: 'des-1', to_node: 'des-3' },
      { id: 'de-2-4', from_node: 'des-2', to_node: 'des-4' },
      { id: 'de-3-4', from_node: 'des-3', to_node: 'des-4' },
      { id: 'de-4-5', from_node: 'des-4', to_node: 'des-5' },
      { id: 'de-5-6', from_node: 'des-5', to_node: 'des-6' },
    ],
  },

  // 3. AI CODE EDITORS
  {
    id: 'ai-code-editors',
    title: 'AI Code Editors',
    icon: '💻',
    tagline: 'Modern developer toolchain with autonomous agents and codebase indexing',
    color: '#3b82f6',
    domain_id: '00000000-0000-0000-0000-000000000030',
    milestones: [
      {
        id: 'code-1',
        slug: 'ai-autocomplete-fundamentals',
        name: 'AI Autocomplete & Inline Completion',
        description: 'Supercharge your daily coding flow with instant sub-50ms tab completion and multi-line prediction.',
        node_type: 'tool',
        level: 0,
        area: 'Editor Basics',
        duration_minutes: 15,
        tools: ['GitHub Copilot', 'Supermaven'],
        prerequisites: [],
        external_url: 'https://supermaven.com',
        key_takeaways: [
          'High-velocity tab completion habits for boilerplate and repetitive code',
          'Inline ghost-text prompts with comments and function signatures',
          'Latency optimization: choosing ultra-fast models vs deep models',
        ],
      },
      {
        id: 'code-2',
        slug: 'context-window-rules',
        name: 'Context Window Hygiene & `.cursorrules`',
        description: 'Control how AI reads your repository. Craft project rules and index documentation for zero hallucination.',
        node_type: 'skill',
        level: 1,
        area: 'Prompt & Rules',
        duration_minutes: 20,
        tools: ['Cursor IDE', 'Claude 3.5 Sonnet'],
        prerequisites: ['code-1'],
        external_url: 'https://cursor.com',
        key_takeaways: [
          'Writing modular `.cursorrules` to enforce architecture and lint styles',
          'Using `@docs`, `@codebase`, and `@git` tags to target exact files',
          'Preventing context drift on large monorepos with selective tagging',
        ],
      },
      {
        id: 'code-3',
        slug: 'multi-file-agentic-composer',
        name: 'Multi-File Composer & Terminal Agents',
        description: 'Direct AI to write, refactor, and commit across dozens of files simultaneously from editor and terminal.',
        node_type: 'workflow',
        level: 2,
        area: 'Agentic Coding',
        duration_minutes: 30,
        tools: ['Cursor Composer', 'Claude Code CLI'],
        prerequisites: ['code-2'],
        external_url: 'https://anthropic.com/claude-code',
        key_takeaways: [
          'Full-feature generation spanning backend schemas, APIs, and React UI',
          'Claude Code CLI: autonomous terminal debugging and test-driven fixes',
          'Reviewing diffs, interactive checkpoint rollbacks, and atomic git commits',
        ],
      },
      {
        id: 'code-4',
        slug: 'generative-ui-prototyping',
        name: 'Generative UI & Full-Stack Prototyping',
        description: 'Turn screenshots and natural language prompts into production-ready React + Tailwind components in seconds.',
        node_type: 'tool',
        level: 3,
        area: 'Frontend Engineering',
        duration_minutes: 25,
        tools: ['v0 by Vercel', 'Bolt.new'],
        prerequisites: ['code-3'],
        external_url: 'https://v0.dev',
        key_takeaways: [
          'Prompting accessible, mobile-responsive UI components with Radix & Tailwind',
          'One-click CLI export directly into your active Next.js repository',
          'Full-stack prototype generation with live browser preview environments',
        ],
      },
      {
        id: 'code-5',
        slug: 'autonomous-testing-ci',
        name: 'Autonomous Testing & Self-Healing CI',
        description: 'Generate comprehensive unit and integration test suites automatically, and heal broken tests in CI/CD.',
        node_type: 'workflow',
        level: 4,
        area: 'DevOps & Quality',
        duration_minutes: 30,
        tools: ['Promptfoo Evals', 'Playwright AI'],
        prerequisites: ['code-4'],
        external_url: 'https://promptfoo.dev',
        key_takeaways: [
          'AI-generated edge-case test matrices (boundary values, null checks)',
          'Automated Playwright browser visual tests with natural language steps',
          'Self-healing CI pipelines that automatically submit PR fixes for lint failures',
        ],
      },
    ],
    edges: [
      { id: 'ce-1-2', from_node: 'code-1', to_node: 'code-2' },
      { id: 'ce-2-3', from_node: 'code-2', to_node: 'code-3' },
      { id: 'ce-3-4', from_node: 'code-3', to_node: 'code-4' },
      { id: 'ce-4-5', from_node: 'code-4', to_node: 'code-5' },
    ],
  },

  // 4. AI CONTENT & WRITING
  {
    id: 'ai-content-writing',
    title: 'AI Content & Writing',
    icon: '✍️',
    tagline: 'Fact-grounded research, brand voice matching, and high-impact long-form writing',
    color: '#10b981',
    domain_id: '00000000-0000-0000-0000-000000000040',
    milestones: [
      {
        id: 'write-1',
        slug: 'deep-research-sourcing',
        name: 'Deep Research & Verified Sourcing',
        description: 'Perform web-scale synthesis with verifiable academic and news citations, bypassing search hallucinations.',
        node_type: 'tool',
        level: 0,
        area: 'Research',
        duration_minutes: 15,
        tools: ['Perplexity Pro', 'Consensus AI'],
        prerequisites: [],
        external_url: 'https://perplexity.ai',
        key_takeaways: [
          'Pro Search query chaining for complex multi-variable questions',
          'Filtering by peer-reviewed papers, patents, and verified domains',
          'Exporting structured Markdown outlines with live footnote citations',
        ],
      },
      {
        id: 'write-2',
        slug: 'brand-voice-calibration',
        name: 'Brand Voice & Style Guide Calibration',
        description: 'Calibrate AI writing models to sound uniquely like your personal tone, avoiding generic corporate AI jargon.',
        node_type: 'skill',
        level: 1,
        area: 'Voice & Style',
        duration_minutes: 20,
        tools: ['Claude 3.5 Sonnet', 'ChatGPT Custom Instructions'],
        prerequisites: ['write-1'],
        external_url: 'https://claude.ai',
        key_takeaways: [
          'Banning corporate cliches: "delve", "tapestry", "in summary"',
          'Teaching models sentence rhythm: mixing short punchy lines with cadence',
          'Building reusable Claude Projects with custom editorial guidelines',
        ],
      },
      {
        id: 'write-3',
        slug: 'longform-document-synthesis',
        name: 'Long-Form Drafting & Document Synthesis',
        description: 'Synthesize 50-page PDFs, interviews, and recordings into clear whitepapers, guides, and comprehensive essays.',
        node_type: 'workflow',
        level: 2,
        area: 'Long-Form Writing',
        duration_minutes: 25,
        tools: ['NotebookLM', 'Notion AI'],
        prerequisites: ['write-2'],
        external_url: 'https://notebooklm.google',
        key_takeaways: [
          'Grounded knowledge bases: querying your own uploaded PDFs and docs',
          'Generating deep-dive podcasts and audio overviews from notes',
          'Notion AI workspace search and automated executive summaries',
        ],
      },
      {
        id: 'write-4',
        slug: 'multichannel-repurposing',
        name: 'Multi-Channel Repurposing & Distribution',
        description: 'Repurpose one long-form pillar article into 10 platform-tailored assets (threads, carousels, newsletters).',
        node_type: 'workflow',
        level: 3,
        area: 'Distribution',
        duration_minutes: 20,
        tools: ['Beehiiv AI', 'Taplio'],
        prerequisites: ['write-3'],
        external_url: 'https://beehiiv.com',
        key_takeaways: [
          'Deconstructing essays into engaging 7-part LinkedIn carousels',
          'Newsletter formatting with scannable headers and CTA hooks',
          'A/B testing email subject lines with automated sentiment analysis',
        ],
      },
    ],
    edges: [
      { id: 'we-1-2', from_node: 'write-1', to_node: 'write-2' },
      { id: 'we-2-3', from_node: 'write-2', to_node: 'write-3' },
      { id: 'we-3-4', from_node: 'write-3', to_node: 'write-4' },
    ],
  },
];

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000099';

// Resolve appropriate journey ID from explicit ID, tags, or title
export function resolveJourneyId(
  explicitJourneyId?: string | null,
  tags?: string[],
  title?: string,
): string {
  if (explicitJourneyId && SKILL_JOURNEYS.some((j) => j.id === explicitJourneyId)) {
    return explicitJourneyId;
  }
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (SKILL_JOURNEYS.some((j) => j.id === tag)) {
        return tag;
      }
    }
  }
  const lower = (title || '').toLowerCase();
  if (
    lower.includes('video') ||
    lower.includes('runway') ||
    lower.includes('capcut') ||
    lower.includes('elevenlabs') ||
    lower.includes('topaz') ||
    lower.includes('voiceover')
  ) {
    return 'video-editing-ai';
  }
  if (
    lower.includes('graphic') ||
    lower.includes('design') ||
    lower.includes('recraft') ||
    lower.includes('midjourney') ||
    lower.includes('firefly') ||
    lower.includes('photoshop') ||
    lower.includes('vector') ||
    lower.includes('magnific')
  ) {
    return 'graphic-design-ai';
  }
  if (
    lower.includes('code') ||
    lower.includes('cursor') ||
    lower.includes('claude code') ||
    lower.includes('v0') ||
    lower.includes('supermaven') ||
    lower.includes('developer') ||
    lower.includes('terminal') ||
    lower.includes('copilot')
  ) {
    return 'ai-code-editors';
  }
  if (
    lower.includes('writing') ||
    lower.includes('content') ||
    lower.includes('perplexity') ||
    lower.includes('notebooklm') ||
    lower.includes('author') ||
    lower.includes('research')
  ) {
    return 'ai-content-writing';
  }
  return 'video-editing-ai';
}

// Helper to get storage key
export function getStorageKey(userId: string): string {
  const safeId = userId || DEFAULT_USER_ID;
  return `__atlas_journey_progress_${safeId}__`;
}

// Key for custom injected milestones from news
export function getInjectedStorageKey(userId: string): string {
  const safeId = userId || DEFAULT_USER_ID;
  return `__atlas_journey_injected_nodes_${safeId}__`;
}

// Load user progress map (milestoneId -> status)
export function loadJourneyProgress(userId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw =
      window.localStorage?.getItem(getStorageKey(userId)) ||
      window.sessionStorage?.getItem(getStorageKey(userId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return {};
}

// Load custom milestones injected from news
export function loadInjectedMilestones(userId: string): Record<string, JourneyMilestone[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw =
      window.localStorage?.getItem(getInjectedStorageKey(userId)) ||
      window.sessionStorage?.getItem(getInjectedStorageKey(userId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return {};
}

// Save custom milestone injected from news
export function saveInjectedMilestone(
  userId: string,
  journeyId: string,
  milestone: JourneyMilestone,
): void {
  const current = loadInjectedMilestones(userId);
  const list = current[journeyId] ? [...current[journeyId]] : [];
  const existingIdx = list.findIndex(
    (m) => m.id === milestone.id || m.slug === milestone.slug,
  );
  if (existingIdx >= 0) {
    list[existingIdx] = milestone;
  } else {
    list.push(milestone);
  }
  current[journeyId] = list;

  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(current);
      window.localStorage?.setItem(getInjectedStorageKey(userId), serialized);
      window.sessionStorage?.setItem(getInjectedStorageKey(userId), serialized);
    } catch {
      // ignore
    }
  }
}

// Save progress for a milestone
export function saveMilestoneStatus(
  userId: string,
  milestoneId: string,
  status: string,
): Record<string, string> {
  const current = loadJourneyProgress(userId);
  current[milestoneId] = status;
  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(current);
      window.localStorage?.setItem(getStorageKey(userId), serialized);
      window.sessionStorage?.setItem(getStorageKey(userId), serialized);
    } catch {
      // ignore
    }
  }
  return current;
}

// Compute dynamic statuses for all milestones in a journey
export function getEnrichedJourneyNodes(
  journey: SkillJourney,
  userProgress: Record<string, string>,
): EnrichedRoadmapNode[] {
  const completedIds = new Set(
    Object.entries(userProgress)
      .filter(([_, status]) => status === 'completed')
      .map(([id]) => id),
  );

  return journey.milestones.map((m) => {
    let visualStatus: 'completed' | 'in_progress' | 'available' | 'locked' = 'available';

    const recorded = userProgress[m.id];
    if (recorded === 'completed') {
      visualStatus = 'completed';
    } else if (recorded === 'in_progress') {
      visualStatus = 'in_progress';
    } else if (recorded === 'available' || m.injected_from_news) {
      visualStatus = 'available';
    } else {
      // Check if all prerequisites are completed
      const allPrereqsMet = m.prerequisites.every((pid) => completedIds.has(pid));
      visualStatus = allPrereqsMet ? 'available' : 'locked';
    }

    return {
      id: m.id,
      domain_id: journey.domain_id,
      slug: m.slug,
      name: m.name,
      description: m.description,
      node_type: m.node_type,
      level: m.level,
      area: m.area,
      status: visualStatus,
      external_url: m.external_url,
      version_tag: null,
      userNodeId: `un-${m.id}`,
      fast_track: m.level === 0 || Boolean(m.injected_from_news),
      completed_at: visualStatus === 'completed' ? new Date().toISOString() : null,
      version: 1,
    };
  });
}
