import type { NewsCardItem } from '../components/NewsCard';
import type { SponsoredCardProps } from '../components/SponsoredCard';
import type { VerdictDetail } from '../components/VerdictPreviewModal';
import { resolveJourneyId, SKILL_JOURNEYS } from './skillJourneys';

export const FALLBACK_NEWS_ITEMS: NewsCardItem[] = [
  // ==========================================
  // 1. VIDEO EDITING AI
  // ==========================================
  {
    id: 'news-runway-gen3-001',
    title: 'Runway Gen-3 Alpha Launches Advanced Camera Directives and Multi-Motion Keyframing',
    published_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    bullets: [
      'Runway releases Gen-3 Alpha with controllable camera orbits, pans, zooms, and speed ramps.',
      'Precise prompt steering enables consistent video generation with prompt-adherent lighting and textures.',
      'Integrates directly into timeline post-production for high-fidelity B-roll generation.',
    ],
    impact_score: 9,
    impact_rationale: 'Breakthrough cinematic camera control and physics-accurate generative video generation.',
    tags: ['video-editing-ai', 'runway', 'generative-video', 'b-roll'],
    url: 'https://runwayml.com/blog/gen-3-alpha-camera-controls',
    source_name: 'Runway Research',
    has_roadmap_match: true,
    journey_id: 'video-editing-ai',
    journey_title: 'Video Editing AI',
    journey_icon: '🎬',
  },
  {
    id: 'news-capcut-script-002',
    title: 'CapCut AI Unveils Auto-Beat Sync & Smart Script-to-Timeline Generation',
    published_at: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    bullets: [
      'CapCut introduces automated rough cuts powered by natural-language script analysis.',
      'Aligns speech cadences and cuts directly to the beat drops of imported soundtracks.',
      'Drastically cuts rough-cut timeline assembly from 3 hours to under 5 minutes.',
    ],
    impact_score: 8,
    impact_rationale: 'Automated rough cuts, transcription-based trimming, and audio-reactive pacing in minutes.',
    tags: ['video-editing-ai', 'capcut', 'rough-cuts', 'automation'],
    url: 'https://capcut.com/news/ai-script-to-timeline',
    source_name: 'CapCut Studio',
    has_roadmap_match: true,
    journey_id: 'video-editing-ai',
    journey_title: 'Video Editing AI',
    journey_icon: '🎬',
  },
  {
    id: 'news-elevenlabs-voice-003',
    title: 'ElevenLabs Releases Studio-Grade Multi-Speaker Voice Engine with Expressive Emotion',
    published_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    bullets: [
      'ElevenLabs launches v2 model with realistic pauses, laughter, and emotional tone shifts.',
      'Zero-latency dynamic voice generation replaces costly voice actor studio re-recordings.',
      'Includes instant room acoustic matching and automated mic audio remastering.',
    ],
    impact_score: 8,
    impact_rationale: 'Hyper-realistic voice cloning with controllable emotion tags and noise-free studio output.',
    tags: ['video-editing-ai', 'elevenlabs', 'voiceovers', 'audio'],
    url: 'https://elevenlabs.io/blog/expressive-multi-speaker-v2',
    source_name: 'ElevenLabs AI',
    has_roadmap_match: true,
    journey_id: 'video-editing-ai',
    journey_title: 'Video Editing AI',
    journey_icon: '🎬',
  },
  {
    id: 'news-topaz-upscale-004',
    title: 'Topaz Video AI 5.0 Adds Real-Time 4K Neural Face Recovery and Motion Deblur',
    published_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    bullets: [
      'Topaz 5.0 recovers fine facial micro-details and textures from heavily compressed 1080p footage.',
      'Eliminates camera shake and motion blur using optical flow neural networks.',
      'Outputs broadcast-quality 4K 60fps assets ready for high-end delivery.',
    ],
    impact_score: 8,
    impact_rationale: 'State-of-the-art neural upscaling and face reconstruction for archival and compressed video.',
    tags: ['video-editing-ai', 'topaz', 'upscaling', 'post-production'],
    url: 'https://topazlabs.com/topaz-video-ai-5-release',
    source_name: 'Topaz Labs',
    has_roadmap_match: true,
    journey_id: 'video-editing-ai',
    journey_title: 'Video Editing AI',
    journey_icon: '🎬',
  },

  // ==========================================
  // 2. GRAPHIC DESIGN AI
  // ==========================================
  {
    id: 'news-recraft-vector-005',
    title: 'Recraft v3 Beats Midjourney in Vector Graphic Generation and Clean SVG Export',
    published_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    bullets: [
      'Recraft v3 wins #1 on Hugging Face leaderboard for graphic design and typography fidelity.',
      'Exports clean SVG vector paths with minimal anchor points, ready for Figma and Illustrator.',
      'Strictly adheres to brand hex color palettes and icon grid systems.',
    ],
    impact_score: 9,
    impact_rationale: 'World-first AI model designed specifically for production-ready editable vector graphics.',
    tags: ['graphic-design-ai', 'recraft', 'vector', 'branding'],
    url: 'https://recraft.ai/blog/recraft-v3-vector-leadership',
    source_name: 'Recraft AI',
    has_roadmap_match: true,
    journey_id: 'graphic-design-ai',
    journey_title: 'Graphic Design AI',
    journey_icon: '🎨',
  },
  {
    id: 'news-midjourney-cref-006',
    title: 'Midjourney v6.1 Introduces Unified `--sref` and Character Reference `--cref`',
    published_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    bullets: [
      'Midjourney releases unified style references `--sref` and character references `--cref`.',
      'Maintains identical model facial features, hairstyles, and outfits across hundreds of variations.',
      'Enables agency-grade commercial marketing campaigns with uniform aesthetic coherence.',
    ],
    impact_score: 9,
    impact_rationale: 'Solves the generative consistency challenge for brand identity and campaign assets.',
    tags: ['graphic-design-ai', 'midjourney', 'consistency', 'branding'],
    url: 'https://midjourney.com/updates/v6-1-consistency',
    source_name: 'Midjourney Updates',
    has_roadmap_match: true,
    journey_id: 'graphic-design-ai',
    journey_title: 'Graphic Design AI',
    journey_icon: '🎨',
  },
  {
    id: 'news-adobe-firefly-007',
    title: 'Adobe Firefly Image 3 Deeply Integrated into Photoshop Generative Expand and Fill',
    published_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    bullets: [
      'Adobe embeds Firefly 3 directly into Photoshop desktop and iPad workflows.',
      'Generative Expand seamlessly changes aspect ratios from 1:1 Instagram to 16:9 billboards.',
      'Enterprise-safe with commercial indemnification and IP-safe training data.',
    ],
    impact_score: 8,
    impact_rationale: 'Photorealistic generative fill with automatic perspective matching and shadow blending.',
    tags: ['graphic-design-ai', 'photoshop', 'firefly', 'compositing'],
    url: 'https://adobe.com/news/firefly-image-3-photoshop',
    source_name: 'Adobe Creative Cloud',
    has_roadmap_match: true,
    journey_id: 'graphic-design-ai',
    journey_title: 'Graphic Design AI',
    journey_icon: '🎨',
  },
  {
    id: 'news-magnific-upscale-008',
    title: 'Magnific AI 16K Precision Upscaler Adopted for Commercial Print Campaigns',
    published_at: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    bullets: [
      'Magnific AI upscales images to 16K resolution with realistic micro-texture synthesis.',
      'Transforms digital AI art into print-ready 300 DPI high-definition CMYK formats.',
      'Configurable Creativity and Fractality sliders give designers complete detail control.',
    ],
    impact_score: 7,
    impact_rationale: 'Ultra-resolution hallucination-guided upscaling for physical print and billboard delivery.',
    tags: ['graphic-design-ai', 'magnific', 'print', 'upscaling'],
    url: 'https://magnific.ai/blog/commercial-print-workflows',
    source_name: 'Magnific AI',
    has_roadmap_match: true,
    journey_id: 'graphic-design-ai',
    journey_title: 'Graphic Design AI',
    journey_icon: '🎨',
  },

  // ==========================================
  // 3. AI CODE EDITORS
  // ==========================================
  {
    id: 'news-claude-code-010',
    title: 'Anthropic Launches Claude Code: An Autonomous Terminal Agent for Developers',
    published_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    bullets: [
      'Anthropic releases Claude Code CLI for autonomous, agentic terminal workflows.',
      'Handles multi-file refactoring, git commits, running tests, and bug resolution from shell.',
      'Provides high-accuracy tool use with zero IDE lock-in across existing repositories.',
    ],
    impact_score: 9,
    impact_rationale: 'Breakthrough terminal-native agentic coding workflow for software engineers.',
    tags: ['ai-code-editors', 'agents', 'cli', 'anthropic'],
    url: 'https://anthropic.com/news/claude-code-terminal-agent',
    source_name: 'Anthropic Engineering',
    has_roadmap_match: true,
    journey_id: 'ai-code-editors',
    journey_title: 'AI Code Editors',
    journey_icon: '💻',
  },
  {
    id: 'news-cursor-override-015',
    title: 'Cursor Composer Multi-File Agent Supersedes GitHub Copilot Inline Tab Completion',
    published_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    bullets: [
      'Cursor replaces traditional inline single-line completion with whole-codebase agentic edits.',
      'Benchmark studies demonstrate 4x productivity increase compared to standard Copilot tab.',
      'Full backward-compatible migration path preserves developer keybindings and habits.',
    ],
    impact_score: 9,
    impact_rationale: 'Agentic multi-file composer supersedes single-line autocomplete.',
    tags: ['ai-code-editors', 'cursor', 'copilot', 'agentic'],
    url: 'https://cursor.com/blog/agentic-workflows-composer',
    source_name: 'Cursor Blog',
    has_roadmap_match: true,
    journey_id: 'ai-code-editors',
    journey_title: 'AI Code Editors',
    journey_icon: '💻',
  },
  {
    id: 'news-v0-013',
    title: 'v0 Generative UI by Vercel Adds Full-Stack Next.js Prototyping & Live Backend Preview',
    published_at: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
    bullets: [
      'Vercel announces enterprise launch of v0 generative frontend component system.',
      'Generates accessible, responsive Tailwind + React components from natural language prompts.',
      'Seamlessly exports copy-paste code to modern Next.js and React web applications.',
    ],
    impact_score: 8,
    impact_rationale: 'Production-ready generative UI component generation for modern web developers.',
    tags: ['ai-code-editors', 'prototyping', 'frontend', 'vercel'],
    url: 'https://vercel.com/blog/v0-generative-ui-production',
    source_name: 'Vercel Engineering',
    has_roadmap_match: true,
    journey_id: 'ai-code-editors',
    journey_title: 'AI Code Editors',
    journey_icon: '💻',
  },
  {
    id: 'news-supermaven-014',
    title: 'Supermaven Ultra-Low Latency Code Completion Assistant with 300K Token Context',
    published_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    bullets: [
      'Supermaven launches ultra-fast code completion engine responding in under 50ms.',
      'Indexes entire repository context up to 300,000 tokens for precise project awareness.',
      'Provides high-speed alternative to heavy autocomplete models without network lag.',
    ],
    impact_score: 8,
    impact_rationale: 'Sub-50ms latency completion engine with 300k token context window.',
    tags: ['ai-code-editors', 'autocomplete', 'fast', 'supermaven'],
    url: 'https://supermaven.com/announcing-300k-context-completion',
    source_name: 'Supermaven',
    has_roadmap_match: true,
    journey_id: 'ai-code-editors',
    journey_title: 'AI Code Editors',
    journey_icon: '💻',
  },

  // ==========================================
  // 4. AI CONTENT & WRITING
  // ==========================================
  {
    id: 'news-perplexity-search-016',
    title: 'Perplexity Pro Search Launches Deep Academic & Market Synthesis with Live Citations',
    published_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    bullets: [
      'Perplexity Pro executes multi-step query decomposition to answer complex research topics.',
      'Directly links claims to verified sources, academic preprints, and market filings.',
      'Exports clean structured reports with Markdown formatting and reference footnotes.',
    ],
    impact_score: 8,
    impact_rationale: 'Multi-step web reasoning with verified citations eliminates search hallucinations.',
    tags: ['ai-content-writing', 'perplexity', 'research', 'citations'],
    url: 'https://perplexity.ai/blog/deep-research-sourcing',
    source_name: 'Perplexity AI',
    has_roadmap_match: true,
    journey_id: 'ai-content-writing',
    journey_title: 'AI Content & Writing',
    journey_icon: '✍️',
  },
  {
    id: 'news-claude-writing-017',
    title: 'Claude 3.5 Sonnet Adds Custom Style Guides & Artifacts for Long-Form Authors',
    published_at: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
    bullets: [
      'Claude Projects allow writers to lock in brand voice guidelines, banned words, and rhythm.',
      'Interactive Artifacts allow editing long essays in side-by-side view with version history.',
      'Maintains nuanced pacing without falling back into corporate buzzwords or repetitive structures.',
    ],
    impact_score: 8,
    impact_rationale: 'Eliminates AI cliches with precise tone calibration and living editorial documents.',
    tags: ['ai-content-writing', 'claude', 'style-guide', 'voice'],
    url: 'https://anthropic.com/news/style-guides-artifacts-writing',
    source_name: 'Anthropic Writing',
    has_roadmap_match: true,
    journey_id: 'ai-content-writing',
    journey_title: 'AI Content & Writing',
    journey_icon: '✍️',
  },
  {
    id: 'news-notebooklm-audio-018',
    title: 'Google NotebookLM Introduces Grounded Audio Discussions from 100-Page Document Sets',
    published_at: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
    bullets: [
      'NotebookLM generates two-host conversational audio deep-dives from user-uploaded PDFs.',
      'Zero hallucinations: strictly grounds every claim in source documents with page citations.',
      'Dramatically speeds up comprehension of long-form research, briefs, and interviews.',
    ],
    impact_score: 8,
    impact_rationale: 'Converts complex source documents into engaging podcast-style audio and synthesized briefs.',
    tags: ['ai-content-writing', 'notebooklm', 'synthesis', 'audio'],
    url: 'https://blog.google/technology/ai/notebooklm-audio-overviews',
    source_name: 'Google Labs',
    has_roadmap_match: true,
    journey_id: 'ai-content-writing',
    journey_title: 'AI Content & Writing',
    journey_icon: '✍️',
  },
  {
    id: 'news-substack-minor-019',
    title: 'Substack Reader 2.1 Adds Dark Mode Tinting and Font Kerning Adjustments',
    published_at: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    bullets: [
      'Routine app update introduces refined serif font options and dark mode tints.',
      'Fixes minor offline sync glitch when reading articles on slow airplane WiFi.',
      'No workflow changes to drafting, publishing, or content generation.',
    ],
    impact_score: 3,
    impact_rationale: 'Minor visual and UI cosmetic update with no functional impact on writing tools.',
    tags: ['ai-content-writing', 'substack', 'reading', 'minor'],
    url: 'https://substack.com/updates/reader-2-1',
    source_name: 'Substack Team',
    has_roadmap_match: false,
    journey_id: 'ai-content-writing',
    journey_title: 'AI Content & Writing',
    journey_icon: '✍️',
  },
];

