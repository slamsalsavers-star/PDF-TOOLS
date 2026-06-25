import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import type { ShippingLine } from '../../types';

const schema = z.object({
  name:         z.string().min(1, 'Required'),
  code:         z.string().min(1, 'Required'),
  api_base_url: z.string().optional(),
  api_key:      z.string().optional(),
  api_secret:   z.string().optional(),
  notes:        z.string().optional(),
  is_active:    z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function ShippingLinesPage() {
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; line?: ShippingLine }>({ open: false });
  const [showKey, setShowKey] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['shippingLines'],
    queryFn: () => api.get('/shipping-lines').then(r => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  });

  const openCreate = () => { reset({ is_active: true }); setModal({ open: true }); };
  const openEdit   = (line: ShippingLine) => { reset(line as Partial<FormData>); setModal({ open: true, line }); };

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      modal.line
        ? api.put(`/shipping-lines/${modal.line.id}`, data)
        : api.post('/shipping-lines', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shippingLines'] });
      toast.success(modal.line ? 'Updated' : 'Created');
      setModal({ open: false });
    },
    onError: () => toast.error('Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/shipping-lines/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shippingLines'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div>
      <Header title="Shipping Lines" actions={<Button onClick={openCreate}><Plus size={16} />New Shipping Line</Button>} />
      <Dialog />
      <div className="p-6">
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Name</Th><Th>Code</Th><Th>API Base URL</Th><Th>Active</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {(data as ShippingLine[] ?? []).map(l => (
                  <Tr key={l.id}>
                    <Td className="font-medium">{l.name}</Td>
                    <Td><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{l.code}</span></Td>
                    <Td className="text-xs text-gray-500 max-w-xs truncate">{l.api_base_url || '—'}</Td>
                    <Td><span className={`badge ${l.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{l.is_active ? 'Active' : 'Inactive'}</span></Td>
                    <Td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(l)} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></button>
                        <button onClick={async () => { const ok = await confirm({ message: `Delete "${l.name}"?` }); if (ok) deleteMutation.mutate(l.id); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.line ? 'Edit Shipping Line' : 'New Shipping Line'}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name *" error={errors.name?.message} {...register('name')} />
            <Input label="Code *" error={errors.code?.message} {...register('code')} placeholder="MAERSK" />
          </div>
          <Input label="API Base URL" {...register('api_base_url')} placeholder="https://api.example.com" />
          <div>
            <label className="label">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                className="input pr-10"
                {...register('api_key')}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <Input label="API Secret" type="password" {...register('api_secret')} placeholder="••••••••" />
          <Textarea label="Notes" {...register('notes')} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_active')} className="rounded" />Active</label>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting}>{modal.line ? 'Save Changes' : 'Create'}</Button>
            <Button type="button" variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
