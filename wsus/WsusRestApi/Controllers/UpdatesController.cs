using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Web.Http;
using WsusRestApi.Models;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1/servers/{serverId}/updates")]
    public class UpdatesController : WsusApiControllerBase
    {
        [HttpGet]
        [Route("")]
        public IHttpActionResult GetUpdates(
            string serverId,
            string search = null,
            string classification = null,
            string severity = null,
            bool? approved = null,
            bool? declined = null,
            string kb = null,
            int page = 1,
            int pageSize = 50)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            var snapErr = TryGetSnapshot(serverConfig, out var cached);
            if (snapErr != null) return snapErr;

            IEnumerable<UpdateDto> query = cached.Value.Updates;

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim();
                query = query.Where(u =>
                    (u.Title != null && u.Title.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (u.KbArticle != null && u.KbArticle.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0));
            }

            if (!string.IsNullOrWhiteSpace(classification))
            {
                string cls = classification.Trim();
                query = query.Where(u =>
                    string.Equals(u.Classification, cls, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.IsNullOrWhiteSpace(severity))
            {
                string sev = severity.Trim();
                query = query.Where(u =>
                    string.Equals(u.MsrcSeverity, sev, StringComparison.OrdinalIgnoreCase));
            }

            if (approved.HasValue)
            {
                query = query.Where(u => u.IsApproved == approved.Value);
            }

            if (declined.HasValue)
            {
                query = query.Where(u => u.IsDeclined == declined.Value);
            }

            if (!string.IsNullOrWhiteSpace(kb))
            {
                string kbTerm = kb.Trim();
                query = query.Where(u =>
                    u.KbArticle != null && u.KbArticle.IndexOf(kbTerm, StringComparison.OrdinalIgnoreCase) >= 0);
            }

            var paged = Paginate(
                query.OrderByDescending(u => u.ArrivalDateUtc ?? DateTime.MinValue),
                page,
                pageSize);

            return Ok(ApiResponse<IReadOnlyList<UpdateDto>>.Ok(
                paged.Items,
                BuildMeta(serverConfig.Id, cached, paged.Pagination)));
        }

        [HttpGet]
        [Route("{updateId}")]
        public IHttpActionResult GetUpdateDetails(string serverId, string updateId, int? revision = null)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            try
            {
                var cached = Cache.GetOrRefreshUpdateDetail(serverConfig, updateId, revision, DataService);
                if (cached.Value == null)
                {
                    return Content(
                        HttpStatusCode.NotFound,
                        ApiResponse<object>.Fail("UPDATE_NOT_FOUND", $"Update '{updateId}' was not found on '{serverId}'.", GetCorrelationId()));
                }

                return Ok(ApiResponse<UpdateDetailDto>.Ok(
                    cached.Value,
                    BuildMeta(serverConfig.Id, cached)));
            }
            catch (Exception ex)
            {
                return Content(
                    HttpStatusCode.BadGateway,
                    ApiResponse<object>.Fail("WSUS_QUERY_FAILED", ex.Message, GetCorrelationId()));
            }
        }
    }
}
