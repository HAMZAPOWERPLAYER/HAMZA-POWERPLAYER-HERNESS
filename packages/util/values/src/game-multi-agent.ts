/**
 * Multi-agent coordination model.
 *
 * Provides agent role definitions, task assignment, and coordination primitives
 * for multi-agent game development workflows. All helpers are pure: they compute
 * coordination state from caller-supplied input, perform no I/O, and hold no
 * state.
 *
 * @module @deepseek-ai/dsh-util-values/game-multi-agent
 */

/** Agent role in a multi-agent workflow. */
export type AgentRole =
  | 'game-architect'
  | 'gameplay-programmer'
  | 'engine-specialist'
  | 'ui-engineer'
  | 'qa-engineer'
  | 'performance-analyst'
  | 'security-reviewer'
  | 'orchestrator';

/** One agent assignment. */
export interface AgentAssignment {
  /** Stable agent identifier. */
  readonly agentId: string;
  /** Assigned role. */
  readonly role: AgentRole;
  /** Assigned task ids. */
  readonly taskIds: readonly string[];
  /** Current status. */
  readonly status: 'idle' | 'working' | 'blocked' | 'completed' | 'error';
  /** Current task, if any. */
  readonly currentTask: string | null;
}

/** Multi-agent coordination state. */
export interface AgentCoordinationState {
  /** Agent assignments. */
  readonly agents: readonly AgentAssignment[];
  /** File ownership map (file path -> agent id). */
  readonly fileOwnership: readonly { readonly filePath: string; readonly agentId: string }[];
  /** Task assignments (task id -> agent id). */
  readonly taskAssignments: readonly { readonly taskId: string; readonly agentId: string }[];
  /** Pending tasks. */
  readonly pendingTasks: readonly string[];
  /** Completed tasks. */
  readonly completedTasks: readonly string[];
  /** Blocked tasks. */
  readonly blockedTasks: readonly string[];
}

/**
 * Create an agent assignment.
 *
 * @param params - assignment fields, including agent id, role, task ids, and current task.
 * @returns the agent assignment, defaulting status to `idle`.
 */
export function createAgentAssignment(params: {
  readonly agentId: string;
  readonly role: AgentRole;
  readonly taskIds: readonly string[];
  readonly status?: 'idle' | 'working' | 'blocked' | 'completed' | 'error';
  readonly currentTask: string | null;
}): AgentAssignment {
  return {
    agentId: params.agentId,
    role: params.role,
    taskIds: params.taskIds,
    status: params.status ?? 'idle',
    currentTask: params.currentTask ?? null,
  };
}

/**
 * Create a coordination state.
 *
 * @param params - state collections: agents, file ownership, task assignments, and task lists.
 * @returns the coordination state holding the supplied collections.
 */
export function createCoordinationState(params: {
  readonly agents: readonly AgentAssignment[];
  readonly fileOwnership: readonly { readonly filePath: string; readonly agentId: string }[];
  readonly taskAssignments: readonly { readonly taskId: string; readonly agentId: string }[];
  readonly pendingTasks: readonly string[];
  readonly completedTasks: readonly string[];
  readonly blockedTasks: readonly string[];
}): AgentCoordinationState {
  return {
    agents: params.agents,
    fileOwnership: params.fileOwnership,
    taskAssignments: params.taskAssignments,
    pendingTasks: params.pendingTasks,
    completedTasks: params.completedTasks,
    blockedTasks: params.blockedTasks,
  };
}

/**
 * Assign a task to an agent.
 *
 * @param state - coordination state to update.
 * @param agentId - id of the agent to assign the task to.
 * @param taskId - id of the task to assign.
 * @returns a new state with the task assigned to the agent and removed from pending tasks;
 *   throws when the agent id is unknown.
 */
export function assignTask(
  state: AgentCoordinationState,
  agentId: string,
  taskId: string,
): AgentCoordinationState {
  const agentIndex = state.agents.findIndex((a) => a.agentId === agentId);
  if (agentIndex === -1) {
    throw new Error(`unknown agent: ${agentId}`);
  }

  const agent = state.agents[agentIndex]!;
  const newTaskIds = agent.taskIds.includes(taskId)
    ? agent.taskIds
    : [...agent.taskIds, taskId];

  const newAgents = state.agents.map((a, i) =>
    i === agentIndex ? { ...a, taskIds: newTaskIds } : a
  );

  const newTaskAssignments = [
    ...state.taskAssignments.filter((ta) => ta.taskId !== taskId),
    { taskId, agentId },
  ];

  const newPendingTasks = state.pendingTasks.filter((t) => t !== taskId);

  return {
    ...state,
    agents: newAgents,
    taskAssignments: newTaskAssignments,
    pendingTasks: newPendingTasks,
  };
}

/**
 * Complete a task.
 *
 * @param state - coordination state to update.
 * @param taskId - id of the assigned task to complete.
 * @returns a new state recording the task as completed and dropping its assignment;
 *   throws when the task is not assigned.
 */
