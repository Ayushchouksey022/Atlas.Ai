import type { Roadmap, UserNode } from '@repo/schemas';
import {
  EVAL_DOMAIN_ID,
  MOBILE_DOMAIN_ID,
  EVAL_CANONICAL_NODES,
  EVAL_CANONICAL_EDGES,
} from './canonical-graph';

export interface EvalUserProfileFixture {
  id: string;
  fixture_name: string;
  domain_id: string;
  experience: Record<string, number | string>;
  roadmap: Roadmap;
}

function createRoadmap(
  userId: string,
  domainId: string,
  userNodes: Array<{ node_id: string; status: UserNode['status'] }>,
): Roadmap {
  const nodeIds = new Set(userNodes.map((u) => u.node_id));
  const fullUserNodes: UserNode[] = userNodes.map((u, i) => ({
    id: `un-${userId}-${i}`,
    user_id: userId,
    node_id: u.node_id,
    status: u.status,
    origin: 'baseline',
    fast_track: false,
    replaced_node_id: null,
    version: 1,
    completed_at: u.status === 'completed' ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  return {
    user_id: userId,
    domain_id: domainId,
    nodes: EVAL_CANONICAL_NODES.filter((n) => nodeIds.has(n.id)),
    edges: EVAL_CANONICAL_EDGES.filter(
      (e) => nodeIds.has(e.from_node) && nodeIds.has(e.to_node),
    ),
    user_nodes: fullUserNodes,
  };
}

export const USER_PROFILE_FIXTURES: Record<string, EvalUserProfileFixture> = {
  // 1. Senior JS developer who uses GitHub Copilot
  'senior-js-copilot-user': {
    id: 'user-senior-copilot-001',
    fixture_name: 'senior-js-copilot-user',
    domain_id: EVAL_DOMAIN_ID,
    experience: {
      languages: 3,
      'ai-assistants': 2,
      'version-control': 3,
    },
    roadmap: createRoadmap('user-senior-copilot-001', EVAL_DOMAIN_ID, [
      { node_id: 'node-git-basics', status: 'completed' },
      { node_id: 'node-terminal-basics', status: 'completed' },
      { node_id: 'node-javascript-basics', status: 'completed' },
      { node_id: 'node-typescript-basics', status: 'completed' },
      { node_id: 'node-github-copilot', status: 'completed' },
    ]),
  },

  // 2. Fullstack Web Developer using Prettier and Git
  'fullstack-web-dev': {
    id: 'user-fullstack-dev-002',
    fixture_name: 'fullstack-web-dev',
    domain_id: EVAL_DOMAIN_ID,
    experience: {
      languages: 2,
      tooling: 2,
      'version-control': 2,
    },
    roadmap: createRoadmap('user-fullstack-dev-002', EVAL_DOMAIN_ID, [
      { node_id: 'node-git-basics', status: 'completed' },
      { node_id: 'node-javascript-basics', status: 'completed' },
      { node_id: 'node-typescript-basics', status: 'completed' },
      { node_id: 'node-prettier', status: 'completed' },
    ]),
  },

  // 3. Terminal Power User using Aider pair-programming
  'terminal-power-user': {
    id: 'user-terminal-power-003',
    fixture_name: 'terminal-power-user',
    domain_id: EVAL_DOMAIN_ID,
    experience: {
      'core-workflow': 3,
      'ai-assistants': 2,
      'version-control': 3,
    },
    roadmap: createRoadmap('user-terminal-power-003', EVAL_DOMAIN_ID, [
      { node_id: 'node-git-basics', status: 'completed' },
      { node_id: 'node-terminal-basics', status: 'completed' },
      { node_id: 'node-aider', status: 'completed' },
    ]),
  },

  // 4. Codebase refactoring developer using Ripgrep
  'search-refactor-dev': {
    id: 'user-refactor-dev-004',
    fixture_name: 'search-refactor-dev',
    domain_id: EVAL_DOMAIN_ID,
    experience: {
      tooling: 3,
      'version-control': 2,
    },
    roadmap: createRoadmap('user-refactor-dev-004', EVAL_DOMAIN_ID, [
      { node_id: 'node-git-basics', status: 'completed' },
      { node_id: 'node-ripgrep', status: 'completed' },
    ]),
  },

  // 5. Junior Frontend Developer learning basic React
  'junior-frontend-dev': {
    id: 'user-junior-frontend-005',
    fixture_name: 'junior-frontend-dev',
    domain_id: EVAL_DOMAIN_ID,
    experience: {
      languages: 1,
      'version-control': 1,
    },
    roadmap: createRoadmap('user-junior-frontend-005', EVAL_DOMAIN_ID, [
      { node_id: 'node-git-basics', status: 'completed' },
      { node_id: 'node-javascript-basics', status: 'completed' },
      { node_id: 'node-typescript-basics', status: 'in_progress' },
    ]),
  },

  // 6. Mobile iOS Developer (Different domain)
  'mobile-ios-dev': {
    id: 'user-mobile-ios-006',
    fixture_name: 'mobile-ios-dev',
    domain_id: MOBILE_DOMAIN_ID,
    experience: {
      mobile: 3,
    },
    roadmap: createRoadmap('user-mobile-ios-006', MOBILE_DOMAIN_ID, [
      { node_id: 'node-swiftdata-ios', status: 'completed' },
    ]),
  },
};
