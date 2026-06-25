import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi } from '../../api/customers';
import { referenceApi } from '../../api/reference';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';

const schema = z.object({
  alias:                z.string().min(1, 'Required'),
  description:          z.string().min(1, 'Required'),
  customer_type:        z.string().optional(),
  address:              z.string().optional(),
  primary_forwarder_id: z.string().optional(),
  special_notes:        z.string().optional(),
  is_active:            z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function CustomerForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id!).then(r => r.data.data),
    enabled: isEdit,
  });

  const { data: forwarders } = useQuery({
    queryKey: ['forwarders'],
    queryFn: () => referenceApi.forwarders().then(r => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  });

  useEffect(() => {
    if (customer) reset(customer as Partial<FormData>);
  }, [customer, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? customersApi.update(id!, data) : customersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isEdit ? 'Updated' : 'Created');
      navigate('/customers');
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <div>
      <Header title={isEdit ? 'Edit Customer' : 'New Customer'} actions={<Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>} />
      <div className="p-6">
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-2xl space-y-6">
          <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Alias *" error={errors.alias?.message} {...register('alias')} />
            <Input label="Full Name *" error={errors.description?.message} {...register('description')} />
            <Input label="Customer Type" {...register('customer_type')} />
            <Select label="Primary Forwarder" {...register('primary_forwarder_id')}>
              <option value="">— None —</option>
              {(forwarders as { id: string; name: string }[] ?? []).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
            <div className="sm:col-span-2"><Textarea label="Address" {...register('address')} /></div>
            <div className="sm:col-span-2"><Textarea label="Special Notes" {...register('special_notes')} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('is_active')} className="rounded" />
              Active
            </label>
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Create Customer'}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
