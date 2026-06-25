import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Ship } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/auth.store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const schema = z.object({
  tenant:   z.string().min(1, 'Company slug required'),
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  const onSubmit = async (data: FormData) => {
    try {
      const loginRes = await authApi.login(data.email, data.password, data.tenant);
      setToken(loginRes.data.data.accessToken);

      const meRes = await authApi.me();
      setUser(meRes.data.data);

      navigate('/dashboard', { replace: true });
    } catch {
      toast.error('Invalid credentials or company slug');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mb-3">
            <Ship className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ShipmentMS</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Company Slug"
            placeholder="e.g. demo"
            error={errors.tenant?.message}
            {...register('tenant')}
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" className="w-full justify-center" loading={isSubmitting}>
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
