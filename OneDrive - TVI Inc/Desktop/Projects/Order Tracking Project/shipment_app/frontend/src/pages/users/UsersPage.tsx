import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import type { User, Role } from '../../types';

const createSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8, 'Min 8 characters'),
  full_name: z.string().min(1),
  role_id:   z.string().optional(),
});
const updateSchema = z.object({
  email:     z.string().email().optional(),
  password:  z.string().min(8).optional().or(z.literal('')),
  full_name: z.string().min(1).optional(),
  role_id:   z.string().optional(),
  is_active: z.boolean().optional(),
});
type CreateData = z.infer<typeof createSchema>;
type UpdateData = z.infer<typeof updateSchema>;

export default function UsersPage() {
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; user?: User }>({ open: false });

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then(r => r.data.data),
  });

  const { register: regCreate, handleSubmit: hsCreate, reset: resetCreate, formState: { errors: errCreate, isSubmitting: subCreate } } = useForm<CreateData>({ resolver: zodResolver(createSchema) });
  const { register: regUpdate, handleSubmit: hsUpdate, reset: resetUpdate, formState: { errors: errUpdate, isSubmitting: subUpdate } } = useForm<UpdateData>({ resolver: zodResolver(updateSchema) });

  const openCreate = () => { resetCreate(); setModal({ open: true }); };
  const openEdit   = (user: User) => { resetUpdate({ email: user.email, full_name: user.full_name, role_id: user.role_id ?? '', is_active: user.is_active }); setModal({ open: true, user }); };

  const createMutation = useMutation({
    mutationFn: (data: CreateData) => api.post('/users', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); setModal({ open: false }); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateData) => api.put(`/users/${modal.user!.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); setModal({ open: false }); },
    onError: () => toast.error('Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Deleted'); },
  });

  return (
    <div>
      <Header title="Users" actions={<Button onClick={openCreate}><Plus size={16} />New User</Button>} />
      <Dialog />
      <div className="p-6">
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Active</Th><Th>Last Login</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {(data as User[] ?? []).map(u => (
                  <Tr key={u.id}>
                    <Td className="font-medium">{u.full_name}</Td>
                    <Td>{u.email}</Td>
                    <Td>{u.role_name || '—'}</Td>
                    <Td><span className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></Td>
                    <Td className="text-xs text-gray-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></button>
                        <button onClick={async () => { const ok = await confirm({ message: `Delete user ${u.email}?` }); if (ok) deleteMutation.mutate(u.id); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.user ? 'Edit User' : 'New User'}>
        {modal.user ? (
          <form onSubmit={hsUpdate(d => updateMutation.mutate(d))} className="space-y-4">
            <Input label="Full Name" error={errUpdate.full_name?.message} {...regUpdate('full_name')} />
            <Input label="Email" type="email" error={errUpdate.email?.message} {...regUpdate('email')} />
            <Input label="New Password (leave blank to keep)" type="password" {...regUpdate('password')} />
            <Select label="Role" {...regUpdate('role_id')}>
              <option value="">— None —</option>
              {(roles as Role[] ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...regUpdate('is_active')} className="rounded" />Active</label>
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={subUpdate}>Save Changes</Button>
              <Button type="button" variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={hsCreate(d => createMutation.mutate(d))} className="space-y-4">
            <Input label="Full Name *" error={errCreate.full_name?.message} {...regCreate('full_name')} />
            <Input label="Email *" type="email" error={errCreate.email?.message} {...regCreate('email')} />
            <Input label="Password *" type="password" error={errCreate.password?.message} {...regCreate('password')} />
            <Select label="Role" {...regCreate('role_id')}>
              <option value="">— None —</option>
              {(roles as Role[] ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={subCreate}>Create User</Button>
              <Button type="button" variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
