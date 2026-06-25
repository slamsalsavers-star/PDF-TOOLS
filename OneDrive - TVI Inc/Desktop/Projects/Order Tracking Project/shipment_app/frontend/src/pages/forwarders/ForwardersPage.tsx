import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { useConfirm } from '../../hooks/useConfirm';
import type { Forwarder } from '../../types';

export default function ForwardersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['forwarders'],
    queryFn: () => api.get('/forwarders').then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/forwarders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forwarders'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({ message: `Delete forwarder "${name}"?` });
    if (ok) deleteMutation.mutate(id);
  };

  return (
    <div>
      <Header title="Forwarders" actions={<Button onClick={() => navigate('/forwarders/new')}><Plus size={16} />New Forwarder</Button>} />
      <Dialog />
      <div className="p-6">
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Name</Th><Th>Code</Th><Th>Contact</Th><Th>Email</Th><Th>Phone</Th><Th>Active</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {(data as Forwarder[] ?? []).map(f => (
                  <Tr key={f.id}>
                    <Td className="font-medium">{f.name}</Td>
                    <Td>{f.code || '—'}</Td>
                    <Td>{f.contact || '—'}</Td>
                    <Td>{f.email || '—'}</Td>
                    <Td>{f.phone || '—'}</Td>
                    <Td><span className={`badge ${f.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{f.is_active ? 'Active' : 'Inactive'}</span></Td>
                    <Td>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/forwarders/${f.id}/edit`)} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></button>
                        <button onClick={() => handleDelete(f.id, f.name)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {(!data || (data as unknown[]).length === 0) && <Tr><Td colSpan={7} className="text-center py-12 text-gray-400">No forwarders yet</Td></Tr>}
              </Tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
