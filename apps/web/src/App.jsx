import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { isMisconfigured } from '@/lib/backend'
import { ConfigError } from '@/components/shared/ConfigError'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { FlagGate, FlagsProvider } from '@/hooks/useFlags'
import { useResolvedTheme } from '@/hooks/useTheme'
import { ConfirmProvider } from '@/components/shared/Confirm'
import { PromptProvider } from '@/components/shared/Prompt'
import { FullScreenLoader, InitialAppLoader } from '@/components/loaders'
import { InteractionProvider } from '@/components/interaction/InteractionProvider'
import { MotionProvider } from '@/components/motion/primitives'
import { AppLockGate } from '@/features/security/LockScreen'
import { ModuleGate } from '@/features/security/ModuleUnlock'
import { SecurityProvider } from '@/features/security/SecurityProvider'

const page = (loader) => lazy(loader)
// Signed-out visitors download only the page they land on; the shell (sidebar, command palette, ...) loads once someone is signed in.
const AppShell = page(() => import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })))
const LegalPage = page(() => import('@/features/legal/LegalPage'))
const authPage = (name) => page(() => import('@/features/auth/AuthPages').then((m) => ({ default: m[name] })))
const LoginPage = authPage('LoginPage')
const RegisterPage = authPage('RegisterPage')
const ForgotPasswordPage = authPage('ForgotPasswordPage')
const ResetPasswordPage = authPage('ResetPasswordPage')
const Overview = page(() => import('@/features/overview/OverviewPage'))
const GlobalSearchPage = page(() => import('@/features/search/SearchPage'))
const Planner = page(() => import('@/features/planner/PlannerPage'))
const Calendar = page(() => import('@/features/calendar/CalendarPage'))
const Recovery = page(() => import('@/features/recovery/RecoveryPage'))
const LifeMap = page(() => import('@/features/lifemap/LifeMapPage'))
const Companion = page(() => import('@/features/companion/CompanionPage'))
const Automation = page(() => import('@/features/automation/AutomationPage'))
const AutomationHistory = page(() => import('@/features/automation/HistoryPage'))
const WorkflowEditor = page(() => import('@/features/automation/WorkflowEditor'))
const Learning = page(() => import('@/features/learning/LearningPage'))
const Jobs = page(() => import('@/features/jobs/JobsPage'))
const Fitness = page(() => import('@/features/fitness/FitnessPage'))
const ExerciseDetail = page(() => import('@/features/fitness/catalog/ExerciseDetailPage'))
const Health = page(() => import('@/features/health/HealthPage'))
const Nutrition = page(() => import('@/features/nutrition/NutritionPage'))
const Finance = page(() => import('@/features/finance/FinancePage'))
const Habits = page(() => import('@/features/habits/HabitsPage'))
const Challenges = page(() => import('@/features/challenges/ChallengesPage'))
const Insights = page(() => import('@/features/insights/InsightsPage'))
const Analytics = page(() => import('@/features/analytics/AnalyticsPage'))
const Focus = page(() => import('@/features/focus/FocusPage'))
const Notes = page(() => import('@/features/notes/NotesPage'))
const Goals = page(() => import('@/features/goals/GoalsPage'))
const Reports = page(() => import('@/features/reports/ReportsPage'))
const Notifications = page(() => import('@/features/notifications/NotificationsPage'))
const ExportPage = page(() => import('@/features/export/ExportPage'))
const Help = page(() => import('@/features/help/HelpPage'))
const Settings = page(() => import('@/features/settings/SettingsPage'))
const Integrations = page(() => import('@/features/integrations/IntegrationsPage'))
const Developers = page(() => import('@/features/developers/DevelopersPage'))
const Audit = page(() => import('@/features/audit/AuditPage'))
const SystemHealth = page(() => import('@/features/system/SystemHealthPage'))
const Features = page(() => import('@/features/features/FeaturesPage'))
const Shortcuts = page(() => import('@/features/shortcuts/ShortcutsPage'))
const Security = page(() => import('@/features/security/SecurityPage'))

