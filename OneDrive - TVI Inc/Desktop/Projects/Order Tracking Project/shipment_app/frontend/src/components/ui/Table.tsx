interface TableProps {
  children: React.ReactNode;
}
interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> { children?: React.ReactNode }
interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> { children?: React.ReactNode }

export function Table({ children }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">{children}</table>
    </div>
  );
}

export function Thead({ children }: TableProps) {
  return <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">{children}</thead>;
}

export function Tbody({ children }: TableProps) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}

export function Tr({ children, className }: TableProps & { className?: string }) {
  return <tr className={`hover:bg-gray-50 ${className ?? ''}`}>{children}</tr>;
}

export function Th({ children, ...props }: ThProps) {
  return <th className="px-4 py-3 font-semibold" {...props}>{children}</th>;
}

export function Td({ children, ...props }: TdProps) {
  return <td className="px-4 py-3 text-gray-700" {...props}>{children}</td>;
}
