import { Navigate, Outlet, type RouteObject, createBrowserRouter } from 'react-router'
import { BranchProvider } from '@/branch/BranchProvider'
import { ComingSoon } from '@/components/app/ComingSoon'
import { FullPageMessage } from '@/components/app/FullPage'
import { AppResolver } from '@/pages/public/AppResolver'
import { Landing } from '@/pages/public/Landing'
import { Login } from '@/pages/public/Login'
import { CreateBranch } from '@/pages/platform/CreateBranch'
import { PlatformAdmins } from '@/pages/platform/PlatformAdmins'
import { PlatformBranch } from '@/pages/platform/PlatformBranch'
import { PlatformHome } from '@/pages/platform/PlatformHome'
import { PlatformLayout } from '@/pages/platform/PlatformLayout'
import { PortalLayout } from '@/portals/PortalLayout'
import { BranchHomeRedirect, RequireAuth, RequirePage, RequirePortal, RequireSuperAdmin } from './guards'

/** Lazy route helper: `page(() => import('./x'), 'X')`. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): RouteObject['lazy'] {
  return async () => ({ Component: (await load())[name] as React.ComponentType })
}

const soon = (title: string, description?: string) => <ComingSoon title={title} description={description} />

const adminRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', element: soon('Home') },
  { path: 'announcements', element: soon('Announcements') },
  { path: 'scheduling', element: <Navigate to="schedule" replace /> },
  { path: 'scheduling/schedule/*', element: soon('Schedule') },
  { path: 'scheduling/audit-log', lazy: page(() => import('@/features/audit/AuditLogPage'), 'AuditLogPage') },
  { path: 'students', element: <Navigate to="directory" replace /> },
  { path: 'students/directory', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'StudentDirectoryPage') },
  { path: 'students/directory/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'StudentProfilePage') },
  { path: 'students/calendar', element: soon('Student Calendar') },
  { path: 'employees', element: <Navigate to="directory" replace /> },
  { path: 'employees/directory', lazy: page(() => import('@/features/employees/EmployeeDirectoryPage'), 'EmployeeDirectoryPage') },
  { path: 'employees/directory/:staffId', lazy: page(() => import('@/features/employees/EmployeeDetailPage'), 'EmployeeDetailPage') },
  { path: 'employees/calendar', lazy: page(() => import('@/features/employees/EmployeeCalendarPage'), 'EmployeeCalendarPage') },
  { path: 'employees/subjects', lazy: page(() => import('@/features/employees/SubjectsPage'), 'SubjectsPage') },
  {
    path: 'employees/pay-rates',
    element: <RequirePage page="payRates"><Outlet /></RequirePage>,
    children: [{ index: true, lazy: page(() => import('@/features/employees/PayRatesPage'), 'PayRatesPage') }],
  },
  { path: 'employees/payroll', element: <RequirePage page="payroll">{soon('Payroll')}</RequirePage> },
  { path: 'employees/time-entries', element: <RequirePage page="timeEntries">{soon('Time Entries')}</RequirePage> },
  { path: 'sessions', element: <Navigate to="log" replace /> },
  { path: 'sessions/log/*', element: soon('Session Log') },
  { path: 'sessions/progress-reports/*', element: soon('Progress Reports') },
  { path: 'account', lazy: page(() => import('@/features/access/AccountPage'), 'AccountPage') },
  {
    path: 'access-control',
    element: <RequirePage page="accessControl"><Outlet /></RequirePage>,
    children: [{ index: true, lazy: page(() => import('@/features/access/AccessControlPage'), 'AccessControlPage') }],
  },
  { path: 'settings', lazy: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage') },
  { path: '*', element: <Navigate to="home" replace /> },
]

const tutorRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="announcements" replace /> },
  { path: 'announcements', element: soon('Announcements') },
  { path: 'schedule', element: soon('Schedule') },
  { path: 'availability', lazy: page(() => import('@/features/availability/TutorAvailabilityPage'), 'TutorAvailabilityPage') },
  { path: 'sessions', element: <Navigate to="log" replace /> },
  { path: 'sessions/log/*', element: soon('Session Log') },
  { path: 'sessions/progress-reports/*', element: soon('Progress Reports') },
  { path: 'students', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'TutorStudentDirectoryPage') },
  { path: 'students/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'TutorStudentProfilePage') },
  { path: 'payroll', element: soon('Payroll') },
  { path: 'my-info', element: <Navigate to="profile" replace /> },
  { path: 'my-info/profile', lazy: page(() => import('@/features/tutor/MyProfilePage'), 'MyProfilePage') },
  { path: 'my-info/subjects', lazy: page(() => import('@/features/tutor/MySubjectsPage'), 'MySubjectsPage') },
  { path: '*', element: <Navigate to="announcements" replace /> },
]

const parentRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', element: soon('Upcoming Sessions') },
  { path: 'progress-reports/*', element: soon('Progress Reports') },
  { path: '*', element: <Navigate to="home" replace /> },
]

const studentRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', element: soon('Home') },
  { path: 'calendar', element: soon('Calendar') },
  { path: 'profile', element: soon('My Info') },
  { path: '*', element: <Navigate to="home" replace /> },
]

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppResolver />
      </RequireAuth>
    ),
  },
  {
    path: '/platform',
    element: (
      <RequireAuth>
        <RequireSuperAdmin>
          <PlatformLayout />
        </RequireSuperAdmin>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <PlatformHome /> },
      { path: 'branches/new', element: <CreateBranch /> },
      { path: 'branches/:branchId', element: <PlatformBranch /> },
      { path: 'admins', element: <PlatformAdmins /> },
    ],
  },
  { path: '/:branchId/signup', lazy: page(() => import('@/features/signup/BranchSignupPage'), 'BranchSignupPage') },
  {
    path: '/:branchId',
    element: (
      <RequireAuth>
        <BranchProvider>
          <Outlet />
        </BranchProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <BranchHomeRedirect /> },
      {
        path: 'admin',
        element: (
          <RequirePortal role="admin">
            <PortalLayout portal="admin" />
          </RequirePortal>
        ),
        children: adminRoutes,
      },
      {
        path: 'tutor',
        element: (
          <RequirePortal role="tutor">
            <PortalLayout portal="tutor" />
          </RequirePortal>
        ),
        children: tutorRoutes,
      },
      {
        path: 'parent',
        element: (
          <RequirePortal role="parent">
            <PortalLayout portal="parent" />
          </RequirePortal>
        ),
        children: parentRoutes,
      },
      {
        path: 'student',
        element: (
          <RequirePortal role="student">
            <PortalLayout portal="student" />
          </RequirePortal>
        ),
        children: studentRoutes,
      },
      {
        path: 'kiosk',
        element: (
          <RequirePortal role="admin">
            {soon('Kiosk', 'The demo kiosk (PIN clock in/out) arrives with the time-clock step.')}
          </RequirePortal>
        ),
      },
      { path: '*', element: <BranchHomeRedirect /> },
    ],
  },
  {
    path: '*',
    element: <FullPageMessage title="Page not found" actions={[{ label: 'Go home', to: '/' }]} />,
  },
])
