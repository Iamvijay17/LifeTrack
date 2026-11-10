import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { isMisconfigured } from '@/lib/backend'
import { ConfigError } from '@/components/shared/ConfigError'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useResolvedTheme } from '@/hooks/useTheme'
import { ConfirmProvider } from '@/components/shared/Confirm'
import { AppShell } from '@/components/layout/AppShell'
import { FullScreenLoader, InitialAppLoader } from '@/components/loaders'
import { MotionProvider } from '@/components/motion/primitives'
import LegalPage from '@/features/legal/LegalPage'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/AuthPages'

const page = (loader) => lazy(loader)
const Overview = page(() => import('@/features/overview/OverviewPage'))
const Planner = page(() => import('@/features/planner/PlannerPage'))
const Learning = page(() => import('@/features/learning/LearningPage'))
const Jobs = page(() => import('@/features/jobs/JobsPage'))
const Fitness = page(() => import('@/features/fitness/FitnessPage'))
const ExerciseDetail = page(() => import('@/features/fitness/catalog/ExerciseDetailPage'))
const Health = page(() => import('@/features/health/HealthPage'))
const Nutrition = page(() => import('@/features/nutrition/NutritionPage'))
const Finance = page(() => import('@/features/finance/FinancePage'))
const Habits = page(() => import('@/features/habits/HabitsPage'))
const Analytics = page(() => import('@/features/analytics/AnalyticsPage'))
const Focus = page(() => import('@/features/focus/FocusPage'))
const Notes = page(() => import('@/features/notes/NotesPage'))
const Goals = page(() => import('@/features/goals/GoalsPage'))
const Reports = page(() => import('@/features/reports/ReportsPage'))
const Notifications = page(() => import('@/features/notifications/NotificationsPage'))
const ExportPage = page(() => import('@/features/export/ExportPage'))
const Help = page(() => import('@/features/help/HelpPage'))
const Settings = page(() => import('@/features/settings/SettingsPage'))

function Protected({ children }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <InitialAppLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

export default function App() {
  const theme = useResolvedTheme()
  if (isMisconfigured) return <ConfigError />
  return (
    <MotionProvider>
      <AuthProvider>
        <ConfirmProvider>
          <Suspense fallback={<FullScreenLoader message="Syncing your progress..." />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/privacy" element={<LegalPage doc="privacy" />} />
              <Route path="/terms" element={<LegalPage doc="terms" />} />
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
                <Route path="fitness/exercises/:id" element={<ExerciseDetail />} />
                <Route path="health" element={<Health />} />
                <Route path="nutrition" element={<Nutrition />} />
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
                <Route path="help" element={<Help />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <Toaster
            theme={theme}
            position="top-center"
            gap={8}
            offset={{ top: 16 }}
            toastOptions={{
              classNames: {
                toast: '!rounded-xl !bg-card !text-foreground !border-border !shadow-overlay !font-sans',
                description: '!text-muted-foreground',
                actionButton: '!rounded-md !bg-primary-solid !text-white',
                success: '[&_[data-icon]]:!text-success',
                error: '[&_[data-icon]]:!text-danger',
              },
            }}
          />
        </ConfirmProvider>
      </AuthProvider>
    </MotionProvider>
  )
}
