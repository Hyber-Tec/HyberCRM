import { Navigate, Outlet, type RouteObject, createBrowserRouter, useLocation, useParams, useSearchParams } from 'react-router'
import { BranchProvider } from '@/branch/BranchProvider'
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

/** An old admin address → its new place, keeping the rest of the path and the query. */
function Moved({ to }: { to: string }) {
  const { branchId, '*': rest } = useParams()
  const { search, hash } = useLocation()
  return <Navigate to={`/${branchId}/admin/${to}${rest ? `/${rest}` : ''}${search}${hash}`} replace />
}

/** Students → Calendar is gone: each student's calendar is a tab of their profile. */
function MovedStudentCalendar() {
  const { branchId } = useParams()
  const [params] = useSearchParams()
  const id = params.get('student')
  return <Navigate to={`/${branchId}/admin/students${id ? `/${encodeURIComponent(id)}/calendar` : ''}`} replace />
}

/** Lazy route helper: `page(() => import('./x'), 'X')`. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): RouteObject['lazy'] {
  return async () => ({ Component: (await load())[name] as React.ComponentType })
}

const adminRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', lazy: page(() => import('@/features/home/AdminHomePage'), 'AdminHomePage') },
  { path: 'announcements', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'AnnouncementsPage') },
  { path: 'announcements/new', lazy: page(() => import('@/features/announcements/AnnouncementEditorPage'), 'AnnouncementEditorPage') },
  { path: 'announcements/:announcementId', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'AnnouncementPostPage') },
  {
    path: 'announcements/:announcementId/edit',
    lazy: page(() => import('@/features/announcements/AnnouncementEditorPage'), 'AnnouncementEditorPage'),
  },
  { path: 'schedule/*', lazy: page(() => import('@/features/schedule/SchedulePage'), 'SchedulePage') },
  { path: 'students', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'StudentDirectoryPage') },
  { path: 'students/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'StudentProfilePage') },
  // Earlier addresses (bookmarks, links in notifications) keep working.
  { path: 'scheduling', element: <Moved to="schedule" /> },
  { path: 'scheduling/schedule/*', element: <Moved to="schedule" /> },
  { path: 'scheduling/audit-log', element: <Moved to="settings/audit-log" /> },
  { path: 'students/directory/*', element: <Moved to="students" /> },
  { path: 'students/calendar', element: <MovedStudentCalendar /> },
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
  {
    path: 'employees/payroll',
    element: <RequirePage page="payroll"><Outlet /></RequirePage>,
    children: [{ index: true, lazy: page(() => import('@/features/timeclock/PayrollPage'), 'PayrollPage') }],
  },
  {
    path: 'employees/time-entries',
    element: <RequirePage page="timeEntries"><Outlet /></RequirePage>,
    children: [{ index: true, lazy: page(() => import('@/features/timeclock/TimeEntriesPage'), 'TimeEntriesPage') }],
  },
  { path: 'sessions', element: <Navigate to="log" replace /> },
  { path: 'sessions/log', lazy: page(() => import('@/features/sessions/SessionLogListPage'), 'SessionLogListPage') },
  { path: 'sessions/progress-reports', lazy: page(() => import('@/features/sessions/ProgressReportsPage'), 'ProgressReportsPage') },
  { path: 'account', lazy: page(() => import('@/features/access/AccountPage'), 'AccountPage') },
  {
    path: 'access-control',
    element: <RequirePage page="accessControl"><Outlet /></RequirePage>,
    children: [{ index: true, lazy: page(() => import('@/features/access/AccessControlPage'), 'AccessControlPage') }],
  },
  { path: 'settings/:section?', lazy: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage') },
  { path: '*', element: <Navigate to="home" replace /> },
]

const tutorRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="announcements" replace /> },
  { path: 'announcements', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'TutorAnnouncementsPage') },
  { path: 'announcements/:announcementId', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'TutorAnnouncementPostPage') },
  { path: 'schedule', lazy: page(() => import('@/features/schedule/TutorSchedulePage'), 'TutorSchedulePage') },
  { path: 'availability', lazy: page(() => import('@/features/availability/TutorAvailabilityPage'), 'TutorAvailabilityPage') },
  { path: 'sessions', element: <Navigate to="log" replace /> },
  { path: 'sessions/log', lazy: page(() => import('@/features/sessions/SessionLogListPage'), 'TutorSessionLogListPage') },
  { path: 'sessions/progress-reports', lazy: page(() => import('@/features/sessions/ProgressReportsPage'), 'TutorProgressReportsPage') },
  { path: 'students', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'TutorStudentDirectoryPage') },
  { path: 'students/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'TutorStudentProfilePage') },
  { path: 'payroll', lazy: page(() => import('@/features/timeclock/TutorPayrollPage'), 'TutorPayrollPage') },
  { path: 'my-info', element: <Navigate to="profile" replace /> },
  { path: 'my-info/profile', lazy: page(() => import('@/features/tutor/MyProfilePage'), 'MyProfilePage') },
  { path: 'my-info/subjects', lazy: page(() => import('@/features/tutor/MySubjectsPage'), 'MySubjectsPage') },
  { path: '*', element: <Navigate to="announcements" replace /> },
]

const parentRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', lazy: page(() => import('@/features/family/FamilyPages'), 'ParentHomePage') },
  { path: 'progress-reports', lazy: page(() => import('@/features/family/FamilyPages'), 'ParentReportsPage') },
  { path: '*', element: <Navigate to="home" replace /> },
]

const studentRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', lazy: page(() => import('@/features/family/FamilyPages'), 'StudentHomePage') },
  { path: 'calendar', lazy: page(() => import('@/features/family/FamilyPages'), 'StudentPortalCalendarPage') },
  { path: 'profile', lazy: page(() => import('@/features/family/FamilyPages'), 'StudentInfoPage') },
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
      { path: 'session-log/:sessionId', lazy: page(() => import('@/features/sessions/SessionLogPage'), 'SessionLogPage') },
      { path: 'session-log/:sessionId/view', lazy: page(() => import('@/features/sessions/SessionLogPage'), 'SessionLogViewPage') },
      { path: 'progress-report/:reportId', lazy: page(() => import('@/features/sessions/ProgressReportPage'), 'ProgressReportPage') },
      {
        path: 'kiosk',
        children: [{ index: true, lazy: page(() => import('@/features/timeclock/KioskPage'), 'KioskPage') }],
        element: (
          <RequirePortal role="admin">
            <Outlet />
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
