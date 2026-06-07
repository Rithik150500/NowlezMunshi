/**
 * Role-based authorization (RBAC) for firm-owned actions (docs/auth.md, ADR-0019). A user's Role
 * gates what they may do within their firm: the **principal** (firm owner) can do everything; an
 * **associate** (advocate) does the day-to-day plus client outreach; a **clerk** (the office munshi)
 * handles the legwork — reading and routine data entry — but not external client comms or record
 * deletion. The policy is a pure, hierarchical table, so it is trivially testable and adjustable; the
 * server applies it as a route guard, and any front-end can read the same `can` to hide what a role
 * may not do.
 */
import type { Role } from "@nowlez/contracts";

/** A capability a route can require. The roles form a ladder: clerk ⊂ associate ⊂ principal. */
export type Permission = "read" | "write" | "notify" | "delete";

/** Role → the permissions it holds. Keep this the single source of truth for the ladder. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  clerk: ["read", "write"],
  associate: ["read", "write", "notify"],
  principal: ["read", "write", "notify", "delete"],
};

/** Whether a role may perform an action requiring `permission`. */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
