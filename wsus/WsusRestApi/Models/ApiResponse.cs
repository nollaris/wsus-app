using System;
using System.Collections.Generic;

namespace WsusRestApi.Models
{
    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public T Data { get; set; }
        public ApiMeta Meta { get; set; }
        public ApiError Error { get; set; }

        public static ApiResponse<T> Ok(T data, ApiMeta meta = null)
        {
            return new ApiResponse<T>
            {
                Success = true,
                Data = data,
                Meta = meta ?? new ApiMeta { GeneratedAtUtc = DateTime.UtcNow },
                Error = null
            };
        }

        public static ApiResponse<T> Fail(string code, string message, string correlationId = null)
        {
            return new ApiResponse<T>
            {
                Success = false,
                Data = default(T),
                Meta = new ApiMeta { GeneratedAtUtc = DateTime.UtcNow, CorrelationId = correlationId },
                Error = new ApiError
                {
                    Code = code,
                    Message = message
                }
            };
        }
    }

    public class ApiMeta
    {
        public ApiMeta()
        {
            GeneratedAtUtc = DateTime.UtcNow;
        }

        public string ServerId { get; set; }
        public DateTime GeneratedAtUtc { get; set; }
        public DateTime? CachedAtUtc { get; set; }
        public DateTime? ExpiresAtUtc { get; set; }
        public bool FromCache { get; set; }
        public string CorrelationId { get; set; }
        public PaginationMeta Pagination { get; set; }
    }

    public class PaginationMeta
    {
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalItems { get; set; }
        public int TotalPages { get; set; }
        public bool HasNextPage { get { return Page < TotalPages; } }
        public bool HasPreviousPage { get { return Page > 1; } }
    }

    public class ApiError
    {
        public string Code { get; set; }
        public string Message { get; set; }
    }

    public class PagedResult<T>
    {
        public IReadOnlyList<T> Items { get; set; }
        public PaginationMeta Pagination { get; set; }
    }
}
