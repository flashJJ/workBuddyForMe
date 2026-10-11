/** agentTrace namespace: system-generated trace text for the collaboration/task pipeline. */

export const enAgentTrace = {
  fallback: {
    degradedTitle: '[Degraded dispatch] {goal}',
    degradedBadge: '[Degraded dispatch]',
    plannerBrief:
      'The planner failed to produce a structured subtask; the executor should do its best directly around the user goal.',
    unparsedGoal: 'Unparsed user goal',
    acceptance:
      'Deliver an actionable conclusion around the user goal, and list anything that could not be confirmed under unfinished items',
    autoApproved:
      'The reviewer failed to return a valid verdict twice; auto-approved by the system (without independent review)',
  },
  budget: {
    kind: {
      rounds: 'rounds',
      steps: 'steps',
      tokens: 'token usage',
    },
    exceeded: 'Budget exceeded ({kind})',
    note: '[Budget exceeded] {kind} limit reached; remaining rounds were not executed',
  },
  run: {
    rejected: 'The review verdict terminated the task',
    cancelled: 'Cancelled by user',
    notFound: 'Collaboration run not found: {id}',
  },
  terminal: {
    interrupted: 'Execution interrupted (user stop / connection lost); unfinished',
    maxSteps: 'Execution terminated at the step limit; unfinished',
    breaker: 'Execution ended in failure (target tool circuit breaker tripped)',
    maxFailures: 'Execution ended in failure (consecutive failure limit reached)',
    maxFailuresCause:
      'Execution ended in failure (consecutive failure limit reached; last cause: {cause})',
    modelGaveUp:
      'Execution ended in failure (the model declared it unable to complete; if this is unexpected, check subtask context and tool authorization)',
    noConclusion:
      'No valid conclusion was produced (no final text and no successful tool action; see unfinished items)',
    visionRequired:
      'Screen observation mode requires a vision-capable model; the current executor model has no vision capability',
  },
  step: {
    toolObserve: 'Tool-mode observation',
    screenObserve: 'Observing current screen state',
    retrievalCorrection: 'Mandatory correction: finishing before searching the authorized knowledge base',
    modelDecision: 'Model decision',
    decideFailed: 'Decision failed: {message}',
    toolNotAllowed: 'Tool unavailable or not in the task allowlist: {tool}',
    breakerTripped: 'Tool {tool} circuit breaker tripped; task terminated',
    denied: 'User denied authorization',
    observeFailed: 'Observation failed: screen perception unavailable',
  },
};