function Protected({ children }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <InitialAppLoader />
  // Keep the query and hash too: deep links such as /jobs?app=… or /fitness?tab=library should land where they pointed after signing in.
  if (!session) return <Navigate to="/login" replace state={{ from: `${loc.pathname}${loc.search}${loc.hash}` }} />
  // Everything behind the sign-in is mounted only while the server says this session is unlocked (see AppLockGate). The provider lives here, not
  // above the routes: it is only needed once someone is signed in, and as the layout element it stays mounted while they move between pages.
  return (
    <SecurityProvider>
      <AppLockGate>{children}</AppLockGate>
    </SecurityProvider>
  )
}

export default function App() {
  const theme = useResolvedTheme()
  if (isMisconfigured) return <ConfigError />
  return (
    <MotionProvider>
      <InteractionProvider>
        <AuthProvider>
          <FlagsProvider>
            <ConfirmProvider>
              <PromptProvider>
                <Suspense fallback={<FullScreenLoader message="Syncing your progress..." />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/privacy" element={<LegalPage doc="privacy" />} />
                    <Route path="/terms" element={<LegalPage doc="terms" />} />
                    {/* The companion is a small window of its own: signed in and lock-gated like the app, but without the sidebar. */}
                    <Route
                      path="/companion"
                      element={
                        <Protected>
                          <Companion />
                        </Protected>
                      }
                    />
                    <Route
                      element={
                        <Protected>
                          <AppShell />
                        </Protected>
                      }
                    >
                      <Route index element={<Overview />} />
                      <Route path="search" element={<GlobalSearchPage />} />
                      <Route path="planner" element={<Planner />} />
                      <Route path="calendar" element={<Calendar />} />
                      <Route path="recovery" element={<Recovery />} />
                      <Route
                        path="map"
                        element={
                          <FlagGate flag="module.lifemap">
                            <LifeMap />
                          </FlagGate>
                        }
                      />
                      <Route
                        path="automation"
                        element={
                          <FlagGate flag="module.automation">
                            <Automation />
                          </FlagGate>
                        }
                      />
                      <Route path="automation/history" element={<AutomationHistory />} />
                      <Route path="automation/:id" element={<WorkflowEditor />} />
                      <Route path="learning" element={<Learning />} />
                      <Route
                        path="jobs"
                        element={
                          <ModuleGate module="jobs">
                            <Jobs />
                          </ModuleGate>
                        }
                      />
                      <Route
                        path="fitness"
                        element={
                          <ModuleGate module="fitness">
                            <Fitness />
                          </ModuleGate>
                        }
                      />
                      <Route path="fitness/exercises/:id" element={<ExerciseDetail />} />
                      <Route
                        path="health"
                        element={
                          <ModuleGate module="health">
                            <Health />
                          </ModuleGate>
                        }
                      />
                      <Route
                        path="nutrition"
                        element={
                          <ModuleGate module="nutrition">
                            <Nutrition />
                          </ModuleGate>
                        }
                      />
                      <Route
                        path="finance"
                        element={
                          <ModuleGate module="finance">
                            <Finance />
                          </ModuleGate>
                        }
                      />
                      <Route path="habits" element={<Habits />} />
                      <Route
                        path="challenges"
                        element={
                          <FlagGate flag="module.challenges">
                            <Challenges />
                          </FlagGate>
                        }
                      />
                      <Route
                        path="insights"
                        element={
                          <FlagGate flag="module.insights">
                            <Insights />
                          </FlagGate>
                        }
                      />
                      <Route path="analytics" element={<Analytics />} />
                      <Route path="focus" element={<Focus />} />
                      <Route
                        path="notes"
                        element={
                          <ModuleGate module="notes">
                            <Notes />
                          </ModuleGate>
                        }
                      />
                      <Route path="goals" element={<Goals />} />
                      <Route path="reports" element={<Reports />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="export" element={<ExportPage />} />
                      <Route path="integrations" element={<Integrations />} />
                      <Route
                        path="developers"
                        element={
                          <FlagGate flag="module.developers">
                            <Developers />
                          </FlagGate>
                        }
                      />
                      <Route path="audit" element={<Audit />} />
                      <Route path="system" element={<SystemHealth />} />
                      <Route path="features" element={<Features />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="security" element={<Security />} />
                      <Route path="shortcuts" element={<Shortcuts />} />
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
              </PromptProvider>
            </ConfirmProvider>
          </FlagsProvider>
        </AuthProvider>
      </InteractionProvider>
    </MotionProvider>
  )
}
