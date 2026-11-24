// The database operations the Google functions need, over a service-role Supabase client. Kept out of index.ts so both functions share it and the
// tests can replace it with a fake. Every function takes the user id explicitly: nothing here reads "the current user".
export function googleStore(sb) {
  const must = (r) => {
    if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
    return r.data
  }
  return {
    getToken: async (userId, provider) => must(await sb.from('integration_tokens').select('*').eq('user_id', userId).eq('provider', provider).maybeSingle()),
    saveToken: async (userId, provider, t) => must(await sb.from('integration_tokens').upsert({ user_id: userId, provider, ...t }, { onConflict: 'user_id,provider' })),
    saveAccessToken: async (userId, provider, access_token, access_expires_at) =>
      must(await sb.from('integration_tokens').update({ access_token, access_expires_at }).eq('user_id', userId).eq('provider', provider)),
    deleteToken: async (userId, provider) => must(await sb.from('integration_tokens').delete().eq('user_id', userId).eq('provider', provider)),
    getIntegration: async (userId, provider) => must(await sb.from('integrations').select('*').eq('user_id', userId).eq('provider', provider).maybeSingle()),
    setIntegration: async (userId, provider, patch) =>
      must(await sb.from('integrations').upsert({ user_id: userId, provider, ...patch }, { onConflict: 'user_id,provider' })),
    deleteIntegration: async (userId, provider) => must(await sb.from('integrations').delete().eq('user_id', userId).eq('provider', provider)),
    addEvent: async (userId, provider, kind, message) => must(await sb.from('integration_events').insert({ user_id: userId, provider, kind, message: String(message).slice(0, 300) })),
    getTimezone: async (userId) => (must(await sb.from('user_settings').select('timezone').eq('user_id', userId).maybeSingle()))?.timezone,
    listCalendarEvents: async (userId, from, to) =>
      must(await sb.from('calendar_events').select('*').eq('user_id', userId).gte('starts_at', from).lt('starts_at', to).order('starts_at').limit(2500)),
    insertCalendarEvent: async (userId, row) => must(await sb.from('calendar_events').insert({ user_id: userId, ...row }).select().single()),
    updateCalendarEvent: async (userId, id, patch) => must(await sb.from('calendar_events').update(patch).eq('user_id', userId).eq('id', id)),
  }
}
