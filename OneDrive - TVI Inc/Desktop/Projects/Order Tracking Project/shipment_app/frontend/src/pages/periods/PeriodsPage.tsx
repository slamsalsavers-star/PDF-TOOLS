import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { useConfirm } from '../../hooks/useConfirm';
import type { Period } from '../../types';

export default function PeriodsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['periods'],
    queryFn: () => api.get('/periods').then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/periods/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['periods'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => api.put(`/periods/${id}`, { status: 'closed' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['periods'] }); toast.success('Period closed'); },
  });

  return (
    <div>
      <Header title="Periods" actions={<Button onClick={() => navigate('/periods/new')}><Plus size={16} />New Period</Button>} />
      <Dialog />
      <div className="p-6">
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Name</Th><Th>Start</Th><Th>End</Th><Th>Status</Th><Th>Created By</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {(data as Period[] ?? []).map(p => (
                  <Tr key={p.id}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td>{new Date(p.start_date).toLocaleDateString()}</Td>
                    <Td>{new Date(p.end_date).toLocaleDateString()}</Td>
                    <Td>
                      <span className={`badge ${p.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </Td>
                    <Td>{p.created_by_name || '—'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {p.status === 'open' && (
                          <button onClick={() => closeMutation.mutate(p.id)} className="p-1.5 rounded text-gray-400 hover:text-orange-600 hover:bg-gray-100" title="Close period"><Lock size={15} /></button>
                        )}
                        <button onClick={() => navigate(`/periods/${p.id}/edit`)} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></button>
                        <button onClick={async () => { const ok = await confirm({ message: `Delete period "${p.name}"?` }); if (ok) deleteMutation.mutate(p.id); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {(!data || (data as unknown[]).length === 0) && <Tr><Td colSpan={6} className="text-center py-12 text-gray-400">No periods yet</Td></Tr>}
              </Tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
