export interface RepositoryAccessDetails {
  permission: string;
  role_name?: string | null;
  roleName?: string | null;
}

export type RepositoryAccess = string | RepositoryAccessDetails;

function normalizeAccessValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function repositoryAccessValues(access: RepositoryAccess): string[] {
  const rawValues = typeof access === "string"
    ? [access]
    : [access.role_name, access.roleName, access.permission];
  const values: string[] = [];
  for (const raw of rawValues) {
    const normalized = normalizeAccessValue(raw);
    if (normalized && !values.includes(normalized)) values.push(normalized);
  }
  return values;
}

export function matchRepositoryAccess(
  access: RepositoryAccess,
  allowed: ReadonlySet<string>
): string | null {
  return repositoryAccessValues(access).find((value) => allowed.has(value)) ?? null;
}

export function hasWriteRepositoryAccess(access: RepositoryAccess): boolean {
  const values = new Set(repositoryAccessValues(access));
  return values.has("admin") || values.has("maintain") || values.has("write") || values.has("push");
}
