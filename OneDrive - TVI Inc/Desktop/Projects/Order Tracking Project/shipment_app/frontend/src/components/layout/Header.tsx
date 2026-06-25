import { Bell } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

interface HeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export function Header({ title, actions }: HeaderProps) {
  const { user } = useAuthStore();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        {actions}
        <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <Bell size={18} />
        </button>
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
          {user?.full_name?.[0]?.toUpperCase() ?? '?'}
        </div>
      </div>
    </header>
  );
}
