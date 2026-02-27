const express = require('express');
const path = require('path');

// ── Require agentFootprints from dist ──
const AFPROOT = '/tmp/agentFootprints';
const ADAPTERS_ROOT = '/tmp/agent-footprint-adapters';
const METRIC_ADAPTERS_ROOT = '/tmp/footprint-metric-adapters';

const { AgentBuilder } = require(`${AFPROOT}/dist/builder/AgentBuilder`);
const { AgentExecutor } = require(`${AFPROOT}/dist/executor/AgentExecutor`);
const { ToolRegistry } = require(`${AFPROOT}/dist/tools/ToolRegistry`);
const { LLMRecorder } = require(`${AFPROOT}/dist/recorders/LLMRecorder`);
const { CostRecorder } = require(`${AFPROOT}/dist/recorders/CostRecorder`);
const { NarrativeRecorder } = require(`${AFPROOT}/node_modules/footprint/dist/scope/recorders/NarrativeRecorder`);
const { MetricRecorder } = require(`${AFPROOT}/node_modules/footprint/dist/scope/recorders/MetricRecorder`);
const { DebugRecorder } = require(`${AFPROOT}/node_modules/footprint/dist/scope/recorders/DebugRecorder`);
const { AlarmRecorder } = require(`${AFPROOT}/node_modules/footprint/dist/scope/recorders/AlarmRecorder`);
const { MockAdapter } = require(`${AFPROOT}/dist/adapters/mock/MockAdapter`);
const { MockAnthropicAdapter } = require(`${AFPROOT}/dist/adapters/examples/MockAnthropicAdapter`);
const { MockOpenAIAdapter } = require(`${AFPROOT}/dist/adapters/examples/MockOpenAIAdapter`);

// ── Real adapters (Layer 2) ──
const { AnthropicAdapter } = require(`${ADAPTERS_ROOT}/dist/src/anthropic/AnthropicAdapter`);
const { OpenAIAdapter } = require(`${ADAPTERS_ROOT}/dist/src/openai/OpenAIAdapter`);

