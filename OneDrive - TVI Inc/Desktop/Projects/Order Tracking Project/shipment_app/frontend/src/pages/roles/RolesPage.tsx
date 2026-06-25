import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { api } from '../../api/client';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import type { Role, Permission } from '../../types';

export default function RolesPage() {
  const qc = useQueryClient();
  const { confirm, Dialog } = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; role?: Role }>({ open: false });
  const [roleName, setRoleName] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then(r => r.data.data),
  });

  const { data: allPerms } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get('/roles/permissions').then(r => r.data.data),
  });

  const openCreate = () => { setRoleName(''); setSelectedPerms(new Set()); setModal({ open: true }); };
  const openEdit = async (role: Role) => {
    const detail = await api.get(`/roles/${role.id}`).then(r => r.data.data);
    setRoleName(role.name);
    setSelectedPerms(new Set(detail.permissions.map((p: Permission) => p.id)));
    setModal({ open: true, role });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: roleName, permission_ids: [...selectedPerms] };
      return modal.role
        ? api.put(`/roles/${modal.role.id}`, payload)
        : api.post('/roles', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(modal.role ? 'Updated' : 'Created');
      setModal({ open: false });
    },
    onError: () => toast.error('Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Deleted'); },
    onError: () => toast.error('Cannot delete system role'),
  });

  const togglePerm = (id: string) => {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const modules = [...new Set((allPerms as Permission[] ?? []).map(p => p.module))];

  return (
    <div>
      <Header title="Roles & Permissions" actions={<Button onClick={openCreate}><Plus size={16} />New Role</Button>} />
      <Dialog />
      <div className="p-6">
        <div className="card">
          {isLoading ? <div className="flex justify-center py-16 text-gray-400">Loading…</div> : (
            <Table>
              <Thead><Tr><Th>Name</Th><Th>Permissions</Th><Th>System</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {(roles as Role[] ?? []).map(r => (
                  <Tr key={r.id}>
                    <Td className="font-medium"><div className="flex items-center gap-2"><Shield size={15} className="text-brand-500" />{r.name}</div></Td>
                    <Td><span className="badge bg-brand-100 text-brand-700">{r.permission_count} permissions</span></Td>
                    <Td>{r.is_system ? <span className="badge bg-purple-100 text-purple-700">System</span> : '—'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-gray-100"><Pencil size={15} /></button>
                        {!r.is_system && (
                          <button onClick={async () => { const ok = await confirm({ message: `Delete role "${r.name}"?` }); if (ok) deleteMutation.mutate(r.id); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.role ? 'Edit Role' : 'New Role'} size="lg">
        <div className="space-y-4">
          <Input label="Role Name *" value={roleName} onChange={e => setRoleName(e.target.value)} />
          <div>
            <p className="label mb-3">Permissions</p>
            <div className="space-y-4">
              {modules.map(mod => {
                const modPerms = (allPerms as Permission[] ?? []).filter(p => p.module === mod);
                return (
                  <div key={mod}>
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-2 capitalize">{mod.replace(/_/g, ' ')}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {modPerms.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedPerms.has(p.id)}
                            onChange={() => togglePerm(p.id)}
                          />
                          {p.action}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!roleName.trim()}>
              {modal.role ? 'Save Changes' : 'Create Role'}
            </Button>
            <Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
