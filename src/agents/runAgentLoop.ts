// ─── Shared Claude Tool-Use Agentic Loop ─────────────────────────────────────
// Drives a single agent turn: send messages → handle tool_use → repeat until
// Claude returns end_turn. Fires onAction callbacks for UI updates.

import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeToolDefinition, AgentAction, AgentId } from './types';
import { supabase } from '../lib/supabase';
import { decryptToken } from '../lib/tokenCrypto';

function getClient() {
  return new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  });
}

// SDK message shape for the conversation array
type ApiMessage = Anthropic.MessageParam;

export interface RunAgentLoopOptions {
  agentId:      AgentId;
  model:        string;
  systemPrompt: string;
  history:      ApiMessage[];          // existing conversation history
  userContent:  string;                // new user message to append
  tools:        ClaudeToolDefinition[];
  executeTool:  (name: string, input: Record<string, unknown>) => Promise<unknown>;
  onAction:     (action: Omit<AgentAction, 'id' | 'timestamp'>) => void;
  maxRounds?:   number;
}

/**
 * Runs the agentic loop for one user turn.
 * Returns { text, updatedHistory } so callers can persist history across turns.
 */
export async function runAgentLoop({
  agentId,
  model,
  systemPrompt,
  history,
  userContent,
  tools,
  executeTool,
  onAction,
  maxRounds = 10,
}: RunAgentLoopOptions): Promise<{ text: string; updatedHistory: ApiMessage[] }> {
  // Require a valid Supabase session before executing any agent
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Unauthorized: no active session. Please sign in.');

  // Fetch user profile, decrypt the stored Meta token, inject into system prompt
  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('brand_name, website_url, brand_colors, industry, tone, keywords, meta_access_token, meta_ad_account_id, meta_facebook_page_id, meta_instagram_account_id')
    .eq('id', session.user.id)
    .single();

  const profile = rawProfile
    ? {
        ...rawProfile,
        meta_access_token: rawProfile.meta_access_token
          ? await decryptToken(rawProfile.meta_access_token as string, session.user.id)
          : '',
      }
    : null;

  const enrichedSystemPrompt = profile
    ? `${systemPrompt}\n\n---\n## Active User — Brand Context\n${buildBrandContext(profile)}`
    : systemPrompt;

  // Build the message array for this turn
  const messages: ApiMessage[] = [
    ...history,
    { role: 'user', content: userContent },
  ];

  let rounds = 0;
  let finalText = '';

  while (rounds < maxRounds) {
    rounds++;

    const response = await getClient().messages.create({
      model,
      max_tokens: 4096,
      system:     enrichedSystemPrompt,
      tools:      tools as Anthropic.Tool[],
      messages,
    });

    // Append assistant response to message chain
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // Extract text from response
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        // Notify UI that a tool is being called
        onAction({ agentId, label: formatToolLabel(block.name, block.input as Record<string, unknown>), status: 'pending' });

        try {
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     resultStr,
          });

          onAction({ agentId, label: formatToolLabel(block.name, block.input as Record<string, unknown>), status: 'success', detail: resultStr.slice(0, 120) });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     `Error: ${errMsg}`,
            is_error:    true,
          });
          onAction({ agentId, label: formatToolLabel(block.name, block.input as Record<string, unknown>), status: 'error', detail: errMsg });
        }
      }

      // Append tool results as a user message
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason — treat as end
    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    break;
  }

  // Return the final text and the updated message history (excluding the new user msg we added)
  // We keep the history compact: only preserve the user turn + assistant turn for this round
  const updatedHistory: ApiMessage[] = messages;

  return { text: finalText, updatedHistory };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBrandContext(profile: Record<string, unknown>): string {
  const lines: string[] = [];
  if (profile.brand_name)   lines.push(`- Brand name: ${profile.brand_name}`);
  if (profile.website_url)  lines.push(`- Website: ${profile.website_url}`);
  if (profile.industry)     lines.push(`- Industry: ${profile.industry}`);
  if (profile.tone)         lines.push(`- Tone of voice: ${profile.tone}`);
  if (Array.isArray(profile.keywords) && (profile.keywords as string[]).length > 0)
    lines.push(`- Keywords: ${(profile.keywords as string[]).join(', ')}`);
  const colors = profile.brand_colors as { primary?: string; secondary?: string } | null;
  if (colors?.primary)   lines.push(`- Primary brand color: ${colors.primary}`);
  if (colors?.secondary) lines.push(`- Secondary brand color: ${colors.secondary}`);
  if (profile.meta_ad_account_id)        lines.push(`- Meta Ad Account ID: ${profile.meta_ad_account_id}`);
  if (profile.meta_facebook_page_id)     lines.push(`- Meta Facebook Page ID: ${profile.meta_facebook_page_id}`);
  if (profile.meta_instagram_account_id) lines.push(`- Meta Instagram Account ID: ${profile.meta_instagram_account_id}`);
  if (profile.meta_access_token)         lines.push(`- Meta Access Token: ${profile.meta_access_token}`);
  return lines.join('\n');
}

function formatToolLabel(name: string, input: Record<string, unknown>): string {
  const labelMap: Record<string, string> = {
    generate_image:          'Generating image',
    generate_video:          'Generating video',
    generate_captions:       'Writing captions',
    get_brand_context:       'Loading brand profile',
    fetch_active_ad_sets:    'Fetching active ad sets',
    upload_ad_image:         'Uploading image to Meta',
    create_ad_creative:      'Creating ad creative',
    add_creative_to_ad_set:  'Adding creative to ad set',
    replace_ad_creative:     'Replacing ad creative',
    publish_to_social:       'Publishing to social',
    run_campaign_diagnosis:  'Running campaign diagnosis',
    get_scale_decisions:     'Getting scale decisions',
    get_top_performers:      'Fetching top performers',
    identify_fatigue:        'Identifying creative fatigue',
    ask_analyst:             'Consulting Analyst',
    ask_creative:            'Consulting Creative Studio',
    ask_campaigner:          'Consulting Ads Manager',
    respond_to_user:         'Preparing final response',
  };
  const base = labelMap[name] ?? name.replace(/_/g, ' ');
  const key = Object.keys(input)[0];
  if (key && typeof input[key] === 'string') {
    const val = (input[key] as string).slice(0, 40);
    return `${base}: "${val}"`;
  }
  return base;
}
