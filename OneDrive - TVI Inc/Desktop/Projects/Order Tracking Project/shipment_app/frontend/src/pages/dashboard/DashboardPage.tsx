import { useQuery } from '@tanstack/react-query';
import { Package, BookOpen, Users, CalendarDays } from 'lucide-react';
import { referenceApi } from '../../api/reference';
import { Header } from '../../components/layout/Header';
import { Link } from 'react-router-dom';

const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red:    'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  gray:   'bg-gray-100 text-gray-700',
};

export default function DashboardPage() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => referenceApi.dashboard().then(r => r.data.data),
  });

  const stats = [
    { label: 'Shipments', value: data?.counts?.shipments ?? '—', icon: Package, color: 'brand', to: '/shipments' },
    { label: 'Bookings',  value: data?.counts?.bookings  ?? '—', icon: BookOpen, color: 'green', to: '/bookings' },
    { label: 'Customers', value: data?.counts?.customers ?? '—', icon: Users, color: 'purple', to: '/customers' },
    { label: 'Open Periods', value: data?.counts?.open_periods ?? '—', icon: CalendarDays, color: 'orange', to: '/periods' },
  ];

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                  <Icon size={20} className="text-brand-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent shipments */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Shipments</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(data?.recent_shipments as Record<string, unknown>[] ?? []).map((s: Record<string, unknown>) => (
              <Link
                key={s.id as string}
                to={`/shipments/${s.id}`}
                className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">{s.order_number as string}</p>
                  <p className="text-xs text-gray-500 truncate">{(s.customer as string) || '—'}</p>
                </div>
                {Boolean(s.status) && (
                  <span className={`badge ${COLOR_MAP[(s.status_color as string) ?? 'gray']}`}>
                    {s.status as string}
                  </span>
                )}
                <p className="text-xs text-gray-400">
                  {s.despatch_date ? new Date(s.despatch_date as string).toLocaleDateString() : '—'}
                </p>
              </Link>
            ))}
            {(!data?.recent_shipments || (data.recent_shipments as unknown[]).length === 0) && (
              <p className="px-6 py-8 text-center text-sm text-gray-400">No shipments yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
