'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key?: string;
  accessor?: string;
  header: string;
  sortable?: boolean;
  className?: string;
  width?: string;
  render?: (item: T, index: number) => ReactNode;
  cell?: (item: T, index: number) => ReactNode;
}

export interface DataTablePagination {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor?: (item: T) => string;
  title?: string;
  description?: string;
  searchKey?: string;
  searchPlaceholder?: string;
  actions?: (item: T) => ReactNode;
  onRefresh?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  pagination?: DataTablePagination;
  itemsPerPage?: number;
  className?: string;
}

function cellValue<T>(item: T, column: Column<T>) {
  return (item as Record<string, unknown>)[
    column.key || column.accessor || column.header
  ];
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  title,
  description,
  searchKey,
  searchPlaceholder = 'Search…',
  actions,
  onRefresh,
  isLoading = false,
  emptyMessage = 'No records to display yet.',
  emptyAction,
  pagination,
  itemsPerPage = 10,
  className,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const hasToolbar = Boolean(title || searchKey || onRefresh);

  const filtered = useMemo(() => {
    if (!searchKey || !searchQuery) return data;
    const needle = searchQuery.toLowerCase();
    return data.filter((item) =>
      String((item as Record<string, unknown>)[searchKey] ?? '')
        .toLowerCase()
        .includes(needle)
    );
  }, [data, searchKey, searchQuery]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const left = (a as Record<string, unknown>)[sort.key];
      const right = (b as Record<string, unknown>)[sort.key];
      if (left === right) return 0;
      const result = (left as never) > (right as never) ? 1 : -1;
      return sort.direction === 'asc' ? result : -result;
    });
  }, [filtered, sort]);

  const paged = pagination
    ? sorted
    : sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const derivedTotalPages = pagination
    ? pagination.totalPages
    : Math.max(1, Math.ceil(sorted.length / itemsPerPage));

  const activePage = pagination ? pagination.currentPage : currentPage;

  const goToPage = (page: number) => {
    if (pagination) {
      pagination.onPageChange(page);
    } else {
      setCurrentPage(page);
    }
  };

  const toggleSort = (column: Column<T>) => {
    const key = column.key || column.accessor || column.header;
    setSort((previous) =>
      previous?.key === key
        ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  return (
    <div className={cn('w-full', className)}>
      {hasToolbar && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && (
              <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {searchKey && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full pl-9 sm:w-64"
                />
              </div>
            )}
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="chase-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column.key || column.accessor || column.header + index}>
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1.5 hover:text-foreground"
                    >
                      {column.header}
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {actions && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column, cellIndex) => (
                    <td key={cellIndex}>
                      <div className="skeleton h-4 w-full max-w-[9rem]" />
                    </td>
                  ))}
                  {actions && (
                    <td>
                      <div className="skeleton ml-auto h-4 w-12" />
                    </td>
                  )}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)}>
                  <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                    <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((item, index) => (
                <tr key={keyExtractor ? keyExtractor(item) : index}>
                  {columns.map((column, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn('text-foreground', column.className)}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.render
                        ? column.render(item, index)
                        : column.cell
                          ? column.cell(item, index)
                          : (cellValue(item, column) as ReactNode)}
                    </td>
                  ))}
                  {actions && (
                    <td className="text-right">{actions(item)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {derivedTotalPages > 1 && (
        <div className="mt-4 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            {(pagination?.totalItems ?? sorted.length) > 0
              ? `Showing page ${activePage} of ${derivedTotalPages} · ${
                  pagination?.totalItems ?? sorted.length
                } records`
              : 'No records'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={activePage <= 1}
              onClick={() => goToPage(activePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activePage >= derivedTotalPages}
              onClick={() => goToPage(activePage + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