// ── Metric Adapters (footprint-metric-adapters) ──
const { MockMetricAdapter } = require(`${METRIC_ADAPTERS_ROOT}/dist/adapters/mock/MockMetricAdapter`);
const { MockCloudWatchAdapter } = require(`${METRIC_ADAPTERS_ROOT}/dist/adapters/cloudwatch/MockCloudWatchAdapter`);
const { MockPrometheusAdapter } = require(`${METRIC_ADAPTERS_ROOT}/dist/adapters/prometheus/MockPrometheusAdapter`);
const { MockDatadogAdapter } = require(`${METRIC_ADAPTERS_ROOT}/dist/adapters/datadog/MockDatadogAdapter`);
const { MetricCollector } = require(`${METRIC_ADAPTERS_ROOT}/dist/collector/MetricCollector`);
const { RingBufferStrategy } = require(`${METRIC_ADAPTERS_ROOT}/dist/strategies/RingBufferStrategy`);
const { TumblingWindowStrategy } = require(`${METRIC_ADAPTERS_ROOT}/dist/strategies/TumblingWindowStrategy`);
const { SlidingWindowStrategy } = require(`${METRIC_ADAPTERS_ROOT}/dist/strategies/SlidingWindowStrategy`);
const { ExecutionTree } = require(`${METRIC_ADAPTERS_ROOT}/dist/tree/ExecutionTree`);
const { TreeNavigator } = require(`${METRIC_ADAPTERS_ROOT}/dist/tree/TreeNavigator`);

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
      // All 6 recorders attached
      const llmRec = new LLMRecorder('react-demo');
      const costRec = new CostRecorder({ id: 'react-demo' });
      const narRec = new NarrativeRecorder({ id: 'react-demo', detail: 'full' });
      const metricRec = new MetricRecorder('react-demo');
      const debugRec = new DebugRecorder({ id: 'react-demo', verbosity: 'verbose', slowStageThresholdMs: 500 });
      const alarmRec = new AlarmRecorder({
        id: 'react-demo',
        rules: [
          { name: 'high-error-rate', metric: 'errorCount', threshold: 3, comparison: 'gte' },
          { name: 'slow-stage', metric: 'stageDuration', threshold: 2000, comparison: 'gt', stageName: 'Call LLM' },
          { name: 'cascade-failure', metric: 'consecutiveErrors', threshold: 2, comparison: 'gte' },
        ],
        onAlarm: (evt) => console.log('[ALARM]', evt.ruleName, 'value:', evt.metricValue),
        onResolve: (evt) => console.log('[RESOLVED]', evt.ruleName),
      });

      const build = AgentBuilder.agent('react-agent', { adapter: flowChart, toolRegistry: reg })
        .systemPrompt('You are a weather assistant. Use the get_weather tool to answer questions.')
        .useTool('get_weather')
        .withRecorder(llmRec)
        .withRecorder(costRec)
        .withRecorder(narRec)
        .withRecorder(metricRec)
        .withRecorder(debugRec)
        .withRecorder(alarmRec)
        .maxLoopIterations(5)
        .build();

      const executor = new AgentExecutor(build);
      const result = await executor.run('What is the weather in Seattle?');

      // Collect all recorder outputs
      const metrics = metricRec.getMetrics();
      const latencyPercentiles = {};
      const allLatencies = metricRec.getAllLatencyPercentiles();
      for (const [stage, lp] of allLatencies) {
        latencyPercentiles[stage] = lp;
      }
      const debugEntries = debugRec.getEntries();
      const slowWarnings = debugRec.getSlowStageWarnings();
      const costAggregate = costRec.getAggregateCosts();
      const alarmSummary = alarmRec.getSummary();

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
        // ── All 6 Recorder outputs ──
        recorders: {
          narrative: {
            label: 'NarrativeRecorder',
            category: 'Audit & Storytelling',
            icon: 'book',
            layer: 0,
            description: 'Human-readable timeline of what happened — every scope read/write as a sentence. Like an audit trail that tells the story of execution.',
            analogy: 'CloudTrail / Audit Logs',
            data: narRec.toFlatSentences(),
            stageData: Object.fromEntries(narRec.toSentences()),
          },
          llm: {
            label: 'LLMRecorder',
            category: 'Token & Latency',
            icon: 'cpu',
            layer: 1,
            description: 'Tracks every LLM call: model name, input/output tokens, latency, streaming mode. The core telemetry for LLM observability.',
            analogy: 'Datadog APM / Request Traces',
            data: llmRec.getAggregateStats(),
            entries: llmRec.getEntries(),
          },
          cost: {
            label: 'CostRecorder',
            category: 'Cost & Budget',
            icon: 'dollar',
            layer: 1,
            description: 'Calculates $ cost per LLM call using a pricing table. Supports budget limits with alert callbacks. Built-in pricing for GPT-4, Claude, o1, etc.',
            analogy: 'AWS Cost Explorer / CloudWatch Billing Alarms',
            data: costAggregate,
            totalCost: costRec.getTotalCost(),
            summary: costRec.toSummary(),
          },
          metric: {
            label: 'MetricRecorder',
            category: 'Performance & Latency Histogram',
            icon: 'gauge',
            layer: 0,
            description: 'Production metrics: read/write/commit/error counts per stage, latency percentiles (p50/p95/p99), execution duration. Lightweight enough for always-on production use.',
            analogy: 'Prometheus / Datadog Metrics + Histograms',
            data: {
              totalReads: metrics.totalReads,
              totalWrites: metrics.totalWrites,
              totalCommits: metrics.totalCommits,
              totalErrors: metrics.totalErrors,
              totalDuration: metrics.totalDuration,
              latencyPercentiles: latencyPercentiles,
              stages: Object.fromEntries(
                Array.from(metrics.stageMetrics || new Map()).map(function(entry) {
                  var name = entry[0], m = entry[1];
                  return [name, {
                    readCount: m.readCount,
                    writeCount: m.writeCount,
                    commitCount: m.commitCount,
                    errorCount: m.errorCount,
                    totalDuration: m.totalDuration,
                    invocationCount: m.invocationCount,
                    latencySamples: m.latencies ? m.latencies.length : 0,
                  }];
                })
              ),
            },
          },
          debug: {
            label: 'DebugRecorder',
            category: 'Debug & Slow Stage Detection',
            icon: 'bug',
            layer: 0,
            description: 'Captures all mutations (writes), errors, and optionally reads with full values. Automatically flags slow stages exceeding a configurable latency threshold.',
            analogy: 'Chrome DevTools / Debug Logs + Slow Query Log',
            data: {
              totalEntries: debugEntries.length,
              slowStageThresholdMs: debugRec.getSlowStageThreshold(),
              slowStageWarnings: slowWarnings.map(function(w) {
                return { stageName: w.stageName, duration: w.duration, threshold: w.threshold, exceededBy: w.exceededBy };
              }),
              errors: debugRec.getErrors().map(function(e) {
                return { stageName: e.stageName, type: e.type, timestamp: e.timestamp, data: e.data };
              }),
              entries: debugEntries.slice(0, 50).map(function(e) {
                return {
                  type: e.type,
                  stageName: e.stageName,
                  timestamp: e.timestamp,
                  path: e.data && e.data.path,
                  key: e.data && e.data.key,
                  value: typeof (e.data && e.data.value) === 'string' ? e.data.value.slice(0, 100) : (e.data && e.data.value),
                };
              }),
            },
          },
          alarm: {
            label: 'AlarmRecorder',
            category: 'Threshold Alarms',
            icon: 'bell',
            layer: 0,
            description: 'Threshold-based alarm system. Configurable rules watch error counts, latency, consecutive failures. Fires callbacks when breached. Auto-resolves when metric returns to normal.',
            analogy: 'CloudWatch Alarms / PagerDuty',
            data: alarmSummary,
            history: alarmRec.getAlarmHistory(),
          },
        },
        // Keep legacy field for backward compat
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

    // ── 6. MetricPipeline overview ──
    {
      results.push({
        name: 'MetricPipeline',
        subtitle: '3-stage metric subflow',
        flowShape: 'pipeline',
        description: [
          '1. CollectMetric — Validate and normalize incoming metric entries from scope recorders',
          '2. ApplyStrategy — Apply window strategy (RingBuffer/Tumbling/Sliding) and compute percentiles',
          '3. ExportMetric — Export aggregated results to backend (CloudWatch/Prometheus/Datadog/Console)',
        ].join('\n'),
        stageDescriptions: {
          'CollectMetric': 'Reads entries from METRIC_PATHS.INPUT.ENTRIES, validates stageName + metric + value, pushes to WindowStrategy',
          'ApplyStrategy': 'Calls strategy.getMetricResult() — computes p50/p95/p99 percentiles, stage breakdowns, error counts',
          'ExportMetric': 'Formats MetricResult for backend: PutMetricData (CW), exposition text (Prometheus), series (Datadog), console.log',
        },
        narrative: [
          'The metric adapter subflow mirrors the LLM adapter: 3-stage FlowChart from createMetricSubflow()',
          'Window strategies are composable SubFlows: swap RingBuffer ↔ Tumbling ↔ Sliding at runtime',
          'MetricCollector recorder bridges scope events (onError, onStageEnd) to metric entries',
          'Each backend adapter exports in its native format: CloudWatch dimensions, Prometheus labels, Datadog tags',
        ],
        result: 'CollectMetric → ApplyStrategy → ExportMetric → MetricExportResult { success, destination, entriesExported }',
      });
    }

    // ── 7. FullWorkflow overview ──
    {
      results.push({
        name: 'FullWorkflow',
        subtitle: 'Complete architecture',
        flowShape: 'pipeline',
        description: [
          '1. AgentBuilder — Define agent with adapter, tools, recorders, system prompt',
          '2. AgentExecutor.run() — Execute the agent loop: Assemble → Call LLM → Parse → Route',
          '3. LLM Adapter SubFlow — FormatRequest → ExecuteCall → MapResponse (Anthropic/OpenAI/Mock)',
          '4. 6 Recorders — Narrative, LLM, Cost, Metric, Debug, Alarm all fire on scope events',
          '5. MetricCollector — Bridges scope events into metric pipeline entries',
          '6. Metric Adapter SubFlow — CollectMetric → ApplyStrategy → ExportMetric (CloudWatch/Prometheus/Datadog)',
          '7. Tree of IDs — ExecutionTree builds LLM-navigable tree from Builder descriptions + Narrative',
        ].join('\n'),
        stageDescriptions: {
          'AgentBuilder': 'DSL: AgentBuilder.agent(name, {adapter, toolRegistry}).systemPrompt(...).useTool(...).withRecorder(...).build()',
          'AgentExecutor.run()': 'Runs the agent loop: Initialize → Assemble Prompt → Call LLM → Parse → Route Decider → Execute Tools / Finalize',
          'LLM Adapter SubFlow': '3-stage FlowChart: FormatRequest → ExecuteCall → MapResponse. Each provider (Anthropic/OpenAI) implements differently',
          '6 Recorders': 'Layer 0: Narrative, Metric, Debug, Alarm. Layer 1: LLM, Cost. All attach to Scope and fire on events',
          'MetricCollector': 'Recorder that converts onStageEnd → latency entries, onError → errorCount entries into WindowStrategy',
          'Metric Adapter SubFlow': '3-stage FlowChart: CollectMetric → ApplyStrategy → ExportMetric. Backends: CloudWatch, Prometheus, Datadog, Console',
          'Tree of IDs': 'ExecutionTree.addStage() + TreeNavigator: getSummary() → drillDown(id) → getChildren(id). LLM-friendly lazy navigation',
        },
        narrative: [
          'The full FootPrint stack has 3 layers: FootPrint (L0), AgentFootPrints (L1), agent-footprint-adapters (L2)',
          'footprint-metric-adapters extends L0 with observability: metric collection + window strategies + Tree of IDs',
          'LLM adapters and Metric adapters share the same pattern: 3-stage FlowChart subflow via factory function',
          'Tree of IDs enables LLMs to explore execution: getSummary() returns IDs+descriptions, drillDown(id) returns full details',
          'Customer: "What happened to my request?" → LLM navigates tree → finds error → explains in natural language',
          'Provider: "Why did this fail?" → LLM drills into error node → shows reads/writes/metrics → root cause analysis',
        ],
        result: 'AgentBuilder → AgentExecutor → LLM Adapter → Recorders → MetricCollector → Metric Adapter → Tree of IDs → LLM Navigation',
      });
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================================
// Metric Adapters endpoint — demonstrates all 4 metric adapters + Tree of IDs
// ============================================================================
app.get('/api/metric-adapters', async (req, res) => {
  try {
    // ── Generate realistic mock metric entries ──
    const stages = ['Initialize', 'Assemble Prompt', 'Call LLM', 'Parse Response', 'Execute Tools', 'Finalize'];
    const now = Date.now();

    function generateEntries() {
      const entries = [];
      // Simulate 3 pipeline runs with varying latencies
      for (let run = 0; run < 3; run++) {
        const baseTime = now - (2 - run) * 10000;
        for (let i = 0; i < stages.length; i++) {
          const stageName = stages[i];
          // Call LLM is slowest (100-800ms), others are fast (5-50ms)
          const isLLM = stageName === 'Call LLM';
          const latency = isLLM
            ? 100 + Math.random() * 700
            : 5 + Math.random() * 45;

          entries.push({
            stageName,
            metric: 'latency',
            value: latency,
            timestamp: baseTime + i * 100,
          });
          entries.push({
            stageName,
            metric: 'stageInvocation',
            value: 1,
            timestamp: baseTime + i * 100,
          });
          // Add a read/write count
          entries.push({
            stageName,
            metric: 'readCount',
            value: 1,
            timestamp: baseTime + i * 100,
          });
          entries.push({
            stageName,
            metric: 'writeCount',
            value: 1,
            timestamp: baseTime + i * 100,
          });
        }
        // Add an error in Execute Tools on run 2
        if (run === 1) {
          entries.push({
            stageName: 'Execute Tools',
            metric: 'errorCount',
            value: 1,
            timestamp: baseTime + 400,
            metadata: { error: 'Tool timeout: get_weather took >5s', operation: 'read' },
          });
        }
      }
      return entries;
    }

    const entries = generateEntries();

    // ── Create all 4 adapters ──
    const adapterResults = {};

    // 1. MockMetricAdapter (in-memory, ringBuffer)
    {
      const adapter = MockMetricAdapter({ windowConfig: { type: 'ringBuffer', maxSize: 500 } });
      const strategy = adapter.getStrategy();
      for (const e of entries) { strategy.push(e); }
      const result = strategy.getMetricResult();
      adapterResults.mock = {
        name: 'MockMetricAdapter',
        destination: 'mock://in-memory',
        strategy: 'Ring Buffer (last 500 entries)',
        icon: 'test',
        color: '#6c8cff',
        description: 'In-memory adapter for testing. Stores all metrics in arrays for assertions.',
        capabilities: { supportsHistograms: true, supportsLabels: true, supportsPush: true },
        result: serializeMetricResult(result),
        exportCount: entries.length,
      };
    }

    // 2. MockCloudWatchAdapter (tumbling window)
    {
      const adapter = MockCloudWatchAdapter({
        namespace: 'FootPrint/AgentPipeline',
        windowConfig: { type: 'tumbling', windowMs: 60000 },
      });
      const strategy = adapter.getStrategy();
      for (const e of entries) { strategy.push(e); }
      const result = strategy.getMetricResult();

      // Build CloudWatch-format output
      const cwData = [];
      const lp = result.latencyPercentiles;
      if (lp.count > 0) {
        cwData.push({
          MetricName: 'PipelineLatency',
          Dimensions: [{ Name: 'Pipeline', Value: 'Overall' }],
          StatisticValues: { SampleCount: lp.count, Sum: +(lp.mean * lp.count).toFixed(1), Minimum: +lp.min.toFixed(1), Maximum: +lp.max.toFixed(1) },
          Unit: 'Milliseconds',
        });
      }
      for (const [stageName, sp] of result.stagePercentiles) {
        cwData.push({
          MetricName: 'StageLatency',
          Dimensions: [{ Name: 'StageName', Value: stageName }],
          StatisticValues: { SampleCount: sp.count, Sum: +(sp.mean * sp.count).toFixed(1), Minimum: +sp.min.toFixed(1), Maximum: +sp.max.toFixed(1) },
          Unit: 'Milliseconds',
        });
      }

      adapterResults.cloudwatch = {
        name: 'MockCloudWatchAdapter',
        destination: 'cloudwatch://FootPrint/AgentPipeline',
        strategy: 'Tumbling Window (60s buckets)',
        icon: 'cloud',
        color: '#ff9900',
        description: 'Simulates AWS CloudWatch PutMetricData. Uses tumbling windows (1-min periods). Formats as Namespace + MetricName + Dimensions.',
        capabilities: { supportsHistograms: true, supportsLabels: true, supportsPush: true },
        result: serializeMetricResult(result),
        exportFormat: {
          type: 'CloudWatch PutMetricData',
          namespace: 'FootPrint/AgentPipeline',
          metricData: cwData,
        },
        exportCount: cwData.length,
      };
    }

    // 3. MockPrometheusAdapter (ringBuffer, pull-based)
    {
      const adapter = MockPrometheusAdapter({
        prefix: 'footprint_pipeline',
        windowConfig: { type: 'ringBuffer', maxSize: 1000 },
      });
      const strategy = adapter.getStrategy();
      for (const e of entries) { strategy.push(e); }
      const result = strategy.getMetricResult();

      // Build Prometheus exposition text
      const promLines = [];
      const lp = result.latencyPercentiles;
      if (lp.count > 0) {
        promLines.push('# HELP footprint_pipeline_latency_milliseconds Pipeline stage latency');
        promLines.push('# TYPE footprint_pipeline_latency_milliseconds summary');
        promLines.push('footprint_pipeline_latency_milliseconds{quantile="0.5"} ' + lp.p50.toFixed(3));
        promLines.push('footprint_pipeline_latency_milliseconds{quantile="0.95"} ' + lp.p95.toFixed(3));
        promLines.push('footprint_pipeline_latency_milliseconds{quantile="0.99"} ' + lp.p99.toFixed(3));
        promLines.push('footprint_pipeline_latency_milliseconds_count ' + lp.count);
      }
      for (const [stageName, sp] of result.stagePercentiles) {
        const safe = stageName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        promLines.push('footprint_pipeline_stage_latency_milliseconds{stage="' + safe + '",quantile="0.5"} ' + sp.p50.toFixed(3));
        promLines.push('footprint_pipeline_stage_latency_milliseconds{stage="' + safe + '",quantile="0.95"} ' + sp.p95.toFixed(3));
        promLines.push('footprint_pipeline_stage_latency_milliseconds{stage="' + safe + '",quantile="0.99"} ' + sp.p99.toFixed(3));
      }
      if (result.totalErrors > 0) {
        promLines.push('# TYPE footprint_pipeline_errors_total counter');
        promLines.push('footprint_pipeline_errors_total ' + result.totalErrors);
      }
      promLines.push('# TYPE footprint_pipeline_invocations_total counter');
      promLines.push('footprint_pipeline_invocations_total ' + result.totalInvocations);

      adapterResults.prometheus = {
        name: 'MockPrometheusAdapter',
        destination: 'prometheus:///metrics',
        strategy: 'Ring Buffer (last 1000 entries)',
        icon: 'fire',
        color: '#e6522c',
        description: 'Simulates Prometheus pull-based metrics. Ring buffer stores latest data. Exports as exposition text format (quantiles, counters).',
        capabilities: { supportsHistograms: true, supportsLabels: true, supportsPush: false },
        result: serializeMetricResult(result),
        exportFormat: {
          type: 'Prometheus Exposition',
          expositionText: promLines.join('\n'),
        },
        exportCount: promLines.filter(l => !l.startsWith('#')).length,
      };
    }

    // 4. MockDatadogAdapter (sliding window)
    {
      const adapter = MockDatadogAdapter({
        prefix: 'footprint.pipeline',
        tags: ['env:demo', 'service:agentfootprints'],
        windowConfig: { type: 'sliding', windowMs: 300000 },
      });
      const strategy = adapter.getStrategy();
      for (const e of entries) { strategy.push(e); }
      const result = strategy.getMetricResult();

      const ddSeries = [];
      const tsNow = Math.floor(Date.now() / 1000);
      const lp = result.latencyPercentiles;
      if (lp.count > 0) {
        ddSeries.push({
          metric: 'footprint.pipeline.latency',
          type: 'distribution',
          points: [{ timestamp: tsNow, value: lp.p50 }, { timestamp: tsNow, value: lp.p95 }, { timestamp: tsNow, value: lp.p99 }],
          tags: ['env:demo', 'service:agentfootprints', 'metric_type:latency'],
        });
        ddSeries.push({
          metric: 'footprint.pipeline.latency.avg',
          type: 'gauge',
          points: [{ timestamp: tsNow, value: +lp.mean.toFixed(1) }],
          tags: ['env:demo', 'service:agentfootprints'],
        });
      }
      for (const [stageName, sp] of result.stagePercentiles) {
        ddSeries.push({
          metric: 'footprint.pipeline.stage.latency',
          type: 'distribution',
          points: [{ timestamp: tsNow, value: +sp.p50.toFixed(1) }, { timestamp: tsNow, value: +sp.p95.toFixed(1) }],
          tags: ['env:demo', 'service:agentfootprints', 'stage:' + stageName.replace(/\s+/g, '_').toLowerCase()],
        });
      }
      if (result.totalErrors > 0) {
        ddSeries.push({
          metric: 'footprint.pipeline.errors',
          type: 'count',
          points: [{ timestamp: tsNow, value: result.totalErrors }],
          tags: ['env:demo', 'service:agentfootprints'],
        });
      }

      adapterResults.datadog = {
        name: 'MockDatadogAdapter',
        destination: 'datadog://api.datadoghq.com/v2/series',
        strategy: 'Sliding Window (last 300s)',
        icon: 'dog',
        color: '#632ca6',
        description: 'Simulates Datadog API series submission. Sliding window tracks last 5 minutes. Tags metrics with key:value pairs.',
        capabilities: { supportsHistograms: true, supportsLabels: true, supportsPush: true },
        result: serializeMetricResult(result),
        exportFormat: {
          type: 'Datadog v2 Series',
          series: ddSeries,
          apiKey: 'mock-dd-api-key-xxx',
        },
        exportCount: ddSeries.length,
      };
    }

    // ── Build Tree of IDs ──
    const tree = new ExecutionTree();
    const stageTimings = {};
    // Group entries by stage and compute timings
    for (const e of entries) {
      if (e.metric === 'latency') {
        if (!stageTimings[e.stageName]) {
          stageTimings[e.stageName] = { total: 0, count: 0 };
        }
        stageTimings[e.stageName].total += e.value;
        stageTimings[e.stageName].count += 1;
      }
    }

    const stageDescriptions = {
      'Initialize': 'Sets up the adapter FlowChart, tool registry, and recorder chain',
      'Assemble Prompt': 'Combines system prompt, conversation history, and user message into messages array',
      'Call LLM': 'Runs the 3-stage adapter subflow: FormatRequest → ExecuteCall → MapResponse',
      'Parse Response': 'Reads AdapterResult discriminated union (type: final | tools | error)',
      'Execute Tools': 'Calls registered tool handlers and collects results for next LLM call',
      'Finalize': 'Extracts final text response and ends the agent loop',
    };

    for (let i = 0; i < stages.length; i++) {
      const stageName = stages[i];
      const timing = stageTimings[stageName];
      const avgDuration = timing ? timing.total / timing.count : 0;
      const hasError = stageName === 'Execute Tools'; // We injected an error here

      tree.addStage({
        id: stageName.toLowerCase().replace(/\s+/g, '-'),
        name: stageName,
        builderDescription: stageDescriptions[stageName] || stageName,
        narrativeSentences: [
          'The pipeline executed ' + stageName + (hasError ? ' with 1 error.' : ' successfully.'),
          'Average latency: ' + avgDuration.toFixed(1) + 'ms across ' + (timing ? timing.count : 0) + ' invocations.',
        ],
        nodeType: stageName === 'Execute Tools' ? 'subflow' : 'stage',
        durationMs: avgDuration,
        hasError: hasError,
        errorMessage: hasError ? 'Tool timeout: get_weather took >5s' : undefined,
      });
    }

    const navigator = new TreeNavigator(tree);
    const treeSummary = navigator.getSummary();
    const errorDrillDown = navigator.drillDown('execute-tools');

    res.json({
      adapters: adapterResults,
      treeOfIds: {
        summary: treeSummary,
        errorDrillDown: errorDrillDown,
        stageCount: tree.getStageCount(),
      },
      meta: {
        totalEntries: entries.length,
        stagesSimulated: stages.length,
        runsSimulated: 3,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// Helper to serialize MetricResult (Maps → Objects)
function serializeMetricResult(result) {
  return {
    latencyPercentiles: result.latencyPercentiles,
    stagePercentiles: Object.fromEntries(result.stagePercentiles),
    totalErrors: result.totalErrors,
    stageErrors: Object.fromEntries(result.stageErrors),
    totalInvocations: result.totalInvocations,
    windowInfo: result.windowInfo,
    computedAt: result.computedAt,
  };
}

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