export const FALLBACK_SPONSORED_PLACEMENTS: SponsoredCardProps[] = [
  {
    id: 'sponsor-runway-enterprise',
    title: 'Runway Enterprise Studio Platform',
    body: 'Empower creative teams with high-performance video generation, dedicated GPU capacity, and collaborative multi-track timelines.',
    cta_url: 'https://runwayml.com',
    sponsor_name: 'RunwayML',
  },
  {
    id: 'sponsor-recraft-pro',
    title: 'Recraft Pro: Infinite Vector Canvas for Designers',
    body: 'Generate editable brand palettes, production SVG icons, and 3D mockups directly inside your Figma design workspace.',
    cta_url: 'https://recraft.ai',
    sponsor_name: 'Recraft AI',
  },
];

export function getFallbackVerdict(item: NewsCardItem): VerdictDetail {
  // 1. VIDEO EDITING AI VERDICTS
  if (item.id === 'news-runway-gen3-001' || item.title.includes('Runway')) {
    return {
      id: 'verdict-runway-gen3',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'video-editing-ai',
      journey_title: 'Video Editing AI',
      new_node_name: 'Generative AI B-Roll & Visuals',
      new_node_id: 'vid-4',
      insert_after_names: ['Automated Rough Cuts & Transcription', 'AI Voiceovers & Audio Restoration'],
      insert_after_node_ids: ['vid-2', 'vid-3'],
      reasoning:
        'Runway Gen-3 Alpha introduces high-fidelity camera control and multi-motion keyframing. Approved as an injection into your Video Editing AI roadmap.',
      confidence: 0.96,
    };
  }

  if (item.id === 'news-capcut-script-002' || item.title.includes('CapCut')) {
    return {
      id: 'verdict-capcut-script',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'video-editing-ai',
      journey_title: 'Video Editing AI',
      new_node_name: 'Automated Rough Cuts & Transcription',
      new_node_id: 'vid-2',
      insert_after_names: ['AI Scripting & Retention Hooks'],
      insert_after_node_ids: ['vid-1'],
      reasoning:
        'CapCut AI auto-beat sync and script-to-timeline cuts 3-hour edits to 5 minutes. Added to your Video Editing AI roadmap.',
      confidence: 0.94,
    };
  }

  if (item.id === 'news-elevenlabs-voice-003' || item.title.includes('ElevenLabs')) {
    return {
      id: 'verdict-elevenlabs-voice',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'video-editing-ai',
      journey_title: 'Video Editing AI',
      new_node_name: 'AI Voiceovers & Audio Restoration',
      new_node_id: 'vid-3',
      insert_after_names: ['AI Scripting & Retention Hooks'],
      insert_after_node_ids: ['vid-1'],
      reasoning:
        'ElevenLabs expressive voice cloning and auto-audio remastering eliminates costly studio retakes. Injected into your Video Editing AI roadmap.',
      confidence: 0.95,
    };
  }

  if (item.id === 'news-topaz-upscale-004' || item.title.includes('Topaz')) {
    return {
      id: 'verdict-topaz-upscale',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'video-editing-ai',
      journey_title: 'Video Editing AI',
      new_node_name: 'AI Upscaling & Object Masking',
      new_node_id: 'vid-5',
      insert_after_names: ['Generative AI B-Roll & Visuals'],
      insert_after_node_ids: ['vid-4'],
      reasoning:
        'Topaz Video AI 5.0 brings real-time neural face reconstruction and 4K upscaling. Added to your Video Editing AI roadmap.',
      confidence: 0.93,
    };
  }

  // 2. GRAPHIC DESIGN AI VERDICTS
  if (item.id === 'news-recraft-vector-005' || item.title.includes('Recraft')) {
    return {
      id: 'verdict-recraft-vector',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'graphic-design-ai',
      journey_title: 'Graphic Design AI',
      new_node_name: 'Vector & Brand Icon Synthesis',
      new_node_id: 'des-3',
      insert_after_names: ['Prompt Crafting for Visual Styles'],
      insert_after_node_ids: ['des-1'],
      reasoning:
        'Recraft v3 produces editable SVG vectors and brand icons directly for Figma and Illustrator. Injected into your Graphic Design AI roadmap.',
      confidence: 0.97,
    };
  }

  if (item.id === 'news-midjourney-cref-006' || item.title.includes('Midjourney')) {
    return {
      id: 'verdict-midjourney-cref',
      news_item_id: item.id,
      verdict: 'override',
      journey_id: 'graphic-design-ai',
      journey_title: 'Graphic Design AI',
      target_node_name: 'Single-Prompt Visual Art',
      target_node_id: 'des-2',
      new_node_name: 'Consistent Characters & Product Mockups',
      new_node_id: 'des-4',
      reasoning:
        'Midjourney unified --cref and --sref supersedes prompt-and-pray generation with multi-asset character and brand style consistency.',
      confidence: 0.96,
    };
  }

  if (item.id === 'news-adobe-firefly-007' || item.title.includes('Firefly') || item.title.includes('Photoshop')) {
    return {
      id: 'verdict-adobe-firefly',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'graphic-design-ai',
      journey_title: 'Graphic Design AI',
      new_node_name: 'Generative Fill & Photo Retouching',
      new_node_id: 'des-5',
      insert_after_names: ['Consistent Characters & Product Mockups'],
      insert_after_node_ids: ['des-4'],
      reasoning:
        'Adobe Firefly Image 3 in Photoshop enables perspective-aware generative expand and fill for commercial campaigns. Injected into Graphic Design.',
      confidence: 0.94,
    };
  }

  if (item.id === 'news-magnific-upscale-008' || item.title.includes('Magnific')) {
    return {
      id: 'verdict-magnific-upscale',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'graphic-design-ai',
      journey_title: 'Graphic Design AI',
      new_node_name: 'Commercial Asset Packaging & Delivery',
      new_node_id: 'des-6',
      insert_after_names: ['Generative Fill & Photo Retouching'],
      insert_after_node_ids: ['des-5'],
      reasoning:
        'Magnific AI enables 16K ultra-high resolution upscaling for commercial 300 DPI print delivery. Added to Graphic Design roadmap.',
      confidence: 0.92,
    };
  }

  // 3. AI CODE EDITORS VERDICTS
  if (item.id === 'news-claude-code-010' || item.title.includes('Claude Code')) {
    return {
      id: 'verdict-claude-code',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'ai-code-editors',
      journey_title: 'AI Code Editors',
      new_node_name: 'Multi-File Composer & Terminal Agents',
      new_node_id: 'code-3',
      insert_after_names: ['Context Window Hygiene & .cursorrules'],
      insert_after_node_ids: ['code-2'],
      reasoning:
        'Anthropic Claude Code introduces terminal-native agentic programming across repositories. Injected into your AI Code Editors roadmap.',
      confidence: 0.95,
    };
  }

  if (item.id === 'news-cursor-override-015' || item.title.includes('Cursor')) {
    return {
      id: 'verdict-cursor-override',
      news_item_id: item.id,
      verdict: 'override',
      journey_id: 'ai-code-editors',
      journey_title: 'AI Code Editors',
      target_node_name: 'GitHub Copilot Inline Autocomplete',
      target_node_id: 'code-1',
      new_node_name: 'Multi-File Composer & Terminal Agents',
      new_node_id: 'code-3',
      reasoning:
        'Cursor Composer supersedes single-line tab completion with whole-repository agentic edits. Your prior completion history is preserved.',
      confidence: 0.95,
    };
  }

  if (item.id === 'news-v0-013' || item.title.includes('v0')) {
    return {
      id: 'verdict-v0-injection',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'ai-code-editors',
      journey_title: 'AI Code Editors',
      new_node_name: 'Generative UI & Full-Stack Prototyping',
      new_node_id: 'code-4',
      insert_after_names: ['Multi-File Composer & Terminal Agents'],
      insert_after_node_ids: ['code-3'],
      reasoning:
        'v0 enables instant Tailwind + React component generation from natural language prompts. Injected into your AI Code Editors roadmap.',
      confidence: 0.93,
    };
  }

  if (item.id === 'news-supermaven-014' || item.title.includes('Supermaven')) {
    return {
      id: 'verdict-supermaven',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'ai-code-editors',
      journey_title: 'AI Code Editors',
      new_node_name: 'AI Autocomplete & Inline Completion',
      new_node_id: 'code-1',
      insert_after_names: ['Editor Setup'],
      reasoning:
        'Supermaven sub-50ms latency completion engine with 300k token context window added to your editor toolchain.',
      confidence: 0.91,
    };
  }

  // 4. AI CONTENT & WRITING VERDICTS
  if (item.id === 'news-perplexity-search-016' || item.title.includes('Perplexity')) {
    return {
      id: 'verdict-perplexity-search',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'ai-content-writing',
      journey_title: 'AI Content & Writing',
      new_node_name: 'Deep Research & Verified Sourcing',
      new_node_id: 'write-1',
      insert_after_names: ['Foundations'],
      reasoning:
        'Perplexity Pro multi-step query chaining and verified academic citations eliminates search hallucinations. Added to Writing roadmap.',
      confidence: 0.94,
    };
  }

  if (item.id === 'news-claude-writing-017' || (item.title.includes('Claude') && item.title.includes('Authors'))) {
    return {
      id: 'verdict-claude-writing',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'ai-content-writing',
      journey_title: 'AI Content & Writing',
      new_node_name: 'Brand Voice & Style Guide Calibration',
      new_node_id: 'write-2',
      insert_after_names: ['Deep Research & Verified Sourcing'],
      insert_after_node_ids: ['write-1'],
      reasoning:
        'Claude 3.5 Projects and style guide rules eliminate corporate AI jargon and lock in your personal writing voice. Injected into Writing.',
      confidence: 0.94,
    };
  }

  if (item.id === 'news-notebooklm-audio-018' || item.title.includes('NotebookLM')) {
    return {
      id: 'verdict-notebooklm-audio',
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: 'ai-content-writing',
      journey_title: 'AI Content & Writing',
      new_node_name: 'Long-Form Drafting & Document Synthesis',
      new_node_id: 'write-3',
      insert_after_names: ['Brand Voice & Style Guide Calibration'],
      insert_after_node_ids: ['write-2'],
      reasoning:
        'NotebookLM generates grounded conversational audio and synthesizes 100-page document sets with zero hallucinations. Injected into Writing.',
      confidence: 0.93,
    };
  }

  // Minor or routine patches (Impact <= 4)
  if (item.impact_score <= 4) {
    const jId = item.journey_id || resolveJourneyId(null, item.tags, item.title);
    return {
      id: 'verdict-sim-' + item.id,
      news_item_id: item.id,
      verdict: 'shield',
      journey_id: jId,
      journey_title: SKILL_JOURNEYS.find((j) => j.id === jId)?.title || item.journey_title,
      reasoning:
        item.impact_rationale ||
        'No changes to your roadmap. This update is minor or does not alter your core learning pathway.',
      confidence: 0.96,
    };
  }

  // Major / breakthrough advancements default to injection if not explicitly matched
  if (item.impact_score >= 7) {
    const jId = item.journey_id || resolveJourneyId(null, item.tags, item.title);
    const jObj = SKILL_JOURNEYS.find((j) => j.id === jId);
    return {
      id: 'verdict-sim-' + item.id,
      news_item_id: item.id,
      verdict: 'injection',
      journey_id: jId,
      journey_title: jObj?.title || 'AI Skill Roadmap',
      new_node_name: item.title.split(':')[0].replace(/Launches|Releases|Introduces|Adds|Unveils|Beats/i, '').trim(),
      new_node_id: `inj-${item.id}`,
      insert_after_names: ['Foundational Milestones'],
      reasoning:
        item.impact_rationale ||
        `High-impact (${item.impact_score}/10) advancement evaluated deterministically and approved for roadmap injection.`,
      confidence: 0.93,
    };
  }

  const defaultJId = item.journey_id || resolveJourneyId(null, item.tags, item.title);
  return {
    id: 'verdict-sim-' + item.id,
    news_item_id: item.id,
    verdict: 'shield',
    journey_id: defaultJId,
    journey_title: SKILL_JOURNEYS.find((j) => j.id === defaultJId)?.title || item.journey_title,
    reasoning:
      item.impact_rationale ||
      'No changes needed; your current skill roadmap already accounts for this advancement.',
    confidence: 0.9,
  };
}
