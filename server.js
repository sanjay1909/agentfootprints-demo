const express = require('express');
const path = require('path');

// ── Require agentFootprints from dist ──
const AFPROOT = '/tmp/agentFootprints';
const ADAPTERS_ROOT = '/tmp/agent-footprint-adapters';

const { AgentBuilder } = require(`${AFPROOT}/dist/builder/AgentBuilder`);
const { AgentExecutor } = require(`${AFPROOT}/dist/executor/AgentExecutor`);
const { ToolRegistry } = require(`${AFPROOT}/dist/tools/ToolRegistry`);
const { LLMRecorder } = require(`${AFPROOT}/dist/recorders/LLMRecorder`);
const { NarrativeRecorder } = require(`${AFPROOT}/node_modules/footprint/dist/scope/recorders/NarrativeRecorder`);
const { MockAdapter } = require(`${AFPROOT}/dist/adapters/mock/MockAdapter`);
const { MockAnthropicAdapter } = require(`${AFPROOT}/dist/adapters/examples/MockAnthropicAdapter`);
const { MockOpenAIAdapter } = require(`${AFPROOT}/dist/adapters/examples/MockOpenAIAdapter`);

// ── Real adapters (Layer 2) ──
const { AnthropicAdapter } = require(`${ADAPTERS_ROOT}/dist/src/anthropic/AnthropicAdapter`);
const { OpenAIAdapter } = require(`${ADAPTERS_ROOT}/dist/src/openai/OpenAIAdapter`);

