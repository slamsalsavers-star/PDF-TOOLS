import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { shipmentsApi } from '../../api/shipments';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { useConfirm } from '../../hooks/useConfirm';
import type { Shipment } from '../../types';

const COLOR_MAP: Record<string, string> = {
  blue:'bg-blue-100 text-blue-700', green:'bg-green-100 text-green-700',
  yellow:'bg-yellow-100 text-yellow-700', red:'bg-red-100 text-red-700',
  purple:'bg-purple-100 text-purple-700', orange:'bg-orange-100 text-orange-700',
  gray:'bg-gray-100 text-gray-700',
};

export default function ShipmentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', page, search],
    queryFn: () => shipmentsApi.list({ page, search }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: shipmentsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shipments'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const handleDelete = async (id: string, orderNumber: string) => {
    const ok = await confirm({ message: `Delete shipment ${orderNumber}?` });
    if (ok) deleteMutation.mutate(id);
  };

  return (
    <div>
      <Header title="Shipments" actions={
        <Button onClick={() => navigate('/shipments/new')}><Plus size={16} />New Shipment</Button>
      } />
      <Dialog />
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search order, customer…"
              className="pl-9"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="card">
          {isLoading ? (
            <div className="flex justify-center py-16 text-gray-400">Loading…</div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Order #</Th><Th>Customer</Th><Th>Facility</Th>
                  <Th>Despatch</Th><Th>Status</Th><Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data?.data?.map((s: Shipment) => (
                  <Tr key={s.id}>
                    <Td>
                      <Link to={`/shipments/${s.id}`} className="font-medium text-brand-600 hover:underline">
                        {s.order_number}
                      </Link>
                    </Td>
                    <Td>{s.customer || '—'}</Td>
                    <Td>{s.facility_name || '—'}</Td>
                    <Td>{s.despatch_date ? new Date(s.despatch_date).toLocaleDateString() : '—'}</Td>
                    <Td>
                      {s.current_status ? (
                        <span className={`badge ${COLOR_MAP[s.status_color ?? 'gray']}`}>
                          {s.current_status}
                        </span>
                      ) : '—'}
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Link to={`/shipments/${s.id}`} className="p-1.5 rounded text-gray-400 hover:text-brand-600 hover:bg-gray-100">
                          <Eye size={15} />
                        </Link>
                        <Link to={`/shipments/${s.id}/edit`} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100">
                          <Pencil size={15} />
                        </Link>
                        <button
                          onClick={() => handleDelete(s.id, s.order_number)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {data?.data?.length === 0 && (
                  <Tr><Td colSpan={6} className="text-center py-12 text-gray-400">No shipments found</Td></Tr>
                )}
              </Tbody>
            </Table>
          )}

          {/* Pagination */}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
              <span>{data.meta.total} total</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <span className="px-3 py-1.5">Page {page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
