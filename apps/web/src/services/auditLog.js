// Reports events the database cannot see by itself (sign-in, sign-out, export, import, security changes) to the audit history. Kept tiny and free of other
// imports so the sign-in code can use it without pulling in the rest of the app. Never throws: logging must not break the action it describes.
import { supabase } from '@/lib/supabase'

/** @param action one of: import export login logout permission config security   @param meta a small, credential-free object */
export async function logAudit(action, entity, summary = '', meta = {}) {
  try {
    if (!supabase) return
    await supabase.rpc('log_audit_event', { p_action: action, p_entity: entity, p_summary: summary, p_meta: meta })
  } catch {
    /* best effort */
  }
}
