import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { bookingsApi } from '../../api/bookings';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { useConfirm } from '../../hooks/useConfirm';
import type { Booking } from '../../types';

export default function BookingsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', page, search],
    queryFn: () => bookingsApi.list({ page, search }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: bookingsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const handleDelete = async (id: string, bn: string) => {
    const ok = await confirm({ message: `Delete booking ${bn}?` });
    if (ok) deleteMutation.mutate(id);
  };

  return (
    <div>
      <Header title="Bookings" actions={
        <Button onClick={() => navigate('/bookings/new')}><Plus size={16} />New Booking</Button>
      } />
      <Dialog />
      <div className="p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search booking #, vessel…" className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead>
                <Tr><Th>Booking #</Th><Th>Vessel</Th><Th>Voyage</Th><Th>ETA</Th><Th>Cut-Off</Th><Th>Shipping Line</Th><Th>Actions</Th></Tr>
              </Thead>
              <Tbody>
                {data?.data?.map((b: Booking) => (
                  <Tr key={b.id}>
                    <Td><Link to={`/bookings/${b.id}/edit`} className="font-medium text-brand-600 hover:underline">{b.booking_number}</Link></Td>
                    <Td>{b.vessel || '—'}</Td>
                    <Td>{b.voyage || '—'}</Td>
                    <Td>{b.eta ? new Date(b.eta).toLocaleDateString() : '—'}</Td>
                    <Td>{b.cut_off ? new Date(b.cut_off).toLocaleDateString() : '—'}</Td>
                    <Td>{b.shipping_line_name || '—'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Link to={`/bookings/${b.id}/edit`} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></Link>
                        <button onClick={() => handleDelete(b.id, b.booking_number)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {data?.data?.length === 0 && <Tr><Td colSpan={7} className="text-center py-12 text-gray-400">No bookings found</Td></Tr>}
              </Tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
