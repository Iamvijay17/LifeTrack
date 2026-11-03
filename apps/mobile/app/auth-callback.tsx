import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../src/lib/supabase'
import { Button, Screen, Txt } from '../src/ui'

/** lifetrack://auth-callback?code=… — completes the PKCE exchange after email confirmation. */
export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>()
  const router = useRouter()
  const [error, setError] = useState('')
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (error_description) { setError(String(error_description)); return }
    if (!code) { router.replace('/'); return }
    supabase!.auth.exchangeCodeForSession(String(code)).then(({ error: e }) => {
      if (e) setError('This link is invalid or has expired. Request a new one.') // success: onAuthStateChange signs in and the guard routes to the app
    })
  }, [code, error_description, router])
  return (
    <Screen>
      {error ? (<><Txt variant="heading">Could not sign in</Txt><Txt muted>{error}</Txt><Button title="Back to sign in" onPress={() => router.replace('/')} /></>) : <Txt muted>Signing you in…</Txt>}
    </Screen>
  )
}
