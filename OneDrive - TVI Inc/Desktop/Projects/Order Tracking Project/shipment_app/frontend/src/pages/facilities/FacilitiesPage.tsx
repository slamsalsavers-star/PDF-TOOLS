import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { useConfirm } from '../../hooks/useConfirm';

export default function FacilitiesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['facilities'],
    queryFn: () => api.get('/facilities').then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/facilities/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div>
      <Header title="Facilities" actions={<Button onClick={() => navigate('/facilities/new')}><Plus size={16} />New Facility</Button>} />
      <Dialog />
      <div className="p-6">
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Name</Th><Th>City</Th><Th>Address</Th><Th>Active</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {(data as Record<string, unknown>[] ?? []).map(f => (
                  <Tr key={f.id as string}>
                    <Td className="font-medium">{f.description as string}</Td>
                    <Td>{(f.city_name as string) || '—'}</Td>
                    <Td>{(f.address as string) || '—'}</Td>
                    <Td><span className={`badge ${f.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{f.is_active ? 'Active' : 'Inactive'}</span></Td>
                    <Td>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/facilities/${f.id}/edit`)} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></button>
                        <button onClick={async () => { const ok = await confirm({ message: `Delete "${f.description}"?` }); if (ok) deleteMutation.mutate(f.id as string); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
