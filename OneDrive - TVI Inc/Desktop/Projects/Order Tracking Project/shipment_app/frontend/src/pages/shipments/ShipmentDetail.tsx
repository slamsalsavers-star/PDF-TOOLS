import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, ArrowLeft, Plus } from 'lucide-react';
import { shipmentsApi } from '../../api/shipments';
import { referenceApi } from '../../api/reference';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';

const COLOR_MAP: Record<string, string> = {
  blue:'bg-blue-100 text-blue-700', green:'bg-green-100 text-green-700',
  yellow:'bg-yellow-100 text-yellow-700', red:'bg-red-100 text-red-700',
  purple:'bg-purple-100 text-purple-700', orange:'bg-orange-100 text-orange-700',
  gray:'bg-gray-100 text-gray-700',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusId, setStatusId] = useState('');
  const [notes, setNotes] = useState('');
  const [comment, setComment] = useState('');

  const { data: shipment, isLoading } = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => shipmentsApi.get(id!).then(r => r.data.data),
  });

  const { data: statuses } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => referenceApi.statuses().then(r => r.data.data),
  });

  const statusMutation = useMutation({
    mutationFn: () => shipmentsApi.addStatus(id!, { status_id: statusId, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', id] });
      toast.success('Status added');
      setStatusId(''); setNotes('');
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => shipmentsApi.addComment(id!, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', id] });
      toast.success('Comment added');
      setComment('');
    },
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!shipment) return <div className="p-8 text-gray-400">Not found</div>;

  const s = shipment as unknown as Record<string, unknown>;

  return (
    <div>
      <Header title={s.order_number as string} actions={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={14} />Back</Button>
          <Link to={`/shipments/${id}/edit`}><Button size="sm"><Pencil size={14} />Edit</Button></Link>
        </div>
      } />

      <div className="p-6 space-y-6 max-w-5xl">
        {/* Details */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Shipment Details</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Field label="Order #"    value={s.order_number as string} />
            <Field label="Reference"  value={s.reference as string} />
            <Field label="Customer"   value={s.customer as string} />
            <Field label="Consignee"  value={s.consignee as string} />
            <Field label="Carrier"    value={s.carrier as string} />
            <Field label="Despatch"   value={s.despatch_date ? new Date(s.despatch_date as string).toLocaleDateString() : null} />
            <Field label="Destination" value={s.place_of_destination as string} />
            <Field label="Country"    value={s.country as string} />
            <Field label="Mode"       value={s.transport_mode as string} />
            <Field label="Facility"   value={s.facility_name as string} />
            <Field label="Forwarder"  value={s.forwarder_name as string} />
            <Field label="Booking"    value={s.booking_number as string} />
            {Boolean(s.booking_number) && <>
              <Field label="Vessel"   value={s.vessel as string} />
              <Field label="Voyage"   value={s.voyage as string} />
              <Field label="ETA"      value={s.eta ? new Date(s.eta as string).toLocaleDateString() : null} />
              <Field label="Cut-Off"  value={s.cut_off ? new Date(s.cut_off as string).toLocaleDateString() : null} />
            </>}
          </dl>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status history */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Status History</h2>
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {(s.statuses as Record<string, unknown>[] ?? []).map((st: Record<string, unknown>) => (
                <div key={st.id as string} className="flex items-start gap-3">
                  <span className={`badge mt-0.5 ${COLOR_MAP[(st.color as string) ?? 'gray']}`}>{st.status as string}</span>
                  <div>
                    <p className="text-xs text-gray-500">{st.created_by_name as string} · {new Date(st.created_at as string).toLocaleString()}</p>
                    {Boolean(st.notes) && <p className="text-sm text-gray-700">{st.notes as string}</p>}
                  </div>
                </div>
              ))}
              {(s.statuses as unknown[])?.length === 0 && <p className="text-sm text-gray-400">No status history</p>}
            </div>
            <div className="space-y-2 border-t pt-4">
              <Select value={statusId} onChange={e => setStatusId(e.target.value)}>
                <option value="">Select new status…</option>
                {(statuses as { id: string; description: string }[] ?? []).map(st => (
                  <option key={st.id} value={st.id}>{st.description}</option>
                ))}
              </Select>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="input resize-none"
              />
              <Button size="sm" disabled={!statusId} onClick={() => statusMutation.mutate()} loading={statusMutation.isPending}>
                <Plus size={14} />Add Status
              </Button>
            </div>
          </div>

          {/* Comments */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Comments</h2>
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {(s.comments as Record<string, unknown>[] ?? []).map((c: Record<string, unknown>) => (
                <div key={c.id as string} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700">{c.comment as string}</p>
                  <p className="text-xs text-gray-400 mt-1">{c.created_by_name as string} · {new Date(c.created_at as string).toLocaleString()}</p>
                </div>
              ))}
              {(s.comments as unknown[])?.length === 0 && <p className="text-sm text-gray-400">No comments yet</p>}
            </div>
            <div className="border-t pt-4 space-y-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                className="input resize-none"
              />
              <Button size="sm" disabled={!comment.trim()} onClick={() => commentMutation.mutate()} loading={commentMutation.isPending}>
                <Plus size={14} />Add Comment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
