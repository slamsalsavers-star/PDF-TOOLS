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
import { Input, Select, Textarea } from '../../components/ui/Input';

const schema = z.object({
  name:       z.string().min(1, 'Required'),
  start_date: z.string().min(1, 'Required'),
  end_date:   z.string().min(1, 'Required'),
  status:     z.enum(['open', 'closed']).optional(),
  notes:      z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function PeriodForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: period } = useQuery({
    queryKey: ['period', id],
    queryFn: () => api.get(`/periods/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (period) reset(period as Partial<FormData>);
  }, [period, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? api.put(`/periods/${id}`, data) : api.post('/periods', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] });
      toast.success(isEdit ? 'Updated' : 'Created');
      navigate('/periods');
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <div>
      <Header title={isEdit ? 'Edit Period' : 'New Period'} actions={<Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>} />
      <div className="p-6">
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-lg space-y-6">
          <div className="card p-6 space-y-4">
            <Input label="Period Name *" error={errors.name?.message} {...register('name')} placeholder="e.g. Q1 2026" />
            <Input label="Start Date *" type="date" error={errors.start_date?.message} {...register('start_date')} />
            <Input label="End Date *" type="date" error={errors.end_date?.message} {...register('end_date')} />
            {isEdit && (
              <Select label="Status" {...register('status')}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
            )}
            <Textarea label="Notes" {...register('notes')} />
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Create Period'}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
