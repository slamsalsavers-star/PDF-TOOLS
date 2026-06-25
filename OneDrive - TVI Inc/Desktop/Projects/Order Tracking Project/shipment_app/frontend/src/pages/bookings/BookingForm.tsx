import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { bookingsApi } from '../../api/bookings';
import { referenceApi } from '../../api/reference';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';

const schema = z.object({
  booking_number:        z.string().min(1, 'Required'),
  reference:             z.string().optional(),
  booking_type:          z.string().optional(),
  booking_received_date: z.string().optional(),
  cut_off:               z.string().optional(),
  vessel:                z.string().optional(),
  voyage:                z.string().optional(),
  eta:                   z.string().optional(),
  rail:                  z.string().optional(),
  shipping_line_id:      z.string().optional(),
  description:           z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function BookingForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [lookupLoading, setLookupLoading] = useState(false);

  const { data: booking } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingsApi.get(id!).then(r => r.data.data),
    enabled: isEdit,
  });

  const { data: shippingLines } = useQuery({
    queryKey: ['shippingLines'],
    queryFn: () => referenceApi.shippingLines().then(r => r.data.data),
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (booking) reset(booking as Partial<FormData>);
  }, [booking, reset]);

  const bookingNumber = watch('booking_number');
  const shippingLineId = watch('shipping_line_id');

  const handleLookup = async () => {
    if (!bookingNumber || !shippingLineId) {
      toast.error('Enter booking number and select a shipping line first');
      return;
    }
    setLookupLoading(true);
    try {
      const res = await bookingsApi.lookup(bookingNumber, shippingLineId);
      const d = res.data.data as Record<string, unknown>;
      if (d.vessel)  setValue('vessel',  d.vessel  as string);
      if (d.voyage)  setValue('voyage',  d.voyage  as string);
      if (d.eta)     setValue('eta',     d.eta     as string);
      if (d.cut_off) setValue('cut_off', d.cut_off as string);
      toast.success('Booking info retrieved');
    } catch {
      toast.error('Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? bookingsApi.update(id!, data) : bookingsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(isEdit ? 'Updated' : 'Created');
      navigate('/bookings');
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <div>
      <Header title={isEdit ? 'Edit Booking' : 'New Booking'} actions={
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
      } />
      <div className="p-6">
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-2xl space-y-6">
          <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Booking Number *" error={errors.booking_number?.message} {...register('booking_number')} />
            <Input label="Reference" {...register('reference')} />
            <Input label="Booking Type" {...register('booking_type')} />
            <Input label="Booking Received Date" type="date" {...register('booking_received_date')} />

            <Select label="Shipping Line" {...register('shipping_line_id')}>
              <option value="">— None —</option>
              {(shippingLines as { id: string; name: string }[] ?? []).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>

            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={handleLookup} loading={lookupLoading} className="w-full justify-center">
                <Search size={14} />Lookup Booking
              </Button>
            </div>

            <Input label="Vessel" {...register('vessel')} />
            <Input label="Voyage" {...register('voyage')} />
            <Input label="ETA" type="date" {...register('eta')} />
            <Input label="Cut-Off Date" type="date" {...register('cut_off')} />
            <Input label="Rail" {...register('rail')} />
            <div className="sm:col-span-2">
              <Textarea label="Description" {...register('description')} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Create Booking'}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
