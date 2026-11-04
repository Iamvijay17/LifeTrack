import { Redirect } from 'expo-router'

// "/" is the dashboard when signed in; signed out, the app's entry route is sign-in.
export default function AuthIndex() { return <Redirect href="/sign-in" /> }
