// The public API / webhook contract (scopes, resources, events, signing, address checks). The single source is the Edge Functions' shared file, so the
// gateway, the developer documentation in the app and the tests can never disagree about what exists.
export * from '../../../supabase/functions/_shared/platformApi.js'
