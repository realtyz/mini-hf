import {
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";

export interface PaginationPagesProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * 生成分页页码数组
 * 规则：
 * - 总页数 ≤7 时显示全部页码
 * - 总页数 >7 时折叠中间部分
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}

export function PaginationPages({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationPagesProps) {
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <>
      {pages.map((pageNum, idx) =>
        pageNum === "ellipsis" ? (
          <PaginationItem key={`ellipsis-${idx}`}>
            <PaginationEllipsis />
          </PaginationItem>
        ) : (
          <PaginationItem key={pageNum}>
            <PaginationLink
              isActive={currentPage === pageNum}
              onClick={(e) => {
                e.preventDefault();
                onPageChange(pageNum);
              }}
              href="#"
              className="h-8 w-8 p-0 text-xs font-medium"
            >
              {pageNum}
            </PaginationLink>
          </PaginationItem>
        ),
      )}
    </>
  );
}
