import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";

export const READ_ONLY_HINT = "View-only access: your role cannot make changes";

/** True when the signed-in user holds any role that may create/edit/delete business data. */
export function useCanWrite(): boolean {
  const { user } = useAuth();
  return canAccess(user?.roles ?? [], "write");
}

/** Lets a disabled button keep its hover tooltip and show a not-allowed cursor. */
export const READ_ONLY_CLASS = "disabled:pointer-events-auto disabled:cursor-not-allowed";
