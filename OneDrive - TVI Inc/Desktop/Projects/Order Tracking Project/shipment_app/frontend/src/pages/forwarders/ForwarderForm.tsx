import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';

const schema = z.object({
  name:      z.string().min(1, 'Required'),
  code:      z.string().optional(),
  contact:   z.string().optional(),
  email:     z.string().email().optional().or(z.literal('')),
  phone:     z.string().optional(),
  address:   z.string().optional(),
  notes:     z.string().optional(),
  is_active: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function ForwarderForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: forwarder } = useQuery({
    queryKey: ['forwarder', id],
    queryFn: () => api.get(`/forwarders/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  });

  useEffect(() => {
    if (forwarder) reset(forwarder as Partial<FormData>);
  }, [forwarder, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? api.put(`/forwarders/${id}`, data) : api.post('/forwarders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forwarders'] });
      toast.success(isEdit ? 'Updated' : 'Created');
      navigate('/forwarders');
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <div>
      <Header title={isEdit ? 'Edit Forwarder' : 'New Forwarder'} actions={<Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>} />
      <div className="p-6">
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-xl space-y-6">
          <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name *" error={errors.name?.message} {...register('name')} />
            <Input label="Code" {...register('code')} />
            <Input label="Contact Person" {...register('contact')} />
            <Input label="Email" type="email" {...register('email')} />
            <Input label="Phone" {...register('phone')} />
            <div className="sm:col-span-2"><Textarea label="Address" {...register('address')} /></div>
            <div className="sm:col-span-2"><Textarea label="Notes" {...register('notes')} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_active')} className="rounded" />Active</label>
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Create Forwarder'}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
