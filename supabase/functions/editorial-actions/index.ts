import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateProposedChange,
  wouldCreateCycle,
  type ProposedGraphChangeRecord,
} from '../../../packages/graph/src/index';
import type {
  CanonicalNode,
  CanonicalEdge,
  GoldenSetCase,
} from '@repo/schemas';
import { GoldenSetCaseSchema } from '@repo/schemas';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export interface EditorialActionRequest {
  action:
    | 'list_queues'
    | 'approve_proposed_change'
    | 'reject_proposed_change'
    | 'approve_guide'
    | 'save_canonical_node'
    | 'save_golden_case';
  user_id?: string;
  change_id?: string;
  guide_id?: string;
  node_id?: string;
  reason?: string;
  markdown_content?: string;
  updates?: Partial<CanonicalNode>;
  new_edges?: Array<{ from_node: string; to_node: string; relationship?: string }>;
  new_supersedes?: Array<{ old_node: string; new_node: string }>;
  golden_case?: GoldenSetCase;
  filename?: string;
}

export async function checkIsEditor(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['editor', 'admin']);

    if (error || !data || data.length === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function handleEditorialAction(
  req: Request,
  customClient?: SupabaseClient,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '';

    const supabase =
      customClient ||
      createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

    let payload: EditorialActionRequest = { action: 'list_queues' };
    if (req.method === 'POST') {
      try {
        payload = (await req.json()) as EditorialActionRequest;
      } catch {
        payload = { action: 'list_queues' };
      }
    }

    // Resolve user ID
    let userId = payload.user_id;
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

    if (!userId && authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (!userError && userData?.user) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: missing user identity' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Role Enforcement (PRD Section 11.6: web only, role editor)
    const isEditor = await checkIsEditor(supabase, userId);
    if (!isEditor) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: only users with the editor role can access editorial endpoints',
          code: 'FORBIDDEN_NOT_EDITOR',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 1: list_queues
    // -------------------------------------------------------------------------
    if (payload.action === 'list_queues') {
      // 1. Proposed Graph Changes
      const { data: proposedChanges } = await supabase
        .from('proposed_graph_changes')
        .select('*')
        .order('created_at', { ascending: false });

      // 2. Draft Guides
      const { data: draftGuides } = await supabase
        .from('guides')
        .select('*, canonical_nodes(id, name, slug)')
        .neq('status', 'approved')
        .order('updated_at', { ascending: false });

      // 3. Flagged Items (low-confidence verdicts + failed processing)
      const { data: lowConfidenceVerdicts } = await supabase
        .from('verdicts')
        .select('*, news_items(title, original_url)')
        .lt('confidence', 0.6)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: failedNewsItems } = await supabase
        .from('news_items')
        .select('*')
        .eq('status', 'ingested')
        .not('raw_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: failedUserVerdicts } = await supabase
        .from('user_verdicts')
        .select('*')
        .eq('state', 'failed')
        .order('updated_at', { ascending: false })
        .limit(50);

      return new Response(
        JSON.stringify({
          success: true,
          queues: {
            proposed_changes: proposedChanges || [],
            draft_guides: draftGuides || [],
            flagged_items: {
              low_confidence_verdicts: lowConfidenceVerdicts || [],
              failed_news_items: failedNewsItems || [],
              failed_user_verdicts: failedUserVerdicts || [],
            },
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 2: approve_proposed_change
    // -------------------------------------------------------------------------
    if (payload.action === 'approve_proposed_change') {
      if (!payload.change_id) {
        return new Response(
          JSON.stringify({ error: 'Missing change_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Fetch change
      const { data: changeRow, error: changeErr } = await supabase
        .from('proposed_graph_changes')
        .select('*')
        .eq('id', payload.change_id)
        .single();

      if (changeErr || !changeRow) {
        return new Response(
          JSON.stringify({ error: 'Proposed change not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Fetch current canonical nodes and edges for cycle checking
      const { data: nodesData } = await supabase
        .from('canonical_nodes')
        .select('*');
      const { data: edgesData } = await supabase
        .from('canonical_edges')
        .select('*');

      const currentNodes: CanonicalNode[] = (nodesData || []) as CanonicalNode[];
      const currentEdges: CanonicalEdge[] = (edgesData || []) as CanonicalEdge[];

      // Validate and check cycle
      const changeRecord: ProposedGraphChangeRecord = {
        id: changeRow.id,
        news_item_id: changeRow.news_item_id,
        change_type: changeRow.change_type as ProposedGraphChangeRecord['change_type'],
        payload: changeRow.payload as ProposedGraphChangeRecord['payload'],
        status: changeRow.status as ProposedGraphChangeRecord['status'],
      };

      const validation = validateProposedChange(changeRecord, currentNodes, currentEdges);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: validation.error,
            cycleDetected: validation.cycleDetected,
            message: validation.message,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Apply to Canonical Graph
      if (changeRecord.change_type === 'add_node') {
        const propNode = changeRecord.payload.proposed_node!;
        const domainId =
          (changeRecord.payload.domain_id as string) ||
          currentNodes[0]?.domain_id ||
          '00000000-0000-0000-0000-000000000001';

        const { data: insertedNode, error: insertNodeErr } = await supabase
          .from('canonical_nodes')
          .insert({
            domain_id: domainId,
            slug: propNode.slug,
            name: propNode.name,
            description: propNode.description || null,
            node_type: propNode.node_type || propNode.category || 'tool',
            area: propNode.area,
            level: propNode.level,
            external_url: propNode.external_url || null,
            status: 'approved',
          })
          .select()
          .single();

        if (insertNodeErr) {
          return new Response(
            JSON.stringify({ error: 'Failed to insert canonical node', detail: insertNodeErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // Insert proposed edges
        const proposedEdges = changeRecord.payload.proposed_edges || [];
        for (const pe of proposedEdges) {
          const fromNodeId =
            pe.from_node ||
            (pe.from_slug === propNode.slug
              ? insertedNode.id
              : currentNodes.find((n) => n.slug === pe.from_slug)?.id);
          const toNodeId =
            pe.to_node ||
            (pe.to_slug === propNode.slug
              ? insertedNode.id
              : currentNodes.find((n) => n.slug === pe.to_slug)?.id);

          if (fromNodeId && toNodeId) {
            await supabase.from('canonical_edges').insert({
              from_node: fromNodeId,
              to_node: toNodeId,
            });
          }
        }

        // Insert proposed supersedes
        const supersedesSlugs = changeRecord.payload.supersedes_slugs || [];
        for (const oldSlug of supersedesSlugs) {
          const oldNode = currentNodes.find((n) => n.slug === oldSlug);
          if (oldNode) {
            await supabase.from('node_supersedes').insert({
              old_node: oldNode.id,
              new_node: insertedNode.id,
            });
          }
        }
      } else if (changeRecord.change_type === 'add_edge') {
        const fromId = changeRecord.payload.from_node!;
        const toId = changeRecord.payload.to_node!;

        const { error: edgeErr } = await supabase.from('canonical_edges').insert({
          from_node: fromId,
          to_node: toId,
        });

        if (edgeErr) {
          return new Response(
            JSON.stringify({ error: 'Failed to insert canonical edge', detail: edgeErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      } else if (changeRecord.change_type === 'add_supersedes') {
        const oldId = changeRecord.payload.old_node!;
        const newId = changeRecord.payload.new_node!;

        const { error: supErr } = await supabase.from('node_supersedes').insert({
          old_node: oldId,
          new_node: newId,
        });

        if (supErr) {
          return new Response(
            JSON.stringify({ error: 'Failed to insert supersedes link', detail: supErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }

      // Mark proposed change as approved
      await supabase
        .from('proposed_graph_changes')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', payload.change_id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Proposed change approved and committed to canonical graph.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 3: reject_proposed_change
    // -------------------------------------------------------------------------
    if (payload.action === 'reject_proposed_change') {
      if (!payload.change_id) {
        return new Response(
          JSON.stringify({ error: 'Missing change_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      await supabase
        .from('proposed_graph_changes')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', payload.change_id);

      return new Response(
        JSON.stringify({ success: true, message: 'Proposed change rejected.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 4: approve_guide
    // -------------------------------------------------------------------------
    if (payload.action === 'approve_guide') {
      if (!payload.guide_id) {
        return new Response(
          JSON.stringify({ error: 'Missing guide_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const updateData: Record<string, unknown> = {
        status: 'approved',
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (payload.markdown_content) {
        updateData.markdown = payload.markdown_content;
      }

      const { data: updatedGuide, error: guideErr } = await supabase
        .from('guides')
        .update(updateData)
        .eq('id', payload.guide_id)
        .select()
        .single();

      if (guideErr) {
        return new Response(
          JSON.stringify({ error: 'Failed to approve guide', detail: guideErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Guide approved successfully.',
          guide: updatedGuide,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 5: save_canonical_node (edit canonical node & links)
    // -------------------------------------------------------------------------
    if (payload.action === 'save_canonical_node') {
      if (!payload.node_id) {
        return new Response(
          JSON.stringify({ error: 'Missing node_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Check for cycles if new edges are supplied
      if (payload.new_edges && payload.new_edges.length > 0) {
        const { data: existingEdges } = await supabase
          .from('canonical_edges')
          .select('*');
        const edgesList: CanonicalEdge[] = (existingEdges || []) as CanonicalEdge[];

        for (const ne of payload.new_edges) {
          if (ne.from_node === ne.to_node || wouldCreateCycle(edgesList, ne.from_node, ne.to_node)) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'CYCLE_DETECTED',
                cycleDetected: true,
                message: `Cycle detected: adding edge ${ne.from_node} -> ${ne.to_node} would create a circular dependency.`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          edgesList.push({
            id: `temp-${edgesList.length}`,
            from_node: ne.from_node,
            to_node: ne.to_node,
          });
        }
      }

      // Update node fields
      if (payload.updates) {
        await supabase
          .from('canonical_nodes')
          .update({
            ...payload.updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.node_id);
      }

      // Insert any new edges
      if (payload.new_edges) {
        for (const ne of payload.new_edges) {
          await supabase.from('canonical_edges').insert({
            from_node: ne.from_node,
            to_node: ne.to_node,
          });
        }
      }

      // Insert any new supersedes
      if (payload.new_supersedes) {
        for (const ns of payload.new_supersedes) {
          await supabase.from('node_supersedes').insert({
            old_node: ns.old_node,
            new_node: ns.new_node,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Canonical node updated successfully.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 6: save_golden_case (PRD Appendix B)
    // -------------------------------------------------------------------------
    if (payload.action === 'save_golden_case') {
      if (!payload.golden_case) {
        return new Response(
          JSON.stringify({ error: 'Missing golden_case' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const parseResult = GoldenSetCaseSchema.safeParse(payload.golden_case);
      if (!parseResult.success) {
        return new Response(
          JSON.stringify({
            error: 'Invalid golden-set format',
            detail: parseResult.error.format(),
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const validatedCase = parseResult.data;
      const safeSlug =
        payload.filename ||
        validatedCase.expected_new_node_slug ||
        `case-${Date.now()}`;
      const safeFilename = `${safeSlug.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;

      // Save to /evals/golden/*.json
      try {
        const evalsDir = path.resolve(process.cwd(), 'evals', 'golden');
        if (!fs.existsSync(evalsDir)) {
          fs.mkdirSync(evalsDir, { recursive: true });
        }
        const filePath = path.join(evalsDir, safeFilename);
        fs.writeFileSync(filePath, JSON.stringify(validatedCase, null, 2), 'utf-8');
      } catch (fsErr) {
        // If running in edge runtime without full filesystem access, log warning
        console.warn('Could not write golden case to disk:', fsErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Golden set case saved successfully.',
          case: validatedCase,
          filename: safeFilename,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${payload.action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', detail: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
