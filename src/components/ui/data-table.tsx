'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T, index: number) => React.ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  title?: string;
  searchKey?: string;
  actions?: (item: T) => React.ReactNode;
  onRefresh?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T>(props: DataTableProps<T>) {
  const { data, columns, keyExtractor, title, searchKey, actions, onRefresh, isLoading = false, emptyMessage = 'No data available' } = props;
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<any>(null);

  const filteredData = searchKey
    ? data.filter((item: any) => String(item[searchKey]).toLowerCase().includes(searchQuery.toLowerCase()))
    : data;

  const sortedData = [...filteredData];
  if (sortConfig) {
    sortedData.sort((a: any, b: any) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSort = (key: string) => {
    if (sortConfig?.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === 'asc' ? 'Up' : 'Down';
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{title || 'Data Table'}</CardTitle>
        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
          {searchKey && (
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-8 w-64" />
            </div>
          )}
          {onRefresh && <Button variant="outline" size="sm" onClick={onRefresh}>Refresh</Button>}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" /></div> : paginatedData.length === 0 ? <div className="text-center py-12 text-muted-foreground">{emptyMessage}</div> : <><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b">{columns.map((column) => <th key={column.key} className="px-4 py-3 text-left text-sm font-medium text-muted-foreground" style={{ width: column.width || 'auto' }}><div className="flex items-center">{column.header}{column.sortable && <button className="ml-1 text-xs" onClick={() => handleSort(column.key)}>{getSortIcon(column.key)}</button>}</div></th>)}{actions && <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>}</tr></thead><tbody>{paginatedData.map((item, index) => <tr key={keyExtractor(item)} className="border-b hover:bg-muted/50">{columns.map((column) => <td key={column.key} className="px-4 py-3 text-sm">{column.render ? column.render(item, index) : (item as any)[column.key]}</td>)}{actions && <td className="px-4 py-3 text-right">{actions(item)}</td>}</tr>)}</tbody></table></div>{totalPages > 1 && <div className="flex items-center justify-between mt-6"><div className="text-sm text-muted-foreground">Showing {paginatedData.length} of {filteredData.length} items</div><div className="flex items-center space-x-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">Page {currentPage} of {totalPages}</span><Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>}</>}</CardContent>
    </Card>
  );
}