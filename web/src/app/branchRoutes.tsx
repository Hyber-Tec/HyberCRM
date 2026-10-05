import { Navigate, Outlet, type RouteObject } from 'react-router'
import { BranchProvider } from '@/branch/BranchProvider'
import { PortalLayout } from '@/portals/PortalLayout'
import { BranchHomeRedirect, Moved, MovedStudentCalendar, RequireAuth, RequirePage, RequirePortal, TutorMoved } from './guards'

/** Lazy route helper: `page(() => import('./x'), 'X')`. */
export function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): RouteObject['lazy'] {
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
    element: (
      <RequirePage page="payRates">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/employees/PayRatesPage'), 'PayRatesPage') }],
  },
  {
    path: 'employees/payroll',
    element: (
      <RequirePage page="payroll">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/timeclock/PayrollPage'), 'PayrollPage') }],
  },
  {
    path: 'employees/time-entries',
    element: (
      <RequirePage page="timeEntries">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/timeclock/TimeEntriesPage'), 'TimeEntriesPage') }],
  },
  { path: 'sessions', element: <Navigate to="log" replace /> },
  { path: 'sessions/log', lazy: page(() => import('@/features/sessions/SessionLogListPage'), 'SessionLogListPage') },
  { path: 'sessions/progress-reports', lazy: page(() => import('@/features/reports/ProgressReportsPage'), 'ProgressReportsPage') },
  { path: 'sessions/progress-reports/:reportId', lazy: page(() => import('@/features/reports/ReportEditorPage'), 'ReportEditorPage') },
  { path: 'account', lazy: page(() => import('@/features/access/AccountPage'), 'AccountPage') },
  {
    path: 'access-control',
    element: (
      <RequirePage page="accessControl">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/access/AccessControlPage'), 'AccessControlPage') }],
  },
  { path: 'settings/:section?', lazy: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage') },
  { path: '*', element: <Navigate to="home" replace /> },
]

const tutorRoutes: RouteObject[] = [
  { index: true, element: <TutorMoved to="today" /> },
  { path: 'today', lazy: page(() => import('@/features/tutor/today/TutorTodayPage'), 'TutorTodayPage') },
  { path: 'announcements', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'TutorAnnouncementsPage') },
  { path: 'announcements/:announcementId', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'TutorAnnouncementPostPage') },
  { path: 'schedule', lazy: page(() => import('@/features/schedule/TutorSchedulePage'), 'TutorSchedulePage') },
  { path: 'availability', lazy: page(() => import('@/features/availability/TutorAvailabilityPage'), 'TutorAvailabilityPage') },
  { path: 'sessions', element: <TutorMoved to="sessions/log" /> },
  { path: 'sessions/log', lazy: page(() => import('@/features/sessions/SessionLogListPage'), 'TutorSessionLogListPage') },
  { path: 'sessions/progress-reports', lazy: page(() => import('@/features/reports/ProgressReportsPage'), 'TutorProgressReportsPage') },
  { path: 'sessions/progress-reports/:reportId', lazy: page(() => import('@/features/reports/ReportEditorPage'), 'ReportEditorPage') },
  { path: 'students', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'TutorStudentDirectoryPage') },
  { path: 'students/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'TutorStudentProfilePage') },
  { path: 'payroll', lazy: page(() => import('@/features/timeclock/TutorPayrollPage'), 'TutorPayrollPage') },
  {
    path: 'profile',
    lazy: page(() => import('@/features/tutor/profile/ProfilePage'), 'ProfilePage'),
    children: [
      { index: true, lazy: page(() => import('@/features/tutor/profile/ProfilePage'), 'ProfileIndex') },
      { path: 'account', lazy: page(() => import('@/features/tutor/profile/AccountSection'), 'AccountSection') },
      { path: 'subjects', lazy: page(() => import('@/features/tutor/profile/SubjectsSection'), 'SubjectsSection') },
      { path: 'notifications', lazy: page(() => import('@/features/tutor/profile/NotificationsSection'), 'NotificationsSection') },
      { path: 'security', lazy: page(() => import('@/features/tutor/profile/SecuritySection'), 'SecuritySection') },
      { path: 'appearance', lazy: page(() => import('@/features/tutor/profile/AppearanceSection'), 'AppearanceSection') },
      { path: '*', element: <TutorMoved to="profile" /> },
    ],
  },
  // Earlier addresses (My Info) and unknown ones.
  { path: 'my-info', element: <TutorMoved to="profile" /> },
  { path: 'my-info/profile', element: <TutorMoved to="profile/account" /> },
  { path: 'my-info/subjects', element: <TutorMoved to="profile/subjects" /> },
  { path: '*', element: <TutorMoved to="today" /> },
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

/** `/{branchId}/…`: every portal of a branch (the demo build mounts it on its own). */
export const branchRoute: RouteObject = {
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
    { path: 'progress-report/:reportId', lazy: page(() => import('@/features/reports/ReportPage'), 'ProgressReportPage') },
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
}
