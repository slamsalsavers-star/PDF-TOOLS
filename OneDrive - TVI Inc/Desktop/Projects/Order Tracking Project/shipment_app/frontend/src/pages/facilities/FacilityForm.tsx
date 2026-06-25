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
  description: z.string().min(1, 'Required'),
  address:     z.string().optional(),
  is_active:   z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function FacilityForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: facility } = useQuery({
    queryKey: ['facility', id],
    queryFn: () => api.get(`/facilities/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  });

  useEffect(() => {
    if (facility) reset(facility as Partial<FormData>);
  }, [facility, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? api.put(`/facilities/${id}`, data) : api.post('/facilities', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facilities'] });
      toast.success(isEdit ? 'Updated' : 'Created');
      navigate('/facilities');
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <div>
      <Header title={isEdit ? 'Edit Facility' : 'New Facility'} actions={<Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>} />
      <div className="p-6">
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-lg space-y-6">
          <div className="card p-6 space-y-4">
            <Input label="Facility Name *" error={errors.description?.message} {...register('description')} />
            <Textarea label="Address" {...register('address')} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_active')} className="rounded" />Active</label>
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Create Facility'}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
