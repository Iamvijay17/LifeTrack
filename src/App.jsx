import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ConfirmProvider } from '@/components/shared/Confirm'
import { AppShell } from '@/components/layout/AppShell'
import { FullScreenLoader, InitialAppLoader } from '@/components/loaders'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/AuthPages'

const page = (loader) => lazy(loader)
const Overview = page(() => import('@/pages/OverviewPage'))
const Planner = page(() => import('@/pages/PlannerPage'))
const Learning = page(() => import('@/pages/LearningPage'))
const Jobs = page(() => import('@/pages/JobsPage'))
const Fitness = page(() => import('@/pages/FitnessPage'))
const Health = page(() => import('@/pages/HealthPage'))
const Finance = page(() => import('@/pages/FinancePage'))
const Habits = page(() => import('@/pages/HabitsPage'))
const Analytics = page(() => import('@/pages/AnalyticsPage'))
const Focus = page(() => import('@/pages/FocusPage'))
const Notes = page(() => import('@/pages/NotesPage'))
const Goals = page(() => import('@/pages/GoalsPage'))
const Reports = page(() => import('@/pages/ReportsPage'))
const Notifications = page(() => import('@/pages/NotificationsPage'))
const ExportPage = page(() => import('@/pages/ExportPage'))
const Settings = page(() => import('@/pages/SettingsPage'))

function Protected({ children }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <InitialAppLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Suspense fallback={<FullScreenLoader message="Syncing your progress..." />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              element={
                <Protected>
                  <AppShell />
                </Protected>
              }
            >
              <Route index element={<Overview />} />
              <Route path="planner" element={<Planner />} />
              <Route path="learning" element={<Learning />} />
              <Route path="jobs" element={<Jobs />} />
              <Route path="fitness" element={<Fitness />} />
              <Route path="health" element={<Health />} />
              <Route path="finance" element={<Finance />} />
              <Route path="habits" element={<Habits />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="focus" element={<Focus />} />
              <Route path="notes" element={<Notes />} />
              <Route path="goals" element={<Goals />} />
              <Route path="reports" element={<Reports />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="export" element={<ExportPage />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster
          theme="system"
          position="top-center"
          toastOptions={{ classNames: { toast: '!bg-card !text-foreground !border-border' } }}
        />
      </ConfirmProvider>
    </AuthProvider>
  )
}
