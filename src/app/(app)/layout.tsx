import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrganizationProvider } from '@/components/layout/OrganizationContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <OrganizationProvider>
        <div className="flex h-screen w-full bg-gray-50">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </OrganizationProvider>
    </ProtectedRoute>
  );
}
