import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, BookOpen, Users, Building2,
  Anchor, CalendarDays, Warehouse, Ship, LogOut, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { clsx } from 'clsx';

const nav = [
  { to: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/shipments',      label: 'Shipments',       icon: Package },
  { to: '/bookings',       label: 'Bookings',        icon: BookOpen },
  { to: '/customers',      label: 'Customers',       icon: Users },
  { to: '/forwarders',     label: 'Forwarders',      icon: Anchor },
  { to: '/periods',        label: 'Periods',         icon: CalendarDays },
  { to: '/facilities',     label: 'Facilities',      icon: Warehouse },
  { to: '/shipping-lines', label: 'Shipping Lines',  icon: Ship },
];

const adminNav = [
  { to: '/users',  label: 'Users',  icon: Users },
  { to: '/roles',  label: 'Roles',  icon: Building2 },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Ship className="text-brand-500" size={24} />
          <span className="font-bold text-lg tracking-tight">ShipmentMS</span>
        </div>
        {user && (
          <p className="text-xs text-gray-400 mt-1 truncate">{user.tenant_name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}
          >
            <Icon size={18} />
            {label}
            <ChevronRight size={14} className="ml-auto opacity-40" />
          </NavLink>
        ))}

        <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-gray-600 tracking-wider">Admin</p>
        {adminNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold shrink-0">
            {user?.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.role_name}</p>
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-white" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
