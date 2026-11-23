using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using WsusRestApi.Configuration;
using WsusRestApi.Models;
using WsusRestApi.Services;

namespace WsusRestApi.Controllers
{
    public abstract class WsusApiControllerBase : ApiController
    {
        protected readonly WsusServerRegistry Registry = WsusServerRegistry.Instance;
        protected readonly WsusCacheService Cache = WsusCacheService.Instance;
        protected readonly IWsusDataService DataService = new WsusSdkDataService();

        protected string GetCorrelationId()
        {
            if (Request != null && Request.Properties.TryGetValue("CorrelationId", out var cid))
                return cid?.ToString();
            return null;
        }

        protected IHttpActionResult TryGetServer(string serverId, out WsusServerConfig serverConfig)
        {
            serverConfig = Registry.GetServerById(serverId);
            if (serverConfig == null)
            {
                return Content(
                    HttpStatusCode.NotFound,
                    ApiResponse<object>.Fail("SERVER_NOT_FOUND", $"WSUS server '{serverId}' is not configured.", GetCorrelationId()));
            }

            if (!serverConfig.Enabled)
            {
                return Content(
                    HttpStatusCode.ServiceUnavailable,
                    ApiResponse<object>.Fail("SERVER_DISABLED", $"WSUS server '{serverId}' is currently disabled.", GetCorrelationId()));
            }

            return null;
        }

        protected IHttpActionResult TryGetSnapshot(
            WsusServerConfig serverConfig,
            out CachedValue<WsusServerSnapshot> cachedSnapshot)
        {
            try
            {
                cachedSnapshot = Cache.GetOrRefreshSnapshot(serverConfig, DataService);
                return null;
            }
            catch (Exception ex)
            {
                Cache.RecordServerError(serverConfig, ex);
                cachedSnapshot = null;
                return Content(
                    HttpStatusCode.BadGateway,
                    ApiResponse<object>.Fail(
                        "WSUS_UNREACHABLE",
                        $"Unable to query WSUS server '{serverConfig.Id}' ({serverConfig.HostName}:{serverConfig.Port}): {ex.Message}",
                        GetCorrelationId()));
            }
        }

        protected ApiMeta BuildMeta<T>(string serverId, CachedValue<T> cached, PaginationMeta pagination = null)
        {
            return new ApiMeta
            {
                ServerId = serverId,
                GeneratedAtUtc = DateTime.UtcNow,
                CachedAtUtc = cached?.CachedAtUtc,
                ExpiresAtUtc = cached?.ExpiresAtUtc,
                FromCache = cached?.FromCache ?? false,
                CorrelationId = GetCorrelationId(),
                Pagination = pagination
            };
        }

        protected static PagedResult<T> Paginate<T>(IEnumerable<T> source, int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 50;
            if (pageSize > 500) pageSize = 500;

            var materialized = source as IList<T> ?? source.ToList();
            int totalItems = materialized.Count;
            int totalPages = (int)Math.Ceiling((double)totalItems / pageSize);
            var items = materialized.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            return new PagedResult<T>
            {
                Items = items,
                Pagination = new PaginationMeta
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalItems = totalItems,
                    TotalPages = totalPages
                }
            };
        }
    }
}
