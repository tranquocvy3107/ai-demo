/**
 * Dynamic prompt builder for the AI agent.
 * Instead of hardcoding TOOL_INSTRUCTIONS, we now rely entirely on the System Config
 * (injected via RAG) to inform the AI about available tools and workflows.
 * This makes the system scalable and easy to manage from the UI.
 */

const BASE_ROLE = `You are an AI research assistant specialized in domain analysis, affiliate program research, and data gathering.
Your goal is to investigate domains, find affiliate programs, pricing plans, commission structures, and evaluate their potential.

You are thorough, systematic, and never invent information — you only report facts gathered from real sources.
`;

/**
 * Build the complete system prompt for the research agent.
 */
export function buildSystemPrompt(params: {
  domain: string;
  goal: string;
  ragContext?: string;
  previousMemory?: string[]; // Summarized past memory
}): string {
  const { domain, goal, ragContext, previousMemory } = params;

  let prompt = `${BASE_ROLE}\n\n`;

  // 1. Tool Descriptions & Workflows are now dynamically loaded from System Config (RAG)
  if (ragContext && ragContext.trim().length > 0) {
    prompt += `## Instructions & Knowledge Base (System Config)

The following rules, workflows, and tool descriptions have been provided by the system configuration. 
You MUST read them carefully and follow their guidelines strictly to accomplish your task:

${ragContext}
\n`;
  } else {
    prompt += `## Instructions\n\nNo specific system instructions provided. Please use your available tools logically to achieve the user's goal.\n\n`;
  }

  // 2. Load continuous memory summary
  if (previousMemory && previousMemory.length > 0) {
    prompt += `## Previous Memory (Past Actions)

Here is a summary of what you have done so far in previous steps/calls. 
Use this context to continue your work. Do NOT repeat actions you have already completed successfully.

${previousMemory.map((mem, idx) => `Step ${idx + 1}: ${mem}`).join('\n')}
\n`;
  }

  // 3. Current Task execution
  prompt += `## Current Task

- **Target Domain**: ${domain}
- **Goal**: ${goal}

## CRITICAL RULES FOR TOOL USAGE:
1. **NO PARALLEL SCRAPING**: You MUST NOT call the \`web_scraper\` tool multiple times in parallel.
2. **SMART SPEED MODE**: Keep \`web_scraper\` sequential, but for non-scraping tools (\`read_data\`, \`save_data\`, \`web_search\`) you can combine efficient steps to reduce total runtime.
3. **AVOID REDUNDANCY**: Do not scrape near-duplicate pages unless the first page is clearly insufficient.

Please proceed sequentially and systematically with the next step of your research.`;

  return prompt;
}

/**
 * Legacy export for backward compatibility
 */
export const PROMPTS = {
  DOMAIN_RESEARCH: BASE_ROLE,
};
