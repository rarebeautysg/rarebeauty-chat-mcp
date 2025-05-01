import React, { HTMLAttributes, TableHTMLAttributes, HTMLProps } from 'react';

// Use HTMLProps for proper typing
type TableProps = HTMLProps<HTMLTableElement>;
type TableHeadProps = HTMLProps<HTMLTableSectionElement>;
type TableBodyProps = HTMLProps<HTMLTableSectionElement>;
type TableRowProps = HTMLProps<HTMLTableRowElement>;
type TableHeaderProps = HTMLProps<HTMLTableCellElement>;
type TableCellProps = HTMLProps<HTMLTableCellElement>;

export const TableRenderer: React.FC<TableProps> = ({ children, ...props }) => {
  return (
    <div className="overflow-x-auto my-3 rounded border border-gray-200 shadow-sm">
      <table
        className="border-collapse bg-white text-left text-sm"
        style={{ tableLayout: 'auto', margin: '0 auto' }}
        {...props}
      >
        {children}
      </table>
    </div>
  );
};

export const TableHead: React.FC<TableHeadProps> = ({ children, ...props }) => {
  return <thead className="bg-gray-100 font-semibold uppercase" {...props}>{children}</thead>;
};

export const TableBody: React.FC<TableBodyProps> = ({ children, ...props }) => {
  return <tbody className="divide-y divide-gray-200" {...props}>{children}</tbody>;
};

export const TableRow: React.FC<TableRowProps> = ({ children, ...props }) => {
  return <tr className="hover:bg-gray-50" {...props}>{children}</tr>;
};

export const TableHeader: React.FC<TableHeaderProps> = ({ children, ...props }) => {
  return (
    <th className="px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 last:border-r-0" {...props}>
      {children}
    </th>
  );
};

export const TableCell: React.FC<TableCellProps> = ({ children, ...props }) => {
  return (
    <td className="px-3 py-2 border-r border-gray-200 last:border-r-0" {...props}>
      {children}
    </td>
  );
}; 