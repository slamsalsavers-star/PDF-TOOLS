import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { shipmentsApi } from '../../api/shipments';
import { referenceApi } from '../../api/reference';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';

const schema = z.object({
  order_number:         z.string().min(1, 'Required'),
  reference:            z.string().optional(),
  customer:             z.string().optional(),
  consignee:            z.string().optional(),
  carrier:              z.string().optional(),
  despatch_date:        z.string().optional(),
  place_of_destination: z.string().optional(),
  country:              z.string().optional(),
  transport_mode:       z.string().optional(),
  facility_id:          z.string().optional(),
  forwarder_id:         z.string().optional(),
  booking_id:           z.string().optional(),
  field:                z.string().optional(),
  folder_link:          z.string().optional(),
  description:          z.string().optional(),
  status_id:            z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function ShipmentForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: shipment } = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => shipmentsApi.get(id!).then(r => r.data.data),
    enabled: isEdit,
  });

  const { data: statuses }   = useQuery({ queryKey: ['statuses'],   queryFn: () => referenceApi.statuses().then(r => r.data.data) });
  const { data: facilities } = useQuery({ queryKey: ['facilities'], queryFn: () => referenceApi.facilities().then(r => r.data.data) });
  const { data: forwarders } = useQuery({ queryKey: ['forwarders'], queryFn: () => referenceApi.forwarders().then(r => r.data.data) });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (shipment) reset(shipment as Partial<FormData>);
  }, [shipment, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? shipmentsApi.update(id!, data) : shipmentsApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shipments'] });
      toast.success(isEdit ? 'Updated' : 'Created');
      navigate(`/shipments/${res.data.data.id}`);
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <div>
      <Header title={isEdit ? 'Edit Shipment' : 'New Shipment'} actions={
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
      } />
      <div className="p-6">
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-3xl space-y-6">
          <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Order Number *" error={errors.order_number?.message} {...register('order_number')} />
            <Input label="Reference" {...register('reference')} />
            <Input label="Customer" {...register('customer')} />
            <Input label="Consignee" {...register('consignee')} />
            <Input label="Carrier" {...register('carrier')} />
            <Input label="Despatch Date" type="date" {...register('despatch_date')} />
            <Input label="Destination" {...register('place_of_destination')} />
            <Input label="Country" {...register('country')} />
            <Input label="Transport Mode" {...register('transport_mode')} />
            <Input label="Field" {...register('field')} />

            <Select label="Facility" {...register('facility_id')}>
              <option value="">— None —</option>
              {(facilities as { id: string; description: string }[] ?? []).map(f => (
                <option key={f.id} value={f.id}>{f.description}</option>
              ))}
            </Select>

            <Select label="Forwarder" {...register('forwarder_id')}>
              <option value="">— None —</option>
              {(forwarders as { id: string; name: string }[] ?? []).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>

            {!isEdit && (
              <Select label="Initial Status" {...register('status_id')}>
                <option value="">— None —</option>
                {(statuses as { id: string; description: string }[] ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.description}</option>
                ))}
              </Select>
            )}

            <div className="sm:col-span-2">
              <Input label="Folder Link" {...register('folder_link')} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Description" {...register('description')} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Create Shipment'}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
