export interface RuntimeValueContext {
  projectRoot: string;
  task: Record<string, unknown>;
  steps: Record<string, unknown>;
  input?: Record<string, unknown>;
  step?: Record<string, unknown>;
  state?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
}

const getPath = (root: unknown, path: string): unknown => {
  let current: unknown = root;

  for (const part of path.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (
      typeof current !== "object" ||
      current === null ||
      !(part in current)
    ) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
};

const isReference = (
  value: Record<string, unknown>,
): value is { $from: string } =>
  Object.keys(value).length === 1 &&
  typeof value.$from === "string" &&
  value.$from.trim() !== "";

export function resolveRuntimeValue(
  value: unknown,
  context: RuntimeValueContext,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveRuntimeValue(item, context));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (isReference(record)) {
    const resolved = getPath(context, record.$from);
    if (resolved === undefined) {
      throw new Error(
        `Runtime input reference did not resolve: ${record.$from}`,
      );
    }
    return structuredClone(resolved);
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      resolveRuntimeValue(item, context),
    ]),
  );
}

export function resolveStepInput(
  input: Record<string, unknown>,
  context: RuntimeValueContext,
): Record<string, unknown> {
  const resolved = resolveRuntimeValue(input, context);
  if (
    typeof resolved !== "object" ||
    resolved === null ||
    Array.isArray(resolved)
  ) {
    throw new Error("Resolved step input must be an object.");
  }
  return resolved as Record<string, unknown>;
}