export function completeTask(
  state: AgentCoordinationState,
  taskId: string,
): AgentCoordinationState {
  const agentIndex = state.taskAssignments.findIndex((ta) => ta.taskId === taskId);
  if (agentIndex === -1) {
    throw new Error(`task ${taskId} is not assigned to any agent`);
  }

  const newCompletedTasks = [...state.completedTasks, taskId];
  const newPendingTasks = state.pendingTasks.filter((t) => t !== taskId);

  const newAgents = state.agents.map((a) => ({
    ...a,
    taskIds: a.taskIds.filter((t) => t !== taskId),
  }));

  const newTaskAssignments = state.taskAssignments.filter((ta) => ta.taskId !== taskId);

  return {
    ...state,
    agents: newAgents,
    taskAssignments: newTaskAssignments,
    pendingTasks: newPendingTasks,
    completedTasks: newCompletedTasks,
  };
}

/**
 * Assign file ownership to an agent.
 *
 * @param state - coordination state to update.
 * @param filePath - path of the file to assign.
 * @param agentId - id of the owning agent.
 * @returns a new state with the file assigned to the agent, replacing any prior owner;
 *   throws when the agent id is unknown.
 */
export function assignFileOwnership(
  state: AgentCoordinationState,
  filePath: string,
  agentId: string,
): AgentCoordinationState {
  const agentExists = state.agents.some((a) => a.agentId === agentId);
  if (!agentExists) {
    throw new Error(`unknown agent: ${agentId}`);
  }

  const newFileOwnership = [
    ...state.fileOwnership.filter((fo) => fo.filePath !== filePath),
    { filePath, agentId },
  ];

  return {
    ...state,
    fileOwnership: newFileOwnership,
  };
}

/**
 * Check for file ownership conflicts.
 *
 * @param state - coordination state to inspect.
 * @returns files owned by more than one agent, sorted by file path.
 */
export function checkFileOwnershipConflicts(
  state: AgentCoordinationState,
): readonly { readonly filePath: string; readonly agentIds: readonly string[] }[] {
  const ownershipByFile = new Map<string, string[]>();
  for (const fo of state.fileOwnership) {
    const existing = ownershipByFile.get(fo.filePath) ?? [];
    ownershipByFile.set(fo.filePath, [...existing, fo.agentId]);
  }

  const conflicts: { readonly filePath: string; readonly agentIds: readonly string[] }[] = [];
  for (const [filePath, agentIds] of ownershipByFile) {
    const uniqueIds = [...new Set(agentIds)];
    if (uniqueIds.length > 1) {
      conflicts.push({ filePath, agentIds: uniqueIds });
    }
  }

  return conflicts.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Get tasks assigned to an agent.
 *
 * @param state - coordination state to inspect.
 * @param agentId - id of the agent to look up.
 * @returns the agent's assigned task ids, or an empty list when the agent is unknown.
 */
export function getAgentTasks(
  state: AgentCoordinationState,
  agentId: string,
): readonly string[] {
  const agent = state.agents.find((a) => a.agentId === agentId);
  if (agent === undefined) return [];
  return agent.taskIds;
}

/**
 * Get agents assigned to a task.
 *
 * @param state - coordination state to inspect.
 * @param taskId - id of the task to look up.
 * @returns the ids of the agents assigned to the task.
 */
export function getTaskAgents(
  state: AgentCoordinationState,
  taskId: string,
): readonly string[] {
  return state.taskAssignments
    .filter((ta) => ta.taskId === taskId)
    .map((ta) => ta.agentId);
}

/**
 * Get agent workload (number of tasks).
 *
 * @param state - coordination state to inspect.
 * @param agentId - id of the agent to measure.
 * @returns the number of tasks assigned to the agent, or 0 when the agent is unknown.
 */
export function getAgentWorkload(
  state: AgentCoordinationState,
  agentId: string,
): number {
  const agent = state.agents.find((a) => a.agentId === agentId);
  return agent === undefined ? 0 : agent.taskIds.length;
}

/**
 * Balance workload across agents.
 *
 * @param state - coordination state to rebalance.
 * @returns a new state with tasks moved from overloaded agents to underloaded agents.
 */
export function balanceWorkload(
  state: AgentCoordinationState,
): AgentCoordinationState {
  const agents = state.agents;
  if (agents.length === 0) return state;

  const totalTasks = agents.reduce((sum, a) => sum + a.taskIds.length, 0);
  const average = totalTasks / agents.length;

  const overloaded = agents.filter((a) => a.taskIds.length > average + 1);
  const underloaded = agents.filter((a) => a.taskIds.length < average - 1);

  if (overloaded.length === 0 || underloaded.length === 0) return state;

  let newAgents = state.agents;
  let newTaskAssignments = [...state.taskAssignments];

  for (const overloadedAgent of overloaded) {
    if (underloaded.length === 0) break;
    const underloadedAgent = underloaded[0]!;

    const taskToMove = overloadedAgent.taskIds[overloadedAgent.taskIds.length - 1];
    if (taskToMove === undefined) continue;

    newAgents = newAgents.map((a) => {
      if (a.agentId === overloadedAgent.agentId) {
        return { ...a, taskIds: a.taskIds.filter((t) => t !== taskToMove) };
      }
      if (a.agentId === underloadedAgent.agentId) {
        return { ...a, taskIds: [...a.taskIds, taskToMove] };
      }
      return a;
    });

    newTaskAssignments = newTaskAssignments.map((ta) => {
      if (ta.taskId === taskToMove) {
        return { ...ta, agentId: underloadedAgent!.agentId };
      }
      return ta;
    });
  }

  return { ...state, agents: newAgents, taskAssignments: newTaskAssignments };
}