// ── Server ──
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// Test Route: MockAdapter
// ============================================================================
app.post('/api/test/mock', async (req, res) => {
  try {
    const userMessage = req.body.message || 'Hello!';

    const { flowChart } = MockAdapter([
      { content: 'Hello! I am responding via MockAdapter. This proves the 3-stage adapter subflow works end-to-end.' },
    ]);

    const reg = new ToolRegistry();
    const narrativeRecorder = new NarrativeRecorder({ id: 'mock-test', detail: 'full' });

    const build = AgentBuilder.agent('mock-test-agent', { adapter: flowChart, toolRegistry: reg })
      .systemPrompt('You are a test agent using MockAdapter.')
      .withRecorder(narrativeRecorder)
      .build();

    const executor = new AgentExecutor(build);
    const result = await executor.run(userMessage);
    const narrative = narrativeRecorder.toFlatSentences();

    res.json({
      adapter: 'MockAdapter',
      success: result.success,
      response: result.response,
      iterations: result.iterations,
      durationMs: result.durationMs,
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Test Route: MockAnthropicAdapter (scripted, no real API)
// ============================================================================
app.post('/api/test/mock-anthropic', async (req, res) => {
  try {
    const userMessage = req.body.message || 'Hello Claude!';

    const { flowChart, getCallCount } = MockAnthropicAdapter([
      { content: 'Hello! I am a mock Anthropic adapter. I simulate Claude\'s Messages API format with content blocks and tool_use responses.' },
    ]);

    const reg = new ToolRegistry();
    const narrativeRecorder = new NarrativeRecorder({ id: 'anthropic-test', detail: 'full' });

    const build = AgentBuilder.agent('anthropic-test-agent', { adapter: flowChart, toolRegistry: reg })
      .systemPrompt('You are Claude, responding via MockAnthropicAdapter.')
      .withRecorder(narrativeRecorder)
      .build();

    const executor = new AgentExecutor(build);
    const result = await executor.run(userMessage);
    const narrative = narrativeRecorder.toFlatSentences();

    res.json({
      adapter: 'MockAnthropicAdapter',
      success: result.success,
      response: result.response,
      iterations: result.iterations,
      durationMs: result.durationMs,
      callCount: getCallCount(),
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Test Route: MockOpenAIAdapter (scripted, no real API)
// ============================================================================
app.post('/api/test/mock-openai', async (req, res) => {
  try {
    const userMessage = req.body.message || 'Hello GPT!';

    const { flowChart, getCallCount } = MockOpenAIAdapter([
      { content: 'Hello! I am a mock OpenAI adapter. I simulate the Chat Completions API with choices, finish_reason, and JSON-stringified tool call arguments.' },
    ]);

    const reg = new ToolRegistry();
    const narrativeRecorder = new NarrativeRecorder({ id: 'openai-test', detail: 'full' });

    const build = AgentBuilder.agent('openai-test-agent', { adapter: flowChart, toolRegistry: reg })
      .systemPrompt('You are GPT, responding via MockOpenAIAdapter.')
      .withRecorder(narrativeRecorder)
      .build();

    const executor = new AgentExecutor(build);
    const result = await executor.run(userMessage);
    const narrative = narrativeRecorder.toFlatSentences();

    res.json({
      adapter: 'MockOpenAIAdapter',
      success: result.success,
      response: result.response,
      iterations: result.iterations,
      durationMs: result.durationMs,
      callCount: getCallCount(),
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Test Route: MockAdapter with Tool Calls
// ============================================================================
app.post('/api/test/mock-tools', async (req, res) => {
  try {
    const userMessage = req.body.message || 'What is the weather in Seattle?';

    const { flowChart } = MockAdapter([
      { // Call 1: request tool
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'get_weather', arguments: { city: 'Seattle' } }],
      },
      { // Call 2: final answer
        content: 'The weather in Seattle is 72°F and sunny!',
      },
    ]);

    const reg = new ToolRegistry();
    reg.registerTool({
      id: 'get_weather',
      description: 'Get current weather for a city',
      inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      handler: async (input) => JSON.stringify({ temp: '72°F', condition: 'Sunny', city: input.city }),
    });

    const llmRecorder = new LLMRecorder('tools-test');
    const narrativeRecorder = new NarrativeRecorder({ id: 'tools-test', detail: 'full' });

    const build = AgentBuilder.agent('tools-test-agent', { adapter: flowChart, toolRegistry: reg })
      .systemPrompt('You are a weather assistant. Use the get_weather tool.')
      .useTool('get_weather')
      .withRecorder(llmRecorder)
      .withRecorder(narrativeRecorder)
      .maxLoopIterations(5)
      .build();

    const executor = new AgentExecutor(build);
    const result = await executor.run(userMessage);
    const narrative = narrativeRecorder.toFlatSentences();
    const stats = llmRecorder.getAggregateStats();

    res.json({
      adapter: 'MockAdapter (with tools)',
      success: result.success,
      response: result.response,
      iterations: result.iterations,
      durationMs: result.durationMs,
      recorderStats: stats,
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Test Route: Real AnthropicAdapter (requires ANTHROPIC_API_KEY)
// ============================================================================
app.post('/api/test/anthropic', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'ANTHROPIC_API_KEY not set',
        hint: 'Start server with: ANTHROPIC_API_KEY=sk-ant-... node server.js',
      });
    }

    const userMessage = req.body.message || 'Say hello and tell me what model you are in one sentence.';
    const { flowChart } = AnthropicAdapter({
      apiKey,
      model: req.body.model || 'claude-sonnet-4-20250514',
    });

    const reg = new ToolRegistry();
    const narrativeRecorder = new NarrativeRecorder({ id: 'real-anthropic', detail: 'full' });

    const build = AgentBuilder.agent('real-anthropic-agent', { adapter: flowChart, toolRegistry: reg })
      .systemPrompt('You are a helpful assistant. Be concise.')
      .withRecorder(narrativeRecorder)
      .build();

    const executor = new AgentExecutor(build);
    const result = await executor.run(userMessage);
    const narrative = narrativeRecorder.toFlatSentences();

    res.json({
      adapter: 'AnthropicAdapter (REAL)',
      success: result.success,
      response: result.response,
      iterations: result.iterations,
      durationMs: result.durationMs,
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Test Route: Real OpenAIAdapter (requires OPENAI_API_KEY)
// ============================================================================
app.post('/api/test/openai', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'OPENAI_API_KEY not set',
        hint: 'Start server with: OPENAI_API_KEY=sk-... node server.js',
      });
    }

    const userMessage = req.body.message || 'Say hello and tell me what model you are in one sentence.';
    const { flowChart } = OpenAIAdapter({
      apiKey,
      model: req.body.model || 'gpt-4o',
    });

    const reg = new ToolRegistry();
    const narrativeRecorder = new NarrativeRecorder({ id: 'real-openai', detail: 'full' });

    const build = AgentBuilder.agent('real-openai-agent', { adapter: flowChart, toolRegistry: reg })
      .systemPrompt('You are a helpful assistant. Be concise.')
      .withRecorder(narrativeRecorder)
      .build();

    const executor = new AgentExecutor(build);
    const result = await executor.run(userMessage);
    const narrative = narrativeRecorder.toFlatSentences();

    res.json({
      adapter: 'OpenAIAdapter (REAL)',
      success: result.success,
      response: result.response,
      iterations: result.iterations,
      durationMs: result.durationMs,
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Patterns endpoint — returns build-time + runtime data for narrative demo UI
// ============================================================================
app.get('/api/patterns', async (req, res) => {
  try {
    const results = [];

    // ── 1. ReactAgent pattern (tool-calling loop) ──
    {
      const { flowChart } = MockAdapter([
        { content: '', toolCalls: [{ id: 'tc-1', name: 'get_weather', arguments: { city: 'Seattle' } }] },
        { content: 'The weather in Seattle is 72°F and sunny!' },
      ]);
      const reg = new ToolRegistry();
      reg.registerTool({
        id: 'get_weather',
        description: 'Get current weather for a city',
        inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        handler: async (input) => JSON.stringify({ temp: '72°F', condition: 'Sunny', city: input.city }),
      });
      const llmRec = new LLMRecorder('react-demo');
      const narRec = new NarrativeRecorder({ id: 'react-demo', detail: 'full' });

      const build = AgentBuilder.agent('react-agent', { adapter: flowChart, toolRegistry: reg })
        .systemPrompt('You are a weather assistant. Use the get_weather tool to answer questions.')
        .useTool('get_weather')
        .withRecorder(llmRec)
        .withRecorder(narRec)
        .maxLoopIterations(5)
        .build();

      const executor = new AgentExecutor(build);
      const result = await executor.run('What is the weather in Seattle?');

      results.push({
        name: 'ReactAgent',
        subtitle: 'Tool-calling loop',
        flowShape: 'react',
        description: [
          '1. Initialize — Load LLM adapter and register tools',
          '2. Assemble Prompt — Build system + user messages',
          '3. Call LLM — Send request through adapter subflow (FormatRequest → ExecuteCall → MapResponse)',
          '4. Parse Response — Extract text, tool calls, or error from AdapterResult',
          '5. Route Decider — If tool calls → execute tools and loop; if final → finalize',
          '→ execute-tools: Run tool handlers, append results to messages, loop back to Call LLM',
          '→ finalize: Return final text response to user',
        ].join('\n'),
        stageDescriptions: {
          'Initialize': 'Sets up the adapter FlowChart, tool registry, and recorder chain',
          'Assemble Prompt': 'Combines system prompt, conversation history, and user message into messages array',
          'Call LLM': 'Runs the 3-stage adapter subflow: FormatRequest → ExecuteCall → MapResponse',
          'Parse Response': 'Reads AdapterResult discriminated union (type: final | tools | error)',
          'Route Decider': 'Decision node: if result.type === "tools", loop; if "final", exit',
          'Execute Tools': 'Calls registered tool handlers and collects results for next LLM call',
          'Finalize': 'Extracts final text response and ends the agent loop',
        },
        narrative: narRec.toFlatSentences(),
        result: result.response || '(no result)',
        recorderStats: llmRec.getAggregateStats(),
      });
    }

    // ── 2. SimpleAgent (linear, no tools) ──
    {
      const { flowChart } = MockAdapter([
        { content: 'I am a simple agent. I received your message and responded directly without any tool calls.' },
      ]);
      const reg = new ToolRegistry();
      const narRec = new NarrativeRecorder({ id: 'linear-demo', detail: 'full' });

      const build = AgentBuilder.agent('simple-agent', { adapter: flowChart, toolRegistry: reg })
        .systemPrompt('You are a helpful assistant. Respond directly.')
        .withRecorder(narRec)
        .build();

      const executor = new AgentExecutor(build);
      const result = await executor.run('Tell me about yourself.');

      results.push({
        name: 'SimpleAgent',
        subtitle: 'Linear (no tools)',
        flowShape: 'linear',
        description: [
          '1. Initialize — Load LLM adapter (no tools registered)',
          '2. Assemble Prompt — Build system + user messages',
          '3. Call LLM — Single adapter subflow pass',
          '4. Return Response — Extract final text, no routing needed',
        ].join('\n'),
        stageDescriptions: {
          'Initialize': 'Creates adapter FlowChart with no tool registry entries',
          'Assemble Prompt': 'Combines system prompt and user message',
          'Call LLM': 'Runs FormatRequest → ExecuteCall → MapResponse once',
          'Return Response': 'Takes the AdapterResult.text as final output',
        },
        narrative: narRec.toFlatSentences(),
        result: result.response || '(no result)',
      });
    }

    // ── 3. MockAnthropic format demo ──
    {
      const { flowChart, getCallCount } = MockAnthropicAdapter([
        { content: 'Hello from Claude! I use content blocks with type:"text", separate system param, and tool_use blocks for tool calls.' },
      ]);
      const reg = new ToolRegistry();
      const narRec = new NarrativeRecorder({ id: 'anthropic-demo', detail: 'full' });

      const build = AgentBuilder.agent('anthropic-format', { adapter: flowChart, toolRegistry: reg })
        .systemPrompt('You are Claude. Demonstrate the Anthropic Messages API format.')
        .withRecorder(narRec)
        .build();

      const executor = new AgentExecutor(build);
      const result = await executor.run('Show me Anthropic format.');

      results.push({
        name: 'AnthropicFormat',
        subtitle: 'Messages API shape',
        flowShape: 'linear',
        description: [
          '1. FormatRequest — Extract system message (Anthropic uses separate system param), build content blocks',
          '2. ExecuteCall — Call messages.create() with model, system, messages, max_tokens',
          '3. MapResponse — Parse content[] blocks: text blocks → response text, tool_use blocks → tool calls',
        ].join('\n'),
        stageDescriptions: {
          'FormatRequest': 'Anthropic requires system as separate param, not in messages array. Content blocks use {type:"text", text:...}',
          'ExecuteCall': 'Calls anthropic.messages.create(). Handles rate limits (429), auth (401), overloaded (529)',
          'MapResponse': 'Iterates content[] array, extracts text from text blocks, tool calls from tool_use blocks with input field',
        },
        narrative: narRec.toFlatSentences(),
        result: result.response || '(no result)',
      });
    }

    // ── 4. MockOpenAI format demo ──
    {
      const { flowChart, getCallCount } = MockOpenAIAdapter([
        { content: 'Hello from GPT! I use choices[0].message, finish_reason, and JSON-stringified function arguments in tool_calls.' },
      ]);
      const reg = new ToolRegistry();
      const narRec = new NarrativeRecorder({ id: 'openai-demo', detail: 'full' });

      const build = AgentBuilder.agent('openai-format', { adapter: flowChart, toolRegistry: reg })
        .systemPrompt('You are GPT. Demonstrate the OpenAI Chat Completions format.')
        .withRecorder(narRec)
        .build();

      const executor = new AgentExecutor(build);
      const result = await executor.run('Show me OpenAI format.');

      results.push({
        name: 'OpenAIFormat',
        subtitle: 'Chat Completions shape',
        flowShape: 'linear',
        description: [
          '1. FormatRequest — Build messages array with {role, content}, tools as function definitions',
          '2. ExecuteCall — Call chat.completions.create() with model, messages, tools',
          '3. MapResponse — Read choices[0].message.content + tool_calls[].function.arguments (JSON.parse)',
        ].join('\n'),
        stageDescriptions: {
          'FormatRequest': 'OpenAI keeps system message in messages array as {role:"system"}. Tools use {type:"function", function:{...}} format',
          'ExecuteCall': 'Calls openai.chat.completions.create(). Streaming accumulates tool_calls across chunks by index',
          'MapResponse': 'Reads choices[0].message. Tool args are JSON-stringified strings that need JSON.parse()',
        },
        narrative: narRec.toFlatSentences(),
        result: result.response || '(no result)',
      });
    }

    // ── 5. Adapter Pipeline overview ──
    {
      results.push({
        name: 'AdapterPipeline',
        subtitle: '3-stage subflow',
        flowShape: 'pipeline',
        description: [
          '1. FormatRequest — Convert generic messages + tools into provider-specific request format',
          '2. ExecuteCall — Make the actual HTTP/SDK call to the LLM provider',
          '3. MapResponse — Parse provider response into AdapterResult (final | tools | error)',
        ].join('\n'),
        stageDescriptions: {
          'FormatRequest': 'Reads from ADAPTER_PATHS.messages and ADAPTER_PATHS.toolDescriptions, writes to ADAPTER_PATHS.formattedRequest',
          'ExecuteCall': 'Reads ADAPTER_PATHS.formattedRequest, calls the LLM, writes to ADAPTER_PATHS.rawResponse',
          'MapResponse': 'Reads ADAPTER_PATHS.rawResponse, creates AdapterResult discriminated union, writes to ADAPTER_PATHS.result',
        },
        narrative: [
          'The adapter subflow is a 3-stage FlowChart created by createAdapterSubflow()',
          'Each provider implements these 3 stages differently but the contract is identical',
          'ADAPTER_PATHS defines well-known scope paths for data flow between stages',
          'AdapterResult has three variants: {type:"final"}, {type:"tools"}, {type:"error"}',
        ],
        result: 'FormatRequest → ExecuteCall → MapResponse → AdapterResult { type: "final" | "tools" | "error" }',
      });
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Status endpoint — shows which adapters are available
// ============================================================================
app.get('/api/status', (req, res) => {
  res.json({
    adapters: {
      mock: { available: true, type: 'scripted' },
      mockAnthropic: { available: true, type: 'scripted' },
      mockOpenAI: { available: true, type: 'scripted' },
      mockTools: { available: true, type: 'scripted' },
      anthropic: { available: !!process.env.ANTHROPIC_API_KEY, type: 'real', hint: 'Set ANTHROPIC_API_KEY' },
      openai: { available: !!process.env.OPENAI_API_KEY, type: 'real', hint: 'Set OPENAI_API_KEY' },
    },
  });
});

const PORT = 3847;
app.listen(PORT, () => {
  console.log(`Adapter Test Server running at http://localhost:${PORT}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
});
