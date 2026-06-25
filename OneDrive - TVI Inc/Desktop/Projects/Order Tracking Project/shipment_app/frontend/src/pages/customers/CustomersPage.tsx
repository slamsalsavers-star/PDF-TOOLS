import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { customersApi } from '../../api/customers';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { useConfirm } from '../../hooks/useConfirm';
import type { Customer } from '../../types';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => customersApi.list({ page, search }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: customersApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const handleDelete = async (id: string, alias: string) => {
    const ok = await confirm({ message: `Delete customer "${alias}"?` });
    if (ok) deleteMutation.mutate(id);
  };

  return (
    <div>
      <Header title="Customers" actions={
        <Button onClick={() => navigate('/customers/new')}><Plus size={16} />New Customer</Button>
      } />
      <Dialog />
      <div className="p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search alias, name…" className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Alias</Th><Th>Name</Th><Th>Type</Th><Th>Forwarder</Th><Th>Active</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {data?.data?.map((c: Customer) => (
                  <Tr key={c.id}>
                    <Td><Link to={`/customers/${c.id}/edit`} className="font-medium text-brand-600 hover:underline">{c.alias}</Link></Td>
                    <Td>{c.description}</Td>
                    <Td>{c.customer_type || '—'}</Td>
                    <Td>{c.primary_forwarder_name || '—'}</Td>
                    <Td><span className={`badge ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></Td>
                    <Td>
                      <div className="flex gap-1">
                        <Link to={`/customers/${c.id}/edit`} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></Link>
                        <button onClick={() => handleDelete(c.id, c.alias)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {data?.data?.length === 0 && <Tr><Td colSpan={6} className="text-center py-12 text-gray-400">No customers found</Td></Tr>}
              </Tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
