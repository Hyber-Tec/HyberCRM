import { type RouteObject, createBrowserRouter } from 'react-router'
import { FullPageMessage } from '@/components/app/FullPage'
import { AppResolver } from '@/pages/public/AppResolver'
import { Login } from '@/pages/public/Login'
import { RootRoute } from '@/pages/public/RootRoute'
import { CreateBranch } from '@/pages/platform/CreateBranch'
import { PlatformAdmins } from '@/pages/platform/PlatformAdmins'
import { PlatformBranch } from '@/pages/platform/PlatformBranch'
import { PlatformHome } from '@/pages/platform/PlatformHome'
import { PlatformInquiries } from '@/pages/platform/PlatformInquiries'
import { PlatformLayout } from '@/pages/platform/PlatformLayout'
import { branchRoute, page } from './branchRoutes'
import { RequireAuth, RequireSuperAdmin } from './guards'

const routes: RouteObject[] = [
  { path: '/', element: <RootRoute /> },
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
      { path: 'inquiries', element: <PlatformInquiries /> },
      { path: 'admins', element: <PlatformAdmins /> },
    ],
  },
  { path: '/:branchId/signup', lazy: page(() => import('@/features/signup/BranchSignupPage'), 'BranchSignupPage') },
  branchRoute,
  {
    path: '*',
    element: <FullPageMessage title="Page not found" actions={[{ label: 'Go home', to: '/' }]} />,
  },
]

export const router = createBrowserRouter(routes)
