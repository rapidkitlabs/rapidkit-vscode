import type { WorkspaceGraphProjection } from '@workspai-contracts/workspaceGraphProjection';

/** Preserve the CLI's project lens without leaking unrelated project-owned nodes. */
export function workspaceGraphProjectScopeIds(
  graph: WorkspaceGraphProjection,
  projectId: string
): Set<string> {
  const owned = new Set(
    graph.entities
      .filter(
        (entity) =>
          entity.projectId === projectId ||
          (entity.kind === 'project' &&
            (entity.id === projectId ||
              entity.label === projectId ||
              entity.id.endsWith(`:${projectId}`)))
      )
      .map((entity) => entity.id)
  );
  const entityById = new Map(graph.entities.map((entity) => [entity.id, entity]));
  const scoped = new Set(owned);
  for (const relation of graph.relations) {
    const counterpart = owned.has(relation.from)
      ? relation.to
      : owned.has(relation.to)
        ? relation.from
        : null;
    if (!counterpart) {
      continue;
    }
    const entity = entityById.get(counterpart);
    if (entity && (!entity.projectId || entity.projectId === projectId)) {
      scoped.add(counterpart);
    }
  }
  return scoped;
}
